<template>
  <q-page class="doubles-queue-page">
    <!-- Loading State -->
    <div
      v-if="clubLoadingState === 'loading'"
      class="flex flex-center"
      style="min-height: 90vh"
    >
      <q-spinner-gears size="60px" color="primary" />
    </div>

    <!-- Club Not Found State -->
    <div
      v-else-if="clubLoadingState === 'not-found'"
      class="flex flex-center column q-pa-lg"
      style="min-height: 90vh"
    >
      <q-icon name="search_off" size="120px" color="grey-5" />
      <div class="text-h4 text-weight-bold q-mt-md">Club Not Found</div>
      <div
        class="text-body1 text-grey-9 q-mt-sm text-center"
        style="max-width: 420px"
        v-html="clubErrorMessage"
      ></div>
      <div class="row q-gutter-sm q-mt-lg justify-center">
        <q-btn
          color="primary"
          label="Back to Home"
          icon="arrow_back"
          size="md"
          @click="goHome"
          unelevated
          rounded
        />
      </div>
    </div>

    <!-- Club Not Activated State -->
    <div
      v-else-if="clubLoadingState === 'unpublished'"
      class="flex flex-center column q-pa-lg"
      style="min-height: 90vh"
    >
      <q-icon name="lock_clock" size="120px" color="grey-5" />
      <div class="text-h4 text-weight-bold q-mt-md">Not Yet Activated</div>
      <div
        class="text-body1 text-grey-9 q-mt-sm text-center"
        style="max-width: 420px"
        v-html="clubErrorMessage"
      ></div>
      <div class="row q-gutter-sm q-mt-lg justify-center">
        <q-btn
          color="primary"
          label="Back to Home"
          icon="arrow_back"
          size="md"
          @click="goHome"
          unelevated
          rounded
        />
        <q-btn
          color="accent"
          label="Pay"
          icon="payment"
          size="md"
          @click="() => callPayment({ clubId: currentClubId })"
          :loading="paymentLoading"
          unelevated
          rounded
        />
      </div>
    </div>

    <!-- Main App Content -->
    <template v-else>
      <!-- Header Section -->
      <ClubHeader
        :club-name="clubName"
        :club-logo-url="getClubLogoUrl"
        :is-current-user-admin="isCurrentUserAdmin"
        :tts-enabled="ttsEnabled"
        :is-speaking="isSpeaking"
        :unread-club-feedback-count="unreadClubFeedbackCount"
        @show-leaderboard="showLeaderboardDialog = true"
        @show-settings="showSettingsDialog = true"
        @copy-link="copyClubLink"
        @toggle-tts="
          ttsEnabled
            ? ((ttsEnabled = false), clearSpeechQueue())
            : (ttsEnabled = true)
        "
      />
      <q-ajax-bar
        v-if="isCurrentUserAdmin"
        ref="syncAjaxBar"
        position="top"
        color="amber-4"
        size="3px"
      />
      <q-ajax-bar
        ref="dataFetchBar"
        position="top"
        color="amber-4"
        size="3px"
      />

      <LeaderboardDialog
        v-model="showLeaderboardDialog"
        :leaderboard="clubLeaderboard"
        :loading="clubLeaderboardLoading"
      />

      <ClubLayout
        v-model="activeMobileTab"
        :players-count="players.length"
        :queue-count="queue.length"
        :matches-count="filteredMatches.length"
        :tab-shake-states="tabShakeStates"
        :is-online="isOnline"
        :club-loading-state="clubLoadingState"
        :club-error-message="clubErrorMessage"
        :is-current-user-member="isCurrentUserMember"
        :is-open-play="isOpenPlay"
        @dismiss-error="clubLoadingState = 'loaded'"
        @join-club="handleJoinClub"
      >
        <!-- Desktop Players Column -->
        <template #players-desktop>
          <q-card class="players-card" flat bordered>
            <q-card-section class="players-header text-white q-pa-none">
              <q-toolbar class="q-pa-md">
                <q-toolbar-title>
                  <q-icon name="people" class="q-mr-sm" />
                  Players ({{ players.length }})
                </q-toolbar-title>
                <q-select
                  v-model="sortBy"
                  :options="sortOptions"
                  dense
                  outlined
                  dark
                  color="white"
                  emit-value
                  map-options
                  style="min-width: 170px"
                >
                  <template v-slot:prepend>
                    <q-icon name="sort" />
                  </template>
                </q-select>
                <q-btn
                  v-if="isCurrentUserAdmin"
                  color="white"
                  @click="showAddPlayerDialog = true"
                  icon="person_add"
                  flat
                  round
                  dense
                >
                  <q-tooltip
                    anchor="top middle"
                    self="bottom middle"
                    :offset="[8, 8]"
                    >Add player</q-tooltip
                  >
                </q-btn>
                <q-btn
                  v-if="isCurrentUserAdmin"
                  color="white"
                  @click="addAllPlayersToQueue"
                  :disable="allPlayersInQueue"
                  icon="group_add"
                  flat
                  round
                  dense
                >
                  <q-tooltip
                    anchor="top middle"
                    self="bottom middle"
                    :offset="[8, 8]"
                    >Add all</q-tooltip
                  >
                </q-btn>
              </q-toolbar>
            </q-card-section>
            <q-card-section class="q-pa-none">
              <div class="card-content">
                <!-- Search bar -->
                <div class="q-pa-sm players-search">
                  <q-input
                    v-model="searchPlayers"
                    dense
                    outlined
                    placeholder="Search players..."
                    clearable
                  >
                    <template v-slot:prepend>
                      <q-icon name="search" />
                    </template>
                  </q-input>
                </div>
                <PlayerList
                  :players="displayPlayers"
                  :current-user-id="currentUserId"
                  :sort-by="sortBy"
                  :show-actions="isCurrentUserAdmin"
                  :show-requeue-button="isCurrentUserAdmin"
                  :show-feedback-button="!isCurrentUserAdmin"
                  :empty-icon="'people'"
                  :empty-title="
                    searchPlayers
                      ? 'No matching players'
                      : 'No players added yet'
                  "
                  :empty-subtitle="
                    searchPlayers
                      ? 'Try a different search'
                      : 'Click the + button to add your first player'
                  "
                  :empty-action="!searchPlayers"
                  @player-edit="openEditPlayerDialog"
                  @player-avatar-click="openPlayerReportDialog"
                  @player-commend="(p) => openPlayerReportDialog(p, 'commend')"
                  @player-report="(p) => openPlayerReportDialog(p, 'report')"
                  @player-remove="removePlayer"
                  @player-requeue="requeuePlayer"
                  @empty-action="showAddPlayerDialog = true"
                />
              </div>
            </q-card-section>
          </q-card>
        </template>

        <!-- Desktop Queue Column -->
        <template #queue-desktop>
          <q-card class="queue-card" flat bordered>
            <q-card-section class="queue-header text-white q-pa-none">
              <q-toolbar class="q-pa-md">
                <q-toolbar-title>
                  <q-icon name="queue" class="q-mr-sm" />
                  Players Queue ({{ queue.length }})
                </q-toolbar-title>
                <div class="queue-stats">
                  <q-chip
                    v-for="cat in queueStats.categories"
                    :key="cat.label"
                    :label="cat.count.toString()"
                    :color="cat.color"
                    text-color="white"
                    size="sm"
                  >
                    <q-tooltip
                      anchor="top middle"
                      self="bottom middle"
                      :offset="[0, 4]"
                      >{{ cat.label }}</q-tooltip
                    >
                  </q-chip>
                </div>
              </q-toolbar>
            </q-card-section>
            <q-card-section class="q-pa-none">
              <div class="card-content">
                <PlayerList
                  :players="queue"
                  :current-user-id="currentUserId"
                  :show-position="true"
                  :show-queue-time="true"
                  :is-in-queue="true"
                  :show-actions="isCurrentUserAdmin"
                  :show-requeue-button="false"
                  :show-feedback-button="!isCurrentUserAdmin"
                  :empty-icon="'queue'"
                  :empty-title="'Queue is empty'"
                  :empty-subtitle="'Add players to start generating matches'"
                  @player-avatar-click="openPlayerReportDialog"
                  @player-commend="(p) => openPlayerReportDialog(p, 'commend')"
                  @player-report="(p) => openPlayerReportDialog(p, 'report')"
                  @player-remove="removeFromQueue"
                />
              </div>
            </q-card-section>
            <q-card-section v-if="isCurrentUserAdmin">
              <!-- Match Type Selector -->
              <div class="q-mb-sm">
                <q-select
                  v-model="matchType"
                  :options="matchTypeOptions"
                  label="Match Type"
                  dense
                  outlined
                  emit-value
                  map-options
                  color="accent"
                >
                  <template v-slot:prepend>
                    <q-icon
                      :name="matchType === 'singles' ? 'person' : 'people'"
                    />
                  </template>
                </q-select>
              </div>

              <div v-if="isCurrentUserAdmin" class="q-mb-sm">
                <q-select
                  v-model="matchmakingMode"
                  :options="matchmakingModeOptions"
                  label="Matchmaking mode"
                  dense
                  outlined
                  emit-value
                  map-options
                  color="accent"
                >
                  <template v-slot:prepend>
                    <q-icon name="balance" />
                  </template>
                  <template v-slot:option="scope">
                    <q-item
                      v-bind="scope.itemProps"
                      :disable="scope.opt.disable"
                      :class="scope.opt.disable ? 'text-grey-5' : ''"
                    >
                      <q-item-section>
                        <q-item-label>
                          {{ scope.opt.label }}
                          <q-badge
                            v-if="scope.opt.disable"
                            color="amber"
                            text-color="white"
                            label="Pro"
                            class="q-ml-xs"
                            dense
                          />
                        </q-item-label>
                        <q-item-label
                          v-if="scope.opt.description"
                          caption
                          class="text-grey-7"
                        >
                          {{ scope.opt.description }}
                        </q-item-label>
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>
              </div>
              <div v-if="isCurrentUserAdmin" class="row q-gutter-sm">
                <!-- Left: dropdown (Pro Pick) or Auto (other modes) -->
                <div class="col" style="min-width: 0">
                  <q-btn-dropdown
                    v-if="matchmakingMode === 'strict_balance'"
                    class="allstar-draft-dropdown full-width"
                    color="accent"
                    size="md"
                    split
                    stack
                    content-class="no-scrollbar"
                    :icon="
                      allStarSortDirection === 'desc'
                        ? 'trending_up'
                        : 'trending_down'
                    "
                    :label="
                      allStarSortDirection === 'desc'
                        ? 'Top First'
                        : 'Bottom First'
                    "
                    :disable="!canGenerateMatches()"
                    :disable-main="!canGenerateMatches()"
                    no-caps
                    @click="generateNewMatches"
                  >
                    <q-tooltip
                      anchor="top middle"
                      self="bottom middle"
                      :offset="[8, 8]"
                      v-if="!canGenerateMatches()"
                    >
                      {{
                        matchType === 'singles'
                          ? 'Need at least 2 players'
                          : 'Need at least 4 players'
                      }}
                    </q-tooltip>
                    <q-list>
                      <q-item
                        clickable
                        v-close-popup
                        @click="allStarSortDirection = 'desc'"
                      >
                        <q-item-section>
                          <q-item-label>Top Rated First</q-item-label>
                          <q-item-label caption
                            >Higher-rated players draft first</q-item-label
                          >
                        </q-item-section>
                      </q-item>
                      <q-item
                        clickable
                        v-close-popup
                        @click="allStarSortDirection = 'asc'"
                      >
                        <q-item-section>
                          <q-item-label>Bottom Rated First</q-item-label>
                          <q-item-label caption
                            >Lower-rated players draft first</q-item-label
                          >
                        </q-item-section>
                      </q-item>
                    </q-list>
                  </q-btn-dropdown>
                  <!-- Other modes: plain Auto button -->
                  <q-btn
                    v-else
                    class="full-width"
                    color="accent"
                    @click="generateNewMatches"
                    size="md"
                    icon="auto_awesome"
                    :disable="!canGenerateMatches()"
                    stack
                    no-caps
                  >
                    <span class="gt-xs">Auto</span>
                    <span class="lt-sm">Auto</span>
                    <q-tooltip
                      anchor="top middle"
                      self="bottom middle"
                      :offset="[8, 8]"
                      v-if="!canGenerateMatches()"
                    >
                      {{
                        matchType === 'singles'
                          ? 'Need at least 2 players'
                          : 'Need at least 4 players'
                      }}
                    </q-tooltip>
                  </q-btn>
                </div>
                <!-- Right: Manual -->
                <div class="col" style="min-width: 0">
                  <q-btn
                    class="full-width"
                    color="accent"
                    @click="startManualSelection"
                    size="md"
                    icon="touch_app"
                    :disable="queue.length < (matchType === 'singles' ? 2 : 4)"
                    outline
                    stack
                    no-caps
                  >
                    <span class="gt-xs">Manual</span>
                    <span class="lt-sm">Manual</span>
                    <q-tooltip
                      anchor="top middle"
                      self="bottom middle"
                      :offset="[8, 8]"
                      v-if="queue.length < (matchType === 'singles' ? 2 : 4)"
                    >
                      {{
                        matchType === 'singles'
                          ? 'Need 2+ players'
                          : 'Need 4+ players'
                      }}
                    </q-tooltip>
                  </q-btn>
                </div>
              </div>
              <PayBanner
                v-if="isClubSubscriptionExpired"
                class="q-mt-sm"
                message="Competitive & Pro Pick are Pro features."
                :loading="paymentLoading"
                @pay="callPayment({ clubId: currentClubId })"
              />
              <div class="text-caption text-grey-6 q-mt-sm text-center">
                {{ getMatchGenerationHint() }}
              </div>

              <!-- Waiting Players Info -->
              <div
                v-if="
                  queue.length > 0 &&
                  queue.length % (matchType === 'singles' ? 2 : 4) !== 0
                "
                class="q-mt-md"
              >
                <q-separator />
                <div class="text-caption text-orange q-mt-sm">
                  <q-icon name="schedule" size="xs" class="q-mr-xs" />
                  {{ getWaitingPlayersInfo() }}
                </div>
              </div>
            </q-card-section>
          </q-card>
        </template>

        <!-- Desktop Matches Column -->
        <template #matches-desktop>
          <q-card class="matches-card" flat bordered>
            <q-card-section class="matches-header text-white q-pa-none">
              <q-toolbar class="q-pa-md">
                <q-toolbar-title>
                  <q-icon name="sports_tennis" class="q-mr-sm" />
                  Matches ({{ filteredMatches.length }})
                </q-toolbar-title>
                <q-select
                  v-model="matchesFilterBy"
                  :options="matchesFilterOptions"
                  dense
                  outlined
                  dark
                  color="white"
                  emit-value
                  map-options
                  style="min-width: 150px"
                >
                  <template v-slot:prepend>
                    <q-icon name="filter_list" />
                  </template>
                </q-select>
              </q-toolbar>
            </q-card-section>
            <q-card-section class="q-pa-none">
              <div class="card-content">
                <q-list separator v-if="filteredMatches.length > 0">
                  <template v-if="matchesFilterBy === 'completed'">
                    <q-item
                      v-for="match in filteredMatches"
                      :key="match.id"
                      class="q-px-sm bg-green-1"
                    >
                      <q-item-section>
                        <MatchResult
                          :teamA="match.teamA"
                          :teamB="match.teamB"
                          :teamAScore="match.teamAScore"
                          :teamBScore="match.teamBScore"
                          :winProbability="match.winProbability"
                          :startedAt="match.startedAt?.toString()"
                          :completedAt="match.completedAt"
                          :meta="{
                            generatedBy: match.generatedBy,
                            editedBy: match.editedBy,
                            scoredBy: match.scoredBy,
                            cancelledBy: match.cancelledBy,
                            matchmakingMode: match.matchmakingMode,
                            generationType: match.generationType,
                            isEdited: match.isEdited,
                            originalMatchup: match.originalMatchup,
                            originalTeamA: match.originalTeamA,
                            originalTeamB: match.originalTeamB,
                          }"
                        />
                      </q-item-section>
                    </q-item>
                  </template>
                  <template v-else>
                    <MatchCard
                      v-for="(match, index) in filteredMatches"
                      :key="match.id"
                      :match="match"
                      :can-start="hasAvailableSlot"
                      :show-actions="isCurrentUserAdmin"
                      @completeMatch="openMatchResultDialog(index)"
                      @editMatch="editMatch(index)"
                      @startMatch="startMatch(index)"
                      @cancelMatch="cancelMatch(index)"
                      @custom-announce="handleCustomAnnounce"
                    />
                  </template>
                </q-list>
                <EmptyState
                  v-else
                  icon="sports_tennis"
                  title="No active matches"
                  subtitle="Generate matches from the queue to get started"
                />
              </div>
            </q-card-section>
          </q-card>
        </template>

        <!-- Mobile Players Tab -->
        <template #players-mobile>
          <q-card class="players-card mobile-card" flat bordered>
            <q-card-section class="q-pa-none">
              <div class="card-content mobile-card-content">
                <!-- Mobile controls in a compact header -->
                <div class="q-pa-sm q-pb-sm">
                  <div class="row items-center justify-between">
                    <q-select
                      v-model="sortBy"
                      :options="sortOptions"
                      dense
                      outlined
                      emit-value
                      map-options
                      style="min-width: 120px"
                      class="q-mr-sm"
                    >
                      <template v-slot:prepend>
                        <q-icon name="sort" />
                      </template>
                    </q-select>
                    <q-btn
                      v-if="isCurrentUserAdmin"
                      color="accent"
                      @click="showAddPlayerDialog = true"
                      icon="person_add"
                      flat
                      round
                      dense
                    >
                      <q-tooltip
                        anchor="top middle"
                        self="bottom middle"
                        :offset="[8, 8]"
                        >Add player</q-tooltip
                      >
                    </q-btn>
                    <q-btn
                      v-if="isCurrentUserAdmin"
                      color="accent"
                      @click="addAllPlayersToQueue"
                      :disable="allPlayersInQueue"
                      icon="group_add"
                      flat
                      round
                      dense
                    >
                      <q-tooltip
                        anchor="top middle"
                        self="bottom middle"
                        :offset="[8, 8]"
                        >Add all</q-tooltip
                      >
                    </q-btn>
                  </div>
                </div>
                <!-- Search bar -->
                <div class="q-pa-sm players-search">
                  <q-input
                    v-model="searchPlayers"
                    dense
                    outlined
                    placeholder="Search players..."
                    clearable
                  >
                    <template v-slot:prepend>
                      <q-icon name="search" />
                    </template>
                  </q-input>
                </div>
                <PlayerList
                  :players="displayPlayers"
                  :current-user-id="currentUserId"
                  :sort-by="sortBy"
                  :show-actions="isCurrentUserAdmin"
                  :show-requeue-button="isCurrentUserAdmin"
                  :show-feedback-button="!isCurrentUserAdmin"
                  :empty-icon="'people'"
                  :empty-title="
                    searchPlayers
                      ? 'No matching players'
                      : 'No players added yet'
                  "
                  :empty-subtitle="
                    searchPlayers
                      ? 'Try a different search'
                      : 'Click the + button to add your first player'
                  "
                  :empty-action="!searchPlayers"
                  @player-edit="openEditPlayerDialog"
                  @player-avatar-click="openPlayerReportDialog"
                  @player-commend="(p) => openPlayerReportDialog(p, 'commend')"
                  @player-report="(p) => openPlayerReportDialog(p, 'report')"
                  @player-remove="removePlayer"
                  @player-requeue="requeuePlayer"
                  @empty-action="showAddPlayerDialog = true"
                />
              </div>
            </q-card-section>
          </q-card>
        </template>

        <!-- Mobile Queue Tab -->
        <template #queue-mobile>
          <q-card class="queue-card mobile-card" flat bordered>
            <q-card-section class="q-pa-none">
              <div class="card-content mobile-card-content">
                <!-- Mobile queue stats -->
                <div class="q-pa-md q-pb-sm">
                  <div class="row items-center justify-between">
                    <div class="queue-stats">
                      <q-chip
                        v-for="cat in queueStats.categories"
                        :key="cat.label"
                        :label="cat.count.toString()"
                        :color="cat.color"
                        text-color="white"
                        size="sm"
                      >
                        <q-tooltip
                          anchor="top middle"
                          self="bottom middle"
                          :offset="[0, 4]"
                          >{{ cat.label }}</q-tooltip
                        >
                      </q-chip>
                    </div>
                  </div>
                </div>
                <PlayerList
                  :players="queue"
                  :current-user-id="currentUserId"
                  :show-position="true"
                  :show-queue-time="true"
                  :is-in-queue="true"
                  :show-actions="isCurrentUserAdmin"
                  :show-requeue-button="false"
                  :show-feedback-button="!isCurrentUserAdmin"
                  :empty-icon="'queue'"
                  :empty-title="'Queue is empty'"
                  :empty-subtitle="'Add players to start generating matches'"
                  @player-avatar-click="openPlayerReportDialog"
                  @player-commend="(p) => openPlayerReportDialog(p, 'commend')"
                  @player-report="(p) => openPlayerReportDialog(p, 'report')"
                  @player-remove="removeFromQueue"
                />
              </div>
            </q-card-section>
            <q-card-section v-if="isCurrentUserAdmin">
              <!-- Match Type Selector -->
              <div class="q-mb-sm">
                <q-select
                  v-model="matchType"
                  :options="matchTypeOptions"
                  label="Match Type"
                  dense
                  outlined
                  emit-value
                  map-options
                  color="accent"
                >
                  <template v-slot:prepend>
                    <q-icon
                      :name="matchType === 'singles' ? 'person' : 'people'"
                    />
                  </template>
                </q-select>
              </div>

              <div v-if="isCurrentUserAdmin" class="q-mb-sm">
                <q-select
                  v-model="matchmakingMode"
                  :options="matchmakingModeOptions"
                  label="Matchmaking mode"
                  dense
                  outlined
                  emit-value
                  map-options
                  color="accent"
                >
                  <template v-slot:prepend>
                    <q-icon name="balance" />
                  </template>
                  <template v-slot:option="scope">
                    <q-item
                      v-bind="scope.itemProps"
                      :disable="scope.opt.disable"
                      :class="scope.opt.disable ? 'text-grey-5' : ''"
                    >
                      <q-item-section>
                        <q-item-label>
                          {{ scope.opt.label }}
                          <q-badge
                            v-if="scope.opt.disable"
                            color="amber"
                            text-color="white"
                            label="Pro"
                            class="q-ml-xs"
                            dense
                          />
                        </q-item-label>
                        <q-item-label
                          v-if="scope.opt.description"
                          caption
                          class="text-grey-7"
                        >
                          {{ scope.opt.description }}
                        </q-item-label>
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>
              </div>
              <div v-if="isCurrentUserAdmin" class="row q-gutter-sm">
                <!-- Left: dropdown (Pro Pick) or Auto (other modes) -->
                <div class="col" style="min-width: 0">
                  <q-btn-dropdown
                    v-if="matchmakingMode === 'strict_balance'"
                    class="allstar-draft-dropdown full-width"
                    color="accent"
                    size="md"
                    split
                    stack
                    content-class="no-scrollbar"
                    :icon="
                      allStarSortDirection === 'desc'
                        ? 'trending_up'
                        : 'trending_down'
                    "
                    :label="
                      allStarSortDirection === 'desc'
                        ? 'Top First'
                        : 'Bottom First'
                    "
                    :disable="!canGenerateMatches()"
                    :disable-main="!canGenerateMatches()"
                    no-caps
                    @click="generateNewMatches"
                  >
                    <q-tooltip
                      anchor="top middle"
                      self="bottom middle"
                      :offset="[8, 8]"
                      v-if="!canGenerateMatches()"
                    >
                      {{
                        matchType === 'singles'
                          ? 'Need at least 2 players'
                          : 'Need at least 4 players'
                      }}
                    </q-tooltip>
                    <q-list>
                      <q-item
                        clickable
                        v-close-popup
                        @click="allStarSortDirection = 'desc'"
                      >
                        <q-item-section>
                          <q-item-label>Top Rated First</q-item-label>
                          <q-item-label caption
                            >Higher-rated players draft first</q-item-label
                          >
                        </q-item-section>
                      </q-item>
                      <q-item
                        clickable
                        v-close-popup
                        @click="allStarSortDirection = 'asc'"
                      >
                        <q-item-section>
                          <q-item-label>Bottom Rated First</q-item-label>
                          <q-item-label caption
                            >Lower-rated players draft first</q-item-label
                          >
                        </q-item-section>
                      </q-item>
                    </q-list>
                  </q-btn-dropdown>
                  <!-- Other modes: plain Auto button -->
                  <q-btn
                    v-else
                    class="full-width"
                    color="accent"
                    @click="generateNewMatches"
                    size="md"
                    icon="auto_awesome"
                    :disable="!canGenerateMatches()"
                    stack
                    no-caps
                  >
                    <span class="gt-xs">Auto</span>
                    <span class="lt-sm">Auto</span>
                    <q-tooltip
                      anchor="top middle"
                      self="bottom middle"
                      :offset="[8, 8]"
                      v-if="!canGenerateMatches()"
                    >
                      {{
                        matchType === 'singles'
                          ? 'Need at least 2 players'
                          : 'Need at least 4 players'
                      }}
                    </q-tooltip>
                  </q-btn>
                </div>
                <!-- Right: Manual -->
                <div class="col" style="min-width: 0">
                  <q-btn
                    class="full-width"
                    color="accent"
                    @click="startManualSelection"
                    size="md"
                    icon="touch_app"
                    :disable="queue.length < (matchType === 'singles' ? 2 : 4)"
                    outline
                    stack
                    no-caps
                  >
                    <span class="gt-xs">Manual</span>
                    <span class="lt-sm">Manual</span>
                    <q-tooltip
                      anchor="top middle"
                      self="bottom middle"
                      :offset="[8, 8]"
                      v-if="queue.length < (matchType === 'singles' ? 2 : 4)"
                    >
                      {{
                        matchType === 'singles'
                          ? 'Need 2+ players'
                          : 'Need 4+ players'
                      }}
                    </q-tooltip>
                  </q-btn>
                </div>
              </div>
              <PayBanner
                v-if="isClubSubscriptionExpired"
                class="q-mt-sm"
                message="Competitive & Pro Pick are Pro features."
                :loading="paymentLoading"
                @pay="callPayment({ clubId: currentClubId })"
              />
              <div class="text-caption text-grey-6 q-mt-sm text-center">
                {{ getMatchGenerationHint() }}
              </div>

              <!-- Waiting Players Info -->
              <div
                v-if="
                  queue.length > 0 &&
                  queue.length % (matchType === 'singles' ? 2 : 4) !== 0
                "
                class="q-mt-md"
              >
                <q-separator />
                <div class="text-caption text-orange q-mt-sm">
                  <q-icon name="schedule" size="xs" class="q-mr-xs" />
                  {{ getWaitingPlayersInfo() }}
                </div>
              </div>
            </q-card-section>
          </q-card>
        </template>

        <!-- Mobile Matches Tab -->
        <template #matches-mobile>
          <q-card class="matches-card mobile-card" flat bordered>
            <q-card-section class="q-pa-none">
              <div class="card-content mobile-card-content">
                <!-- Mobile filter control -->
                <div class="q-pa-md q-pb-sm">
                  <q-select
                    v-model="matchesFilterBy"
                    :options="matchesFilterOptions"
                    dense
                    outlined
                    emit-value
                    map-options
                    style="min-width: 120px"
                  >
                    <template v-slot:prepend>
                      <q-icon name="filter_list" />
                    </template>
                  </q-select>
                </div>
                <q-list separator v-if="filteredMatches.length > 0">
                  <template v-if="matchesFilterBy === 'completed'">
                    <q-item
                      v-for="match in filteredMatches"
                      :key="match.id"
                      class="q-px-sm bg-green-1"
                    >
                      <q-item-section>
                        <MatchResult
                          :teamA="match.teamA"
                          :teamB="match.teamB"
                          :teamAScore="match.teamAScore"
                          :teamBScore="match.teamBScore"
                          :winProbability="match.winProbability"
                          :startedAt="match.startedAt?.toString()"
                          :completedAt="match.completedAt"
                          :meta="{
                            generatedBy: match.generatedBy,
                            editedBy: match.editedBy,
                            scoredBy: match.scoredBy,
                            cancelledBy: match.cancelledBy,
                            matchmakingMode: match.matchmakingMode,
                            generationType: match.generationType,
                            isEdited: match.isEdited,
                            originalMatchup: match.originalMatchup,
                            originalTeamA: match.originalTeamA,
                            originalTeamB: match.originalTeamB,
                          }"
                        />
                      </q-item-section>
                    </q-item>
                  </template>
                  <template v-else>
                    <MatchCard
                      v-for="(match, index) in filteredMatches"
                      :key="match.id"
                      :match="match"
                      :can-start="hasAvailableSlot"
                      :show-actions="isCurrentUserAdmin"
                      @completeMatch="openMatchResultDialog(index)"
                      @editMatch="editMatch(index)"
                      @startMatch="startMatch(index)"
                      @cancelMatch="cancelMatch(index)"
                      @custom-announce="handleCustomAnnounce"
                    />
                  </template>
                </q-list>
                <EmptyState
                  v-else
                  icon="sports_tennis"
                  title="No active matches"
                  subtitle="Generate matches from the queue to get started"
                />
              </div>
            </q-card-section>
          </q-card>
        </template>
      </ClubLayout>

      <!-- Add Player Dialog -->
      <AddPlayerDialog
        v-model="showAddPlayerDialog"
        :club-members="clubMembers"
        :is-current-user-admin="isCurrentUserAdmin"
        :level-options="levelOptions"
        :players="players"
        :current-club-id="currentClubId"
        :likha-url="likhaUrl"
        :refresh-club-members="refreshClubMembers"
        ref="addPlayerDialogRef"
      />

      <!-- Edit Player Dialog -->
      <EditPlayerDialog
        v-model="showEditPlayerDialog"
        :editing-player="editingPlayer"
        v-model:editPlayerName="editPlayerName"
        v-model:editPlayerLevel="editPlayerLevel"
        :has-name-conflict="hasNameConflict"
        :level-options="levelOptions"
        @save="savePlayerEdit"
      />

      <!-- Match Result Dialog -->
      <MatchResultDialog
        v-model="showMatchResultDialog"
        :current-match="currentMatch"
        v-model:teamAScore="teamAScore"
        v-model:teamBScore="teamBScore"
        :can-complete-match="canCompleteMatch"
        @complete="completeMatch"
      />

      <!-- Settings Dialog -->
      <SettingsDialog
        v-model="showSettingsDialog"
        v-model:settingsTab="settingsTab"
        v-model:queueReturnMethod="queueReturnMethod"
        v-model:autoSortQueue="autoSortQueue"
        v-model:queuePriorityMode="queuePriorityMode"
        v-model:matchmakingMode="matchmakingMode"
        v-model:availableCourts="availableCourts"
        v-model:autoAdvanceMatches="autoAdvanceMatches"
        v-model:ttsEnabled="ttsEnabled"
        v-model:scoreType="scoreType"
        v-model:editClubName="editClubName"
        v-model:editClubId="editClubId"
        v-model:clubSettingsSearch="clubSettingsSearch"
        v-model:clubSettingsSort="clubSettingsSort"
        :unread-club-feedback-count="unreadClubFeedbackCount"
        :is-current-user-admin="isCurrentUserAdmin"
        :queue-return-options="queueReturnOptions"
        :queue-priority-options="queuePriorityOptions"
        :matchmaking-mode-options="matchmakingModeOptions"
        :score-type-options="scoreTypeOptions"
        :dupr-exportable-matches="duprExportableMatches"
        :get-club-logo-url="getClubLogoUrl"
        :club-name="clubName"
        :edit-club-loading="editClubLoading"
        :admin-members="adminMembers"
        :regular-members="regularMembers"
        :admin-match-stats="adminMatchStats"
        :club-feedback-loading="clubFeedbackLoading"
        :club-feedback="clubFeedback"
        @reset-games-played="resetGamesPlayed"
        @clear-matches="clearMatches"
        @clear-queue="clearQueue"
        @reset-session-data="resetSessionData"
        @export-dupr-csv="exportDuprCsv"
        @reset-all-data="resetAllData"
        @on-logo-selected="onLogoSelected"
        @save-club-details="saveClubDetails"
        @confirm-demote-admin="confirmDemoteAdmin"
        @confirm-promote-to-admin="confirmPromoteToAdmin"
        @confirm-remove-member="confirmRemoveMember"
      />

      <!-- Player Report/Commend Dialog -->
      <PlayerReportDialog
        v-model="showPlayerReportDialog"
        :target-player="reportTargetPlayer"
        :current-user-id="currentUserId"
        :club-id="currentClubUUID"
        :initial-type="reportInitialType"
      />

      <!-- Manual Match Selection Dialog -->
      <ManualSelectionDialog
        v-model="showManualSelectionDialog"
        :match-type="matchType"
        :manual-selection-step="manualSelectionStep"
        :selected-players="selectedPlayers"
        v-model:manualTeam1="manualTeam1"
        v-model:manualTeam2="manualTeam2"
        :queue="queue"
        :is-player-selected="isPlayerSelected"
        :create-balanced-match="createBalancedMatch"
        @toggle-player="togglePlayerSelection"
        @cancel="cancelManualSelection"
        @proceed="proceedToTeamArrangement"
        @create="createManualMatchWithCourt"
        @back="
          () => {
            manualSelectionStep = 1;
            selectedForSwap = null;
            selectedForSwapTeam = null;
          }
        "
      />

      <!-- Match Edit Dialog -->
      <MatchEditDialog
        v-model="showMatchEditDialog"
        :manual-selection-step="manualSelectionStep"
        :current-match-type="currentMatchType"
        :selected-players="selectedPlayers"
        :available-queue-players="availableQueuePlayers"
        v-model:manualTeam1="manualTeam1"
        v-model:manualTeam2="manualTeam2"
        :create-balanced-match="createBalancedMatch"
        @remove-player="removePlayerFromEdit"
        @replace-player="replacePlayerInEdit"
        @add-player="addPlayerToEdit"
        @proceed-to-team-arrangement="proceedToTeamArrangement"
        @save-match-edit="saveMatchEdit"
        @go-back-to-step1="
          () => {
            manualSelectionStep = 1;
            selectedForSwap = null;
            selectedForSwapTeam = null;
          }
        "
      />

      <!-- Replace Player Dialog -->
      <ReplacePlayerDialog
        v-model="showReplacePlayerDialog"
        :player-to-replace-in-edit="playerToReplaceInEdit"
        :available-queue-players="availableQueuePlayers"
        @select="selectReplacementPlayer"
      />
    </template>

    <q-page-sticky position="bottom-left" :offset="[18, 18]">
      <q-btn round icon="person" color="accent" @click="goHome">
        <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
          >Profile</q-tooltip
        >
      </q-btn>
    </q-page-sticky>

    <q-page-sticky position="bottom-right" :offset="[18, 18]">
      <q-btn round icon="sports_esports" color="primary" @click="goPlay">
        <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
          >Play 3D Game</q-tooltip
        >
      </q-btn>
    </q-page-sticky>
  </q-page>
</template>

<script setup lang="ts">
import { MatchmakingApp } from '../services/matchmaking';
import type { Player } from '../services/matchmaking';
import { readItems, readMe } from '@likha-erp/likha-sdk';
import { likhaClient } from 'src/services/likhaClient';
import { useAuth } from 'src/composables/useAuth';
import { useCloudSync } from '../composables/useCloudSync';
import { useClubData } from '../composables/useClubData';
import { usePayment } from '../composables/usePayment';
import { useDeviceSettings } from 'src/composables/useDeviceSettings';

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar, LocalStorage, copyToClipboard } from 'quasar';
import { useNotify } from 'src/composables/useNotify';
import { useWakeLock } from 'src/composables/useWakeLock';
import PlayerList from '../components/PlayerList.vue';
import PlayerReportDialog from '../components/PlayerReportDialog.vue';
import PayBanner from '../components/PayBanner.vue';
import EmptyState from '../components/EmptyState.vue';
import {
  getClubFeedback,
  type ClubFeedbackEntry,
} from '../services/playerReport';
import MatchCard from '../components/MatchCard.vue';
import MatchResult from '../components/MatchResult.vue';
import MatchResultDialog from '../components/club/MatchResultDialog.vue';
import EditPlayerDialog from '../components/club/EditPlayerDialog.vue';
import ReplacePlayerDialog from '../components/club/ReplacePlayerDialog.vue';
import LeaderboardDialog from '../components/club/LeaderboardDialog.vue';
import AddPlayerDialog from '../components/club/AddPlayerDialog.vue';
import MatchEditDialog from '../components/club/MatchEditDialog.vue';
import ManualSelectionDialog from '../components/club/ManualSelectionDialog.vue';
import ClubHeader from '../components/club/ClubHeader.vue';
import ClubLayout from '../components/club/ClubLayout.vue';
import SettingsDialog from '../components/club/SettingsDialog.vue';
import { getRatingColor, getRatingCategory } from '../utils/playerHelpers';
import { computeWinProbability } from '../services/matchmaking';
import { useMatchSettings } from '../composables/useMatchSettings';
import { useClubMembers } from '../composables/useClubMembers';
import { useLeaderboard } from '../composables/useLeaderboard';
import { useAnnouncer } from '../composables/useAnnouncer';
import { usePlayerActions } from '../composables/usePlayerActions';
import { useDataManagement } from '../composables/useDataManagement';
import { useManualSelection } from '../composables/useManualSelection';
import { useMatchActions } from '../composables/useMatchActions';
import {
  clearSpeechQueue,
  isSpeaking,
  setAdminMode,
} from '../services/announcer';

// Player type

// Quasar instance for notifications
const $q = useQuasar();
useWakeLock();
const { notify } = useNotify();

// Lazy stub for handleCustomAnnounce (wired from useAnnouncer composable later)
let handleCustomAnnounce: (match: {
  id: string;
  teamA: { firstName?: string; username: string }[];
  teamB: { firstName?: string; username: string }[];
  court?: number;
  status?: string;
}) => void = () => {};

// Shared auth helpers (logout + 401 handling) from the useAuth composable
const { handleAuthError } = useAuth();

// State: Players, Queue, and Matches
const players = computed(() =>
  Object.values(MatchmakingApp.state.players)
    .filter((p) => !p.deletedAt)
    .map((p) => ({
      ...p,
      name: p.username,
    })),
);

// Player actions composable — extracted removePlayer, removeFromQueue, requeuePlayer, addAllPlayersToQueue
const { removePlayer, removeFromQueue, requeuePlayer, addAllPlayersToQueue } =
  usePlayerActions({
    players,
  });

const queue = computed(() => {
  const mapped = MatchmakingApp.state.queues
    .filter((q) => !q.deletedAt)
    .map((q) => {
      const p = MatchmakingApp.state.players[q.username];
      if (!p || p.deletedAt) return null;
      return {
        ...p,
        username: p.username,
        enteredAt: q.enteredAt,
        queueType: q.queueType,
        isInMatch: false, // Players in queue are not in matches (enforced by constraint)
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (autoSortQueue.value) {
    const sortFn = (
      a: { matchesPlayed: number; enteredAt: number; queueType: string },
      b: { matchesPlayed: number; enteredAt: number; queueType: string },
    ) => {
      // 1. Group visually by Queue Type (General -> Winners -> Losers)
      const typeOrder: Record<string, number> = {
        GENERAL: 0,
        WINNERS: 1,
        LOSERS: 2,
      };
      const orderA = typeOrder[a.queueType] ?? 2;
      const orderB = typeOrder[b.queueType] ?? 2;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // 2. Sort by Priority Settings
      if (queuePriorityMode.value === 'gamesPlayed') {
        if (a.matchesPlayed !== b.matchesPlayed) {
          return a.matchesPlayed - b.matchesPlayed;
        }
      }

      // 3. Fallback to FIFO Timestamp
      return a.enteredAt - b.enteredAt;
    };

    return [...mapped].sort(sortFn);
  }

  return mapped;
});
const matches = computed(() => {
  return MatchmakingApp.state.activeMatches
    .filter((m) => !m.deletedAt)
    .map((m, index) => {
      const teamA = m.teamA.map((u) => ({
        ...MatchmakingApp.state.players[u],
        username: u,
      }));
      const teamB = m.teamB.map((u) => ({
        ...MatchmakingApp.state.players[u],
        username: u,
      }));
      const stats = computeWinProbability(teamA, teamB);
      return {
        id: m.matchId,
        teamA,
        teamB,
        players: [...teamA, ...teamB],
        expectedDifference: stats.expectedDifference,
        winProbability: stats.teamA,
        status: m.status || 'in-progress',
        court: m.court,
        order: index + 1,
        createdAt: new Date(m.createdAt || Date.now()),
        startedAt: m.startedAt ? new Date(m.startedAt) : undefined,
        queueSource: m.queueSource,
        generatedBy: m.generatedBy,
        editedBy: m.editedBy,
        scoredBy: m.scoredBy,
        cancelledBy: m.cancelledBy,
        matchmakingMode: m.matchmakingMode,
        generationType: m.generationType,
        isEdited: m.isEdited,
        originalMatchup: m.originalMatchup,
        originalTeamA: m.originalTeamA,
        originalTeamB: m.originalTeamB,
        teamAScore: undefined as number | undefined,
        teamBScore: undefined as number | undefined,
        completedAt: undefined as string | undefined,
      };
    });
});

const duprExportableMatches = computed(() => {
  const resetAt = MatchmakingApp.state.completedMatchesResetAt ?? 0;
  return MatchmakingApp.state.completedMatches.filter(
    (m) => m.completedAt > resetAt,
  );
});

const _adminMatchStats = ref<
  Record<
    string,
    {
      total: number;
      auto: number;
      manual: number;
      edited: number;
      scored: number;
    }
  >
>({});
const adminMatchStats = computed(() => _adminMatchStats.value);

const teamAScore = ref<number>(0);
const teamBScore = ref<number>(0);

const canCompleteMatch = computed(() => {
  const match =
    currentMatchIndex.value >= 0
      ? matches.value[currentMatchIndex.value]
      : null;
  if (!match || match.status !== 'in-progress') return false;
  const a = Number(teamAScore.value) || 0;
  const b = Number(teamBScore.value) || 0;
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  if (a < 0 || b < 0) return false;
  if (a === b) return false;
  return true;
});

// Per-device settings: personal preferences stored in LocalStorage only (not cloud-synced).
// Extracted to src/composables/useDeviceSettings.ts for shared access with announcer.ts.
const { deviceSettings, saveDeviceSettings } = useDeviceSettings();

// Lazy stubs for forward references needed by useMatchSettings
// (real implementations are assigned later in the script)
let _isCourtAvailable: (court: number) => boolean = () => true;
let _autoAdvanceNextMatchForCourt: (court?: number) => void = () => {};
const _isClubSubscriptionExpired = ref(false);

// Match settings composable — extracted from inline computed get/set proxies
const {
  availableCourts,
  autoAdvanceMatches,
  ttsEnabled,
  matchType,
  queueReturnMethod,
  queuePriorityMode,
  matchmakingMode,
  allStarSortDirection,
  autoSortQueue,
  scoreType,
  sortBy,
  matchesFilterBy,
  levelOptions,
  matchTypeOptions,
  scoreTypeOptions,
  sortOptions,
  matchesFilterOptions,
  queueReturnOptions,
  queuePriorityOptions,
  matchmakingModeOptions,
} = useMatchSettings({
  deviceSettings,
  saveDeviceSettings,
  isClubSubscriptionExpired: computed(() => _isClubSubscriptionExpired.value),
  autoAdvanceMatchesRef: computed(() => autoAdvanceMatches.value),
  matches,
  isCourtAvailable: (c: number) => _isCourtAvailable(c),
  autoAdvanceNextMatchForCourt: (c?: number) =>
    _autoAdvanceNextMatchForCourt(c),
});

// Route and Club state
const route = useRoute();
const router = useRouter();
const isOpenPlay = computed(() => route.path === '/openplay');
const { paymentLoading, fetchPaymentSettings, callPayment } = usePayment();

// Current user and club membership
const currentUserId = ref<string>('');

const clubSettingsSearch = ref('');
const clubSettingsSort = ref<
  'nameAsc' | 'nameDesc' | 'ratingDesc' | 'ratingAsc'
>('nameAsc');

// isCurrentUserAdmin is declared after useClubData (needs clubMembers)

// Dynamic max-height for queue list: taller when match-type + buttons are hidden
const queueMaxHeightDesktop = computed(() =>
  isCurrentUserAdmin.value ? 'calc(100vh - 480px)' : 'calc(100vh - 340px)',
);
const queueMaxHeightMobile = computed(() =>
  isCurrentUserAdmin.value ? 'calc(100vh - 460px)' : 'calc(100vh - 300px)',
);

const goHome = () => {
  router.push('/');
};

const goPlay = () => {
  router.push('/play');
};

const copyClubLink = async () => {
  const shareUrl = `${window.location.origin}?r=${encodeURIComponent(route.path)}`;
  if (navigator.share) {
    try {
      await navigator.share({
        title: clubName.value || 'DinkMatch Club',
        text: `Join ${clubName.value || 'our club'} on DinkMatch!`,
        url: shareUrl,
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('Share failed:', err);
      }
    }
    return;
  }
  copyToClipboard(shareUrl)
    .then(() => {
      $q.notify({
        color: 'positive',
        message: 'Club link copied!',
        icon: 'check_circle',
        timeout: 1500,
      });
    })
    .catch(() => {
      $q.notify({
        color: 'negative',
        message: 'Failed to copy link',
        icon: 'error',
        timeout: 1500,
      });
    });
};

// Initialize Likha client from environment or localStorage
const likhaUrl = ref(
  localStorage.getItem('likhaUrl') || 'https://api.dinkmatch.club',
);
const likhaToken = ref(localStorage.getItem('likhaToken') || '');

// Cloud sync — timestamp helpers kept here (shared by loadClubData and composable)
const lastSyncedServerTimestamp = ref(0);
const getLastSyncedKey = (clubId: string) => `last_synced_ts_${clubId}`;
const loadLastSyncedTimestamp = (clubId: string) => {
  const saved = LocalStorage.getItem(getLastSyncedKey(clubId)) as number | null;
  return saved || 0;
};
const saveLastSyncedTimestamp = (clubId: string, ts: number) => {
  LocalStorage.set(getLastSyncedKey(clubId), ts);
};

// Lazy wrapper for refreshPlayerRatings — breaks circular dependency
// (composable needs refreshPlayerRatings, refreshPlayerRatings needs isOnline from composable)
let _refreshPlayerRatings: () => Promise<void> = async () => {};
const refreshPlayerRatingsLazy = () => _refreshPlayerRatings();

// Lazy getter for dataFetchBar — breaks useClubData/useCloudSync circular dependency
let getDataFetchBar: () =>
  | { start: () => void; stop: () => void }
  | undefined
  | null = () => undefined;

// Club data composable — manages club refs, loadClubData, cache, and club editing.
const {
  currentClubId,
  currentClubUUID,
  clubName,
  getClubLogoUrl,
  editClubName,
  editClubId,
  editClubLoading,
  clubLoadingState,
  clubStatus,
  clubErrorMessage,
  isCurrentUserMember,
  clubAdminIds,
  clubMembers,
  loadClubData,
  populateEditClubFields,
  refreshClubInfo,
  onLogoSelected,
  saveClubDetails,
  handleJoinClub,
} = useClubData({
  likhaUrl,
  currentUserId,
  isOpenPlay,
  getDataFetchBar,
  lastSyncedServerTimestamp,
  saveLastSyncedTimestamp,
});

// Cloud sync composable — manages isOnline, hasPendingCloudSync, performCloudSync,
// realtime subscriptions, online/offline/visibility handlers, and onStateChange wiring.
const {
  isOnline,
  syncAjaxBar,
  dataFetchBar,
  performCloudSync,
  startRealtime,
  doResumeSync,
} = useCloudSync({
  currentClubUUID,
  currentClubId,
  clubAdminIds,
  currentUserId,
  isOpenPlay,
  likhaUrl,
  loadClubData: (clubId: string) => loadClubData(clubId),
  refreshPlayerRatings: refreshPlayerRatingsLazy,
  router,
  lastSyncedServerTimestamp,
  saveLastSyncedTimestamp,
});

getDataFetchBar = () => dataFetchBar.value;

const isCurrentUserAdmin = computed(() => {
  if (isOpenPlay.value) return true;
  const isAdmin = clubMembers.value.some(
    (m) => m.id === currentUserId.value && m.isAdmin,
  );
  console.log(
    'isCurrentUserAdmin:',
    isAdmin,
    'currentUserId:',
    currentUserId.value,
    'clubMembers:',
    clubMembers.value,
  );
  return isAdmin;
});
watch(isCurrentUserAdmin, (val) => setAdminMode(val), { immediate: true });

const isClubSubscriptionExpired = computed(
  () => !isOpenPlay.value && clubStatus.value !== 'published',
);
watch(
  isClubSubscriptionExpired,
  (val) => {
    _isClubSubscriptionExpired.value = val;
  },
  { immediate: true },
);

// Club members composable — extracted member filtering, stats, and management
const {
  adminMembers,
  regularMembers,
  adminMatchStats: _adminMatchStatsComputed,
  confirmDemoteAdmin,
  confirmPromoteToAdmin,
  confirmRemoveMember,
  refreshClubMembers,
} = useClubMembers({
  currentClubId,
  currentClubUUID,
  clubAdminIds,
  clubMembers,
  likhaUrl,
  clubSettingsSearch,
  clubSettingsSort,
});
watch(
  _adminMatchStatsComputed,
  (val) => {
    _adminMatchStats.value = val;
  },
  { immediate: true },
);

// Leaderboard composable — extracted fetch/cache logic
const { clubLeaderboard, clubLeaderboardLoading, fetchClubLeaderboard } =
  useLeaderboard({
    currentClubUUID,
    clubMembers,
  });

// Pull the latest player ratings from the club's M2M (club.players → directus_users).
// A manual change to directus_users.rating doesn't touch the club item, so the
// realtime appState subscription never sees it — we refresh ratings explicitly here.
const refreshPlayerRatings = async () => {
  if (!isOnline.value || !currentClubUUID.value) return;
  try {
    const result = await likhaClient.request(
      readItems('club', {
        filter: { id: { _eq: currentClubUUID.value } },
        fields: [
          'players.directus_users_id.id',
          'players.directus_users_id.rating',
          'players.directus_users_id.rating_updated_at',
          'players.directus_users_id.dupr_id',
          'players.directus_users_id.avatar',
          'players.directus_users_id.first_name',
          'players.directus_users_id.last_name',
        ] as unknown as string[],
        deep: {
          players: { _limit: -1 },
        },
      }),
    );

    const club = result?.[0] as unknown as
      | {
          players?: Array<{
            directus_users_id?: {
              id: string;
              rating?: number;
              rating_updated_at?: number;
              avatar?: string;
              first_name?: string;
              last_name?: string;
              email?: string;
            };
          }>;
        }
      | undefined;
    if (!club?.players) return;

    let changed = false;
    club.players.forEach((p) => {
      const u = p.directus_users_id;
      if (!u?.id) return;

      const local = Object.values(MatchmakingApp.state.players).find(
        (pl) => pl.userId === u.id,
      );
      if (!local) return;

      // Update avatar if present
      if (typeof u.avatar === 'string') {
        const avatarUrl = `${likhaUrl.value}/assets/${u.avatar}`;
        if (local.avatar !== avatarUrl) {
          local.avatar = avatarUrl;
          local.updatedAt = Date.now();
          changed = true;
        }
      }

      // Update firstName if present
      if (typeof u.first_name === 'string') {
        if (local.firstName !== u.first_name) {
          local.firstName = u.first_name;
          local.updatedAt = Date.now();
          changed = true;
        }
      }

      // Update lastName if present
      if (typeof u.last_name === 'string') {
        if (local.lastName !== u.last_name) {
          local.lastName = u.last_name;
          local.updatedAt = Date.now();
          changed = true;
        }
      }

      // Update rating if present
      if (typeof u.rating === 'number') {
        // LWW token: only adopt the cloud rating when it's a NEWER change than ours.
        // This stops the Flow's appState→users projection from looping back over a
        // local rating, while letting a genuinely newer manual edit win.
        const hasTs = typeof u.rating_updated_at === 'number';
        const incomingTs = hasTs ? (u.rating_updated_at as number) : 0;
        const shouldAdopt = hasTs
          ? incomingTs > (local.ratingUpdatedAt ?? 0)
          : local.rating !== u.rating; // legacy fallback until field exists

        if (shouldAdopt && local.rating !== u.rating) {
          local.rating = u.rating;
          if (hasTs) local.ratingUpdatedAt = incomingTs;
          local.updatedAt = Date.now();
          changed = true;

          // Keep the members list in sync with the adopted value.
          const member = clubMembers.value.find((m) => m.id === u.id);
          if (member) member.rating = u.rating;
        }
      }
    });

    if (changed) MatchmakingApp.persistSilently();
  } catch (err) {
    // Handle 401 Unauthorized errors
    if (await handleAuthError(err, router)) return;
    console.warn('Failed to refresh player ratings:', err);
  }
};

_refreshPlayerRatings = refreshPlayerRatings;

// Page visibility tracking (for scanner restart on resume)
let isTabVisible = true;

const addPlayerDialogRef = ref<InstanceType<typeof AddPlayerDialog> | null>(
  null,
);

const handleVisibilityChange = () => {
  const wasHidden = !isTabVisible;
  isTabVisible = !document.hidden;
  if (isTabVisible && wasHidden) {
    doResumeSync();
    addPlayerDialogRef.value?.restartScannerIfActive();
  }
};

const handleFocus = () => {
  doResumeSync();
  addPlayerDialogRef.value?.restartScannerIfActive();
};

const handlePageShow = () => {
  doResumeSync();
  addPlayerDialogRef.value?.restartScannerIfActive();
};

onMounted(async () => {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('pageshow', handlePageShow);
  document.addEventListener('resume', handlePageShow);

  // Restore cached user ID immediately so the page is usable before API calls
  const cachedUserId = LocalStorage.getItem('current_user_id') as string | null;
  if (cachedUserId) {
    currentUserId.value = cachedUserId;
  }

  if (!isOpenPlay.value) {
    // Fetch payment settings
    console.log('fetching settings');
    void fetchPaymentSettings();

    // Fetch current user in background (don't block page load)
    likhaClient
      .request(readMe())
      .then((me) => {
        currentUserId.value =
          ((me as Record<string, unknown>).id as string) || '';
        if (currentUserId.value) {
          LocalStorage.set('current_user_id', currentUserId.value);
        }
      })
      .catch(async (err) => {
        // If token is fully expired (no valid refresh), force re-login
        if (await handleAuthError(err, router)) return;
        // Already restored from cache above, nothing more to do
      });
  }

  // Load club from URL param — restoreFromCache will show cached data immediately
  const clubId = route.params['clubId'] as string;
  if (clubId) {
    await loadClubData(clubId);
    void loadClubFeedback();
    // Auto-join if not a member (lazy join: works offline if cached, joins when online)
    if (
      !isCurrentUserMember.value &&
      !isOpenPlay.value &&
      currentUserId.value &&
      isOnline.value
    ) {
      await handleJoinClub();
    }
    // Restore optimistic-concurrency token so we don't false-conflict after refresh
    lastSyncedServerTimestamp.value = loadLastSyncedTimestamp(clubId);
    // Pull any manual directus_users rating edits on first load.
    void refreshPlayerRatings();
    // Subscribe to live updates so other admins' changes arrive without refresh.
    void startRealtime();
  } else {
    clubLoadingState.value = 'loaded';
    if (isOpenPlay.value) {
      clubName.value = 'Open Play';
    }
  }
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('focus', handleFocus);
  window.removeEventListener('pageshow', handlePageShow);
  document.removeEventListener('resume', handlePageShow);
});

// Helper function to extract court count
const getCourtCount = (): number => {
  return availableCourts.value || 1;
};

// Dialog states
const showAddPlayerDialog = ref(false);
const showSettingsDialog = ref(false);
const showLeaderboardDialog = ref(false);
const settingsTab = ref<'matchmaking' | 'club' | 'feedback'>('matchmaking');

// Data management composable — extracted reset/clear/export functions
const routeParamsId = computed(() => route.params.id);
const {
  resetGamesPlayed,
  clearMatches,
  clearQueue,
  exportDuprCsv,
  resetSessionData,
  resetAllData,
} = useDataManagement({
  duprExportableMatches,
  clubName,
  routeParamsId,
  showSettingsDialog,
});

watch([showSettingsDialog, settingsTab], ([showDialog, tab]) => {
  if (showDialog && tab === 'club') {
    void refreshClubInfo().then(() => populateEditClubFields());
  }
});

watch(showLeaderboardDialog, (open) => {
  if (open) {
    fetchClubLeaderboard();
  }
});

const clubFeedback = ref<ClubFeedbackEntry[]>([]);
const clubFeedbackLoading = ref(false);
const clubFeedbackReadKey = computed(
  () => `club_feedback_read_${currentClubUUID.value}`,
);

function getClubFeedbackReadIds(): string[] {
  const raw = LocalStorage.getItem(clubFeedbackReadKey.value);
  if (!raw) return [];
  try {
    return Array.isArray(raw) ? (raw as string[]) : [];
  } catch {
    return [];
  }
}

function saveClubFeedbackReadIds(ids: string[]) {
  LocalStorage.set(clubFeedbackReadKey.value, ids);
}

const unreadClubFeedbackCount = computed(() => {
  const readIds = new Set(getClubFeedbackReadIds());
  return clubFeedback.value.filter((item) => !readIds.has(item.id)).length;
});
const showMatchResultDialog = ref(false);
const showMatchEditDialog = ref(false);
const showReplacePlayerDialog = ref(false);
const playerToReplaceInEdit = ref<Player | null>(null);
const currentMatchIndex = ref<number>(-1);

// Manual selection states — provided by useManualSelection composable (wired later)
// These lazy stubs are overwritten after the composable is initialized
const showManualSelectionDialog = ref(false);
const manualSelectionStep = ref<1 | 2>(1);
const selectedPlayers = ref<Player[]>([]);
const manualTeam1 = ref<Player[]>([]);
const manualTeam2 = ref<Player[]>([]);

// Tap-to-swap states
const selectedForSwap = ref<Player | null>(null);
const selectedForSwapTeam = ref<'team1' | 'team2' | null>(null);
// Mobile tabs state
const activeMobileTab = ref<'players' | 'queue' | 'matches'>('players');

// Restore saved tab
const savedTab = LocalStorage.getItem('active_tab') as
  | 'players'
  | 'queue'
  | 'matches'
  | null;
if (savedTab) activeMobileTab.value = savedTab;

// Persist tab changes
watch(activeMobileTab, (tab) => {
  LocalStorage.set('active_tab', tab);
});

function getClubFeedbackCacheKey(): string {
  return `club_feedback_cache_${currentClubUUID.value}`;
}

function loadCachedClubFeedback(): ClubFeedbackEntry[] | null {
  const raw = LocalStorage.getItem(getClubFeedbackCacheKey());
  if (!raw) return null;
  try {
    return Array.isArray(raw) ? (raw as ClubFeedbackEntry[]) : null;
  } catch {
    return null;
  }
}

function saveCachedClubFeedback(items: ClubFeedbackEntry[]) {
  LocalStorage.set(getClubFeedbackCacheKey(), items);
}

async function loadClubFeedback() {
  if (!currentClubUUID.value) return;
  const cached = loadCachedClubFeedback();
  if (cached) {
    clubFeedback.value = cached;
    clubFeedbackLoading.value = false;
  } else {
    clubFeedbackLoading.value = true;
  }
  const fresh = await getClubFeedback(currentClubUUID.value);
  clubFeedback.value = fresh;
  saveCachedClubFeedback(fresh);
  clubFeedbackLoading.value = false;
}

// Fetch latest members/admins when opening the Club settings tab
watch(settingsTab, (tab) => {
  if (tab === 'club') {
    void refreshClubMembers();
  }
  if (tab === 'feedback') {
    void loadClubFeedback();
    const readIds = new Set(getClubFeedbackReadIds());
    clubFeedback.value.forEach((item) => readIds.add(item.id));
    saveClubFeedbackReadIds([...readIds]);
  }
});

// Search state for players
const searchPlayers = ref<string>('');

// Edit player state
const showEditPlayerDialog = ref(false);
const editingPlayer = ref<Player | null>(null);
const showPlayerReportDialog = ref(false);
const reportTargetPlayer = ref<Player | null>(null);
const reportInitialType = ref<'report' | 'commend'>('commend');
const editPlayerName = ref<string | null>(null);
const editPlayerLevel = ref<1 | 2 | 3 | null>(null);

// Announcer composable — extracted match announcement watcher and handleCustomAnnounce
const { handleCustomAnnounce: _handleCustomAnnounce } = useAnnouncer({
  matches,
  queuePriorityMode,
});
handleCustomAnnounce = _handleCustomAnnounce;

const currentMatchIndexForActions = ref<number>(-1);

// Computed properties
const displayPlayers = computed(() => {
  let result = players.value;

  if (!searchPlayers.value?.trim()) {
    result = players.value;
  } else {
    // Simple includes search across firstName, lastName, username
    const searchTerm = searchPlayers.value.toLowerCase().trim();
    result = players.value.filter((p) => {
      const searchString =
        `${p.firstName || ''} ${p.lastName || ''} ${p.username || ''}`.toLowerCase();
      return searchString.includes(searchTerm);
    });
  }

  // Add isInMatch and isInQueue properties to each player
  const queueUsernames = new Set(
    MatchmakingApp.state.queues
      .filter((q) => !q.deletedAt)
      .map((q) => q.username),
  );
  const withStatus = result.map((p) => ({
    ...p,
    isInMatch: isPlayerInMatch(p.username),
    isInQueue: queueUsernames.has(p.username),
  }));

  return withStatus;
});

const queueStats = computed(() => {
  const total = queue.value.length;
  const categories = ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Pro'];
  const counts = categories.map((cat) => ({
    label: cat,
    count: queue.value.filter(
      (p) => getRatingCategory(p.rating || 1450) === cat,
    ).length,
    color: getRatingColor(
      cat === 'Beginner'
        ? 1300
        : cat === 'Intermediate'
          ? 1500
          : cat === 'Advanced'
            ? 1800
            : cat === 'Expert'
              ? 2000
              : 2200,
    ),
  }));

  return { total, categories: counts.filter((c) => c.count > 0) };
});

const allPlayersInQueue = computed(() => {
  if (players.value.length === 0) return true;
  const queuePlayerNames = new Set(queue.value.map((p) => p.username));
  return players.value.every((p) => queuePlayerNames.has(p.username));
});

// Helper function to check if a player is in a match
const isPlayerInMatch = (username: string): boolean => {
  return MatchmakingApp.state.activeMatches.some(
    (m) =>
      !m.deletedAt &&
      (m.teamA.includes(username) || m.teamB.includes(username)),
  );
};

const hasAvailableSlot = computed(() => {
  const cap = getCourtCount();
  const inProgress = matches.value.filter(
    (m) => m.status === 'in-progress',
  ).length;
  return inProgress < cap;
});

const cancelledMatches = computed(() => {
  return MatchmakingApp.state.activeMatches
    .filter((m) => m.deletedAt)
    .map((m, index) => {
      const teamA = m.teamA.map((u) => ({
        ...MatchmakingApp.state.players[u],
        username: u,
      }));
      const teamB = m.teamB.map((u) => ({
        ...MatchmakingApp.state.players[u],
        username: u,
      }));
      const stats = computeWinProbability(teamA, teamB);
      return {
        id: m.matchId,
        teamA,
        teamB,
        players: [...teamA, ...teamB],
        expectedDifference: stats.expectedDifference,
        winProbability: stats.teamA,
        status: 'cancelled' as const,
        court: m.court,
        order: index + 1,
        createdAt: new Date(m.createdAt || Date.now()),
        startedAt: m.startedAt ? new Date(m.startedAt) : undefined,
        queueSource: m.queueSource,
        generatedBy: m.generatedBy,
        editedBy: m.editedBy,
        scoredBy: m.scoredBy,
        cancelledBy: m.cancelledBy,
        matchmakingMode: m.matchmakingMode,
        generationType: m.generationType,
        isEdited: m.isEdited,
        originalMatchup: m.originalMatchup,
        originalTeamA: m.originalTeamA,
        originalTeamB: m.originalTeamB,
      };
    });
});

const completedMatchViewModels = computed(() => {
  return MatchmakingApp.state.completedMatches.map((m, index) => {
    const teamA = m.teamA.map((p) => ({
      ...p,
      username: p.username,
    }));
    const teamB = m.teamB.map((p) => ({
      ...p,
      username: p.username,
    }));
    const stats = computeWinProbability(
      teamA as unknown as Player[],
      teamB as unknown as Player[],
    );
    return {
      id: m.matchId,
      teamA,
      teamB,
      players: [...teamA, ...teamB],
      expectedDifference: stats.expectedDifference,
      winProbability: stats.teamA,
      status: 'completed' as const,
      teamAScore: m.teamAScore,
      teamBScore: m.teamBScore,
      completedAt: new Date(m.completedAt).toISOString(),
      court: undefined,
      order: index + 1,
      createdAt: new Date(m.completedAt || Date.now()),
      startedAt: m.startedAt ? new Date(m.startedAt).toISOString() : undefined,
      queueSource: undefined,
      generatedBy: m.meta?.generatedBy,
      editedBy: m.meta?.editedBy,
      scoredBy: m.meta?.scoredBy,
      cancelledBy: undefined,
      matchmakingMode: m.meta?.matchmakingMode,
      generationType: m.meta?.generationType,
      isEdited: m.meta?.isEdited,
      originalMatchup: m.meta?.originalMatchup,
      originalTeamA: m.meta?.originalTeamA,
      originalTeamB: m.meta?.originalTeamB,
    };
  });
});

const filteredMatches = computed(() => {
  let filtered: typeof matches.value;

  if (matchesFilterBy.value === 'cancelled') {
    filtered = cancelledMatches.value as unknown as typeof matches.value;
  } else if (matchesFilterBy.value === 'completed') {
    filtered =
      completedMatchViewModels.value as unknown as typeof matches.value;
  } else if (matchesFilterBy.value === 'edited') {
    const editedActive = matches.value.filter((m) => m.isEdited);
    const editedCompleted = completedMatchViewModels.value.filter(
      (m) => m.isEdited,
    );
    filtered = [
      ...editedActive,
      ...editedCompleted,
    ] as unknown as typeof matches.value;
  } else if (matchesFilterBy.value === 'all') {
    filtered = matches.value;
  } else {
    filtered = matches.value.filter(
      (match) => match.status === matchesFilterBy.value,
    );
  }

  // Sort by status: in-progress first, then waiting, then cancelled, then completed
  filtered = [...filtered].sort((a, b) => {
    const statusOrder: Record<string, number> = {
      'in-progress': 0,
      waiting: 1,
      cancelled: 2,
      completed: 3,
    };
    const statusDiff =
      (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;

    // Within same status, use queue priority order (matches the queue setting)
    if (queuePriorityMode.value === 'gamesPlayed') {
      // Less Played First: match with lowest min games played comes first
      const aGames =
        (a as unknown as { minGamesPlayed?: number }).minGamesPlayed ?? 0;
      const bGames =
        (b as unknown as { minGamesPlayed?: number }).minGamesPlayed ?? 0;
      if (aGames !== bGames) return aGames - bGames;
    }
    // First in Line (default): match with oldest queue entry comes first
    // Cancelled: latest first (newest on top)
    const aTime =
      (a as unknown as { oldestQueueEntryAt?: number }).oldestQueueEntryAt ??
      a.createdAt.getTime();
    const bTime =
      (b as unknown as { oldestQueueEntryAt?: number }).oldestQueueEntryAt ??
      b.createdAt.getTime();
    if ((a.status as string) === 'cancelled') return bTime - aTime;
    if ((a.status as string) === 'completed') return bTime - aTime;
    if (matchesFilterBy.value === 'edited') return bTime - aTime;
    if ((a.status as string) === 'in-progress') {
      const aStarted =
        (a as unknown as { startedAt?: Date }).startedAt?.getTime() ?? aTime;
      const bStarted =
        (b as unknown as { startedAt?: Date }).startedAt?.getTime() ?? bTime;
      return aStarted - bStarted;
    }
    return aTime - bTime;
  });

  return filtered;
});

const currentMatch = computed(() => {
  if (
    currentMatchIndex.value >= 0 &&
    currentMatchIndex.value < matches.value.length
  ) {
    return matches.value[currentMatchIndex.value];
  }
  return null;
});

// Edit player computed
const hasNameConflict = computed(() => {
  if (!editPlayerName.value?.trim() || !editingPlayer.value) {
    return false;
  }
  const trimmedName = editPlayerName.value.trim();
  // Check if another player (excluding the current editing player) has the same name (case-insensitive)
  return players.value.some(
    (player) =>
      player.username.toLowerCase() === trimmedName.toLowerCase() &&
      player.username !== editingPlayer.value?.username,
  );
});

// Tab shake animation state
const tabShakeStates = ref({
  players: false,
  queue: false,
  matches: false,
});

// Watch for count changes and trigger shake animation
watch(
  () => players.value.length,
  (newCount, oldCount) => {
    if (newCount !== oldCount && activeMobileTab.value !== 'players') {
      tabShakeStates.value.players = true;
      setTimeout(() => {
        tabShakeStates.value.players = false;
      }, 600);
    }
  },
);

watch(
  () => queue.value.length,
  (newCount, oldCount) => {
    if (newCount !== oldCount && activeMobileTab.value !== 'queue') {
      tabShakeStates.value.queue = true;
      setTimeout(() => {
        tabShakeStates.value.queue = false;
      }, 600);
    }
  },
);

watch(
  () => filteredMatches.value.length,
  (newCount, oldCount) => {
    if (newCount !== oldCount && activeMobileTab.value !== 'matches') {
      tabShakeStates.value.matches = true;
      setTimeout(() => {
        tabShakeStates.value.matches = false;
      }, 600);
    }
  },
);

const canGenerateMatches = (): boolean => {
  const total = queue.value.length;
  const requiredPlayers = matchType.value === 'singles' ? 2 : 4;

  // We can generate matches if we have enough players
  return total >= requiredPlayers;
};

const getMatchGenerationHint = (): string => {
  const total = queue.value.length;
  const requiredPlayers = matchType.value === 'singles' ? 2 : 4;

  if (total < requiredPlayers) {
    return `Need ${requiredPlayers - total} more player${requiredPlayers - total > 1 ? 's' : ''} to generate ${matchType.value} matches`;
  }

  const maxMatches = Math.floor(total / requiredPlayers);
  const remainingPlayers = total % requiredPlayers;

  if (remainingPlayers === 0) {
    return `Can generate ${maxMatches} ${matchType.value} match${maxMatches > 1 ? 'es' : ''}`;
  } else if (matchType.value === 'singles') {
    return `Can generate ${maxMatches} singles match${maxMatches > 1 ? 'es' : ''} (1 player will wait)`;
  } else {
    // Doubles
    if (remainingPlayers === 1) {
      return `Can generate ${maxMatches} match${maxMatches > 1 ? 'es' : ''} (1 player will wait)`;
    } else if (remainingPlayers === 2) {
      return `Can generate ${maxMatches} match${maxMatches > 1 ? 'es' : ''} (2 players will wait)`;
    } else {
      return `Can generate ${maxMatches} match${maxMatches > 1 ? 'es' : ''} (3 players will wait)`;
    }
  }
};

const getWaitingPlayersInfo = (): string => {
  const total = queue.value.length;
  const requiredPlayers = matchType.value === 'singles' ? 2 : 4;
  const remainingPlayers = total % requiredPlayers;

  if (remainingPlayers === 0) return '';

  if (matchType.value === 'singles') {
    return '1 player waiting - Practice serves or warm up';
  }

  // Doubles
  const suggestions = {
    1: 'Practice serves or warm up',
    2: 'Practice doubles positioning',
    3: 'Practice singles or wait for 1 more player',
  };

  return `${remainingPlayers} player${remainingPlayers > 1 ? 's' : ''} waiting - ${suggestions[remainingPlayers as keyof typeof suggestions]}`;
};

// Watch for cloud config changes and save to localStorage
watch([likhaUrl, likhaToken], () => {
  localStorage.setItem('likhaUrl', likhaUrl.value);
  localStorage.setItem('likhaToken', likhaToken.value);
  performCloudSync();
});

// Match actions composable — extracted match lifecycle functions
const {
  currentAdminName,
  isCourtAvailable,
  assignCourt,
  createBalancedMatch,
  generateNewMatches,
  openMatchResultDialog,
  completeMatch,
  autoAdvanceNextMatchForCourt,
  cancelMatch,
  startMatch,
  editMatch,
  saveMatchEdit,
  currentMatchType,
  availableQueuePlayers,
  removePlayerFromEdit,
  addPlayerToEdit,
  replacePlayerInEdit,
  selectReplacementPlayer,
} = useMatchActions({
  matches,
  queue,
  filteredMatches,
  matchType,
  queuePriorityMode,
  queueReturnMethod,
  queueReturnOptions,
  autoAdvanceMatches,
  availableCourts,
  currentClubUUID,
  clubMembers,
  currentUserId,
  selectedPlayers,
  manualTeam1,
  manualTeam2,
  manualSelectionStep,
  selectedForSwap,
  selectedForSwapTeam,
  currentMatchIndex,
  currentMatchIndexForActions,
  teamAScore,
  teamBScore,
  showMatchResultDialog,
  showMatchEditDialog,
  showReplacePlayerDialog,
  playerToReplaceInEdit,
});

// Wire lazy stubs for useMatchSettings forward references
_isCourtAvailable = isCourtAvailable;
_autoAdvanceNextMatchForCourt = autoAdvanceNextMatchForCourt;

// Manual selection composable — extracted start/cancel/toggle/proceed/create functions
const {
  startManualSelection,
  cancelManualSelection,
  togglePlayerSelection,
  isPlayerSelected,
  proceedToTeamArrangement,
  createManualMatchWithCourt,
} = useManualSelection({
  matchType,
  matches,
  currentAdminName,
  createBalancedMatch,
  assignCourt,
  showManualSelectionDialog,
  manualSelectionStep,
  selectedPlayers,
  manualTeam1,
  manualTeam2,
  selectedForSwap,
  selectedForSwapTeam,
});

// Edit player functions
const openEditPlayerDialog = (player: Player) => {
  editingPlayer.value = player;
  editPlayerName.value = player.username;
  editPlayerLevel.value = player.level;
  showEditPlayerDialog.value = true;
};

const openPlayerReportDialog = (
  player: Player,
  type: 'report' | 'commend' = 'commend',
) => {
  reportTargetPlayer.value = player;
  reportInitialType.value = type;
  showPlayerReportDialog.value = true;
};

const savePlayerEdit = () => {
  if (
    !editingPlayer.value ||
    !editPlayerName.value?.trim() ||
    editPlayerLevel.value === null
  ) {
    return;
  }

  const trimmedName = editPlayerName.value.trim();
  const originalName = editingPlayer.value.username;
  const newLevel = editPlayerLevel.value;

  // Double check for name conflicts
  if (hasNameConflict.value) {
    notify({
      type: 'negative',
      message: `Player "${trimmedName}" already exists`,
    });
    return;
  }

  // Update in MatchmakingApp state directly
  const playerState = MatchmakingApp.state.players[originalName];
  if (!playerState) {
    notify({
      type: 'negative',
      message: 'Player not found',
    });
    return;
  }

  if (originalName !== trimmedName && !playerState.userId) {
    MatchmakingApp.state.players[trimmedName] = {
      ...playerState,
      username: trimmedName,
      level: newLevel,
      updatedAt: Date.now(),
    };
    delete MatchmakingApp.state.players[originalName];

    // Update queue
    MatchmakingApp.state.queues.forEach((q) => {
      if (q.username === originalName) {
        q.username = trimmedName;
      }
    });

    // Update active matches
    MatchmakingApp.state.activeMatches.forEach((m) => {
      const idxA = m.teamA.indexOf(originalName);
      if (idxA !== -1) m.teamA[idxA] = trimmedName;

      const idxB = m.teamB.indexOf(originalName);
      if (idxB !== -1) m.teamB[idxB] = trimmedName;
    });

    // Update history records for all players
    Object.values(MatchmakingApp.state.players).forEach((p) => {
      if (p.history) {
        if (p.history.playedWith[originalName] !== undefined) {
          p.history.playedWith[trimmedName] =
            p.history.playedWith[originalName];
          delete p.history.playedWith[originalName];
        }
        if (p.history.playedAgainst[originalName] !== undefined) {
          p.history.playedAgainst[trimmedName] =
            p.history.playedAgainst[originalName];
          delete p.history.playedAgainst[originalName];
        }
      }
    });
  } else {
    playerState.level = newLevel;
    playerState.updatedAt = Date.now();

    // For non-registered (guest) players, also update the rating based on the new level
    if (!playerState.userId) {
      const newRating = newLevel === 1 ? 1450 : newLevel === 2 ? 1500 : 1550;
      playerState.rating = newRating;
      playerState.ratingUpdatedAt = Date.now();
    }
  }

  MatchmakingApp.persist();

  notify({
    type: 'positive',
    message: `Player updated to "${trimmedName}" (Level ${newLevel})`,
  });

  // Reset and close dialog
  showEditPlayerDialog.value = false;
  editingPlayer.value = null;
  editPlayerName.value = null;
  editPlayerLevel.value = null;
};
</script>

<style lang="scss">
.no-scrollbar {
  overflow: visible !important;
  max-height: none !important;
}
.allstar-draft-dropdown {
  display: flex;
  .q-btn-dropdown--current {
    flex: 1 1 0;
    min-width: 0;
  }
}
@media (max-width: 599px) {
  .club-sort-col {
    margin-top: 8px;
  }
}
.doubles-queue-page {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
  padding-bottom: 2rem;
}

.header-section {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem 0;
  margin-bottom: 1.5rem;
  position: relative;
}

.club-sync-bar {
  position: absolute !important;
  top: auto !important;
  bottom: 0 !important;
  left: 0 !important;
  right: 0 !important;
  z-index: 10;
}

// Column header gradients matching the header theme
.players-header,
.queue-header,
.matches-header {
  min-height: 60px !important;
}

.players-header {
  background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%) !important;
}

.queue-header {
  background: linear-gradient(135deg, #764ba2 0%, #9f7aea 100%) !important;
}

.matches-header {
  background: linear-gradient(135deg, #5a67d8 0%, #667eea 100%) !important;
}

// Toolbar styling for headers
.players-header .q-toolbar,
.queue-header .q-toolbar,
.matches-header .q-toolbar {
  min-height: 60px;
  padding: 16px;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1rem;
}

.players-card,
.queue-card,
.matches-card {
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 15px rgba(0, 0, 0, 0.15);
  }
}

// Desktop (gt-sm) - equal height cards with viewport-based scroll areas
@media (min-width: 768px) {
  .players-card,
  .queue-card,
  .matches-card {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  // Make all cards equal height by stretching flex containers
  .players-card > .q-card-section:first-child,
  .queue-card > .q-card-section:first-child,
  .matches-card > .q-card-section:first-child {
    flex: 0 0 auto; // Header section stays at natural height
    display: flex;
    flex-direction: column;
  }

  .players-card > .q-card-section:nth-child(2),
  .matches-card > .q-card-section:nth-child(2),
  .queue-card > .q-card-section:nth-child(2) {
    flex: 1 1 auto; // Fill remaining space
    display: flex;
    flex-direction: column;
    min-height: 0; // Critical: allow this flex container to shrink properly
  }

  .card-content {
    display: flex;
    flex-direction: column;
    min-height: 0; // Critical for proper flex shrinking

    // Fixed header elements (stats, filters) should not be part of scrolling
    > *:not(.player-list):not(.q-list) {
      flex: 0 0 auto;
    }
  }

  // Players card: PlayerList with capped scrollable height
  .players-card .player-list {
    flex: 1 1 auto;
    min-height: 0;
    max-height: calc(100vh - 380px);
    overflow-y: auto;
  }

  // Queue card: PlayerList with dynamic max-height based on admin controls visibility
  .queue-card .player-list {
    flex: 1 1 auto;
    min-height: 0;
    max-height: v-bind(queueMaxHeightDesktop);
    overflow-y: auto;
  }

  // Matches card: q-list with capped scrollable height
  .matches-card .q-list {
    flex: 1 1 auto;
    min-height: 0;
    max-height: calc(100vh - 280px);
    overflow-y: auto;
  }

  // Queue card buttons section stays at natural height (auto)
  .queue-card > .q-card-section:nth-child(3) {
    flex: 0 0 auto;
  }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}

.player-item,
.queue-item,
.match-item {
  transition: background-color 0.2s ease;

  &:hover {
    background-color: rgba(0, 0, 0, 0.02);
  }
}

.queue-stats {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.match-teams {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  justify-content: space-between;
}

.team {
  display: flex;
  flex-direction: column;
  gap: 0.02rem;
  flex: 1;
  align-items: center;
}

.vs-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
}

.team-1 {
  justify-content: flex-end;
}

.team-2 {
  justify-content: flex-start;
}

.team-card {
  transition: all 0.2s ease;
  border: 2px solid transparent;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }
}

.winner-selected {
  border-color: #21ba45;
  background-color: rgba(33, 186, 69, 0.1);
}

// sort-select now uses default Quasar styling

// Responsive design
@media (max-width: 768px) {
  .container {
    padding: 0 0.5rem;
  }

  .header-section {
    padding: 0.75rem 0;
  }

  .match-item {
    padding: 0.75rem 0.5rem !important;
  }

  .player-name {
    color: #1976d2;
    font-size: 0.9rem;
  }

  .player-level {
    font-size: 0.7rem;
    margin-top: 0px;
  }

  .sort-select {
    min-width: 100px !important;
  }
}

// Custom scrollbar - always visible for better UX
.q-list {
  flex: 1;
  overflow-y: auto;

  // Firefox
  scrollbar-width: auto;
  -ms-overflow-style: auto;
}

// Manual Selection Dialog Styles
.manual-selection-container {
  max-width: 1200px;
  margin: 0 auto;
}

.player-selection-item {
  transition: all 0.2s ease;

  &.selected-player {
    background-color: rgba(156, 39, 176, 0.1);
    border-left: 4px solid #9c27b0;
  }

  &:hover {
    background-color: rgba(0, 0, 0, 0.03);
  }
}

.balance-indicator {
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 8px;
  border: 2px solid #e0e0e0;
}

.team-player-item {
  transition: background-color 0.2s ease;

  &:hover {
    background-color: rgba(0, 0, 0, 0.02);
  }
}

// Drag and Drop / Tap-to-Swap Styles
// Swappable player styles (Simplified - Click/Tap to swap)
.swappable-player {
  cursor: pointer;
  transition: all 0.3s ease;
  user-select: none;
  position: relative;
  touch-action: manipulation;

  &:active {
    background-color: rgba(0, 0, 0, 0.08);
  }

  &.selected-for-swap {
    background: linear-gradient(90deg, rgba(33, 186, 69, 0.2), transparent);
    border-left: 4px solid #21ba45;
    box-shadow: 0 4px 12px rgba(33, 186, 69, 0.3);
    animation: pulse-green 1.5s ease-in-out infinite;
  }

  &.can-swap-with:hover {
    background-color: rgba(33, 186, 69, 0.1);
    border: 2px dashed #21ba45;
    transform: translateX(4px);
  }

  &:hover:not(.selected-for-swap) {
    background-color: rgba(0, 0, 0, 0.04);
    transform: translateX(4px);
  }
}

.team-drop-area {
  min-height: 200px;
  position: relative;
}

.empty-team-drop {
  opacity: 0.6;
}

// Animations
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

@keyframes pulse-green {
  0%,
  100% {
    box-shadow: 0 4px 12px rgba(33, 186, 69, 0.3);
    border-left-width: 4px;
  }

  50% {
    box-shadow: 0 6px 20px rgba(33, 186, 69, 0.6);
    border-left-width: 6px;
  }
}

// Swap icon animations
.swap-icon-pulse {
  animation: icon-bounce 0.8s ease-in-out infinite;
}

@keyframes icon-bounce {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.2);
  }
}

// Avatar pulse animation
.swap-pulse {
  animation: avatar-pulse 1s ease-in-out infinite;
}

@keyframes avatar-pulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7);
  }

  50% {
    transform: scale(1.1);
    box-shadow: 0 0 0 10px rgba(255, 255, 255, 0);
  }
}

// Speaking pulse animation for mute/unmute button
.speaking-pulse {
  animation: speaking-pulse 1.2s ease-in-out infinite;
}

@keyframes speaking-pulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(33, 186, 69, 0.5);
  }

  50% {
    transform: scale(1.15);
    box-shadow: 0 0 0 8px rgba(33, 186, 69, 0);
  }
}

// Mobile dialog improvements
@media (max-width: 599px) {
  .q-dialog__inner {
    padding: 8px;
  }

  .q-dialog {
    .q-layout,
    .q-card {
      border-radius: 12px;
      box-shadow:
        0 15px 20px -5px rgba(0, 0, 0, 0.1),
        0 8px 8px -5px rgba(0, 0, 0, 0.04);
    }
  }

  // Override universal rule for mobile
  .q-dialog__inner > * {
    border-radius: 12px !important;
    box-shadow:
      0 15px 20px -5px rgba(0, 0, 0, 0.1),
      0 8px 8px -5px rgba(0, 0, 0, 0.04) !important;
  }

  .q-card {
    margin: 0 !important;
  }

  .q-card-section {
    padding: 16px !important;

    // Tighter padding for headers on mobile
    &.players-header,
    &.queue-header,
    &.matches-header {
      padding: 12px 16px !important;

      .text-h6 {
        font-size: 1rem;
      }
    }
  }

  .q-card-actions {
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 16px !important;

    .q-btn {
      flex: 1 1 auto;
      min-width: 100px;
    }
  }

  .team-card {
    margin-bottom: 12px;
  }

  // Improve text readability
  .text-h6 {
    font-size: 1.15rem;
  }

  .text-subtitle1 {
    font-size: 1rem;
  }

  // Make dialog buttons stack on very small screens
  @media (max-width: 360px) {
    .q-card-actions {
      flex-direction: column;

      .q-btn {
        width: 100%;
        min-width: unset;
      }
    }
  }
}

// Match Edit Dialog Styles
.player-edit-item {
  transition: all 0.2s ease;

  &:hover {
    background-color: rgba(0, 0, 0, 0.02);
  }
}

// Enhanced Sticky Header Effects
.q-header[reveal] {
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease;

  &.q-header--hidden {
    transform: translateY(-100%);
  }

  &.q-header--revealed {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
}

// Sticky Footer Effects
.q-footer {
  transition: box-shadow 0.3s ease;

  &.q-footer--revealed {
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.15);
  }
}

// Page Sticky Enhancements
.q-page-sticky {
  z-index: 1000;

  .q-btn {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;

    &:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    }
  }
}

// Ensure footer buttons are properly positioned
.q-footer {
  position: relative !important;
  z-index: 100;

  .q-toolbar {
    position: relative !important;
    background: inherit;
  }

  .q-btn {
    position: relative !important;
    z-index: 101;
  }
}

// Prevent floating appearance of dialog buttons
.q-dialog .q-layout {
  display: flex;
  flex-direction: column;
  height: 100%;

  .q-page-container {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .q-page {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 0;
  }

  .q-footer {
    flex-shrink: 0;
    position: relative;
    bottom: 0;
    margin-top: auto;
  }
}

// Modern dialog styling with consistent border radius
.q-dialog {
  .q-layout {
    max-height: 90vh;
    overflow: hidden;
    border-radius: 16px;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }

  .q-page {
    max-height: calc(90vh - 120px);
    overflow-y: auto;
  }

  .q-card {
    border-radius: 16px;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }

  // Ensure all dialog containers have consistent styling
  .q-dialog__inner {
    .q-layout,
    .q-card {
      border-radius: 16px;
      box-shadow:
        0 20px 25px -5px rgba(0, 0, 0, 0.1),
        0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }
  }
}

// Universal dialog styling - applies to ALL dialogs
.q-dialog__inner > * {
  border-radius: 16px !important;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
}

// More specific targeting for q-card dialogs
.q-dialog .q-card {
  border-radius: 16px !important;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
}

// Even more specific targeting for dialog cards
.q-dialog__inner .q-card {
  border-radius: 16px !important;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
}

// Consistent Mobile Dialog Sizing
@media (max-width: 768px) {
  .q-dialog {
    .q-layout {
      margin: 8px;
      max-height: calc(100vh - 16px);
      width: 95vw !important;
      min-width: unset !important;
      border-radius: 12px;
      box-shadow:
        0 15px 20px -5px rgba(0, 0, 0, 0.1),
        0 8px 8px -5px rgba(0, 0, 0, 0.04);
    }

    .q-card {
      border-radius: 12px;
      box-shadow:
        0 15px 20px -5px rgba(0, 0, 0, 0.1),
        0 8px 8px -5px rgba(0, 0, 0, 0.04);
    }

    .q-page {
      padding: 12px;
    }
  }

  // Override universal rule for tablet
  .q-dialog__inner > * {
    border-radius: 12px !important;
    box-shadow:
      0 15px 20px -5px rgba(0, 0, 0, 0.1),
      0 8px 8px -5px rgba(0, 0, 0, 0.04) !important;
  }

  // Override q-card rule for tablet
  .q-dialog .q-card {
    border-radius: 12px !important;
    box-shadow:
      0 15px 20px -5px rgba(0, 0, 0, 0.1),
      0 8px 8px -5px rgba(0, 0, 0, 0.04) !important;
  }

  // Override dialog inner q-card rule for tablet
  .q-dialog__inner .q-card {
    border-radius: 12px !important;
    box-shadow:
      0 15px 20px -5px rgba(0, 0, 0, 0.1),
      0 8px 8px -5px rgba(0, 0, 0, 0.04) !important;
  }
}

@media (max-width: 480px) {
  .q-dialog {
    .q-layout {
      width: 98vw !important;
      margin: 4px;
      border-radius: 8px;
      box-shadow:
        0 10px 15px -5px rgba(0, 0, 0, 0.1),
        0 6px 6px -5px rgba(0, 0, 0, 0.04);
    }

    .q-card {
      border-radius: 8px;
      box-shadow:
        0 10px 15px -5px rgba(0, 0, 0, 0.1),
        0 6px 6px -5px rgba(0, 0, 0, 0.04);
    }
  }

  // Override universal rule for small mobile
  .q-dialog__inner > * {
    border-radius: 8px !important;
    box-shadow:
      0 10px 15px -5px rgba(0, 0, 0, 0.1),
      0 6px 6px -5px rgba(0, 0, 0, 0.04) !important;
  }

  // Override q-card rule for small mobile
  .q-dialog .q-card {
    border-radius: 8px !important;
    box-shadow:
      0 10px 15px -5px rgba(0, 0, 0, 0.1),
      0 6px 6px -5px rgba(0, 0, 0, 0.04) !important;
  }

  // Override dialog inner q-card rule for small mobile
  .q-dialog__inner .q-card {
    border-radius: 8px !important;
    box-shadow:
      0 10px 15px -5px rgba(0, 0, 0, 0.1),
      0 6px 6px -5px rgba(0, 0, 0, 0.04) !important;
  }
}

// Mobile Tabs Styling
.mobile-card {
  border-radius: 12px;
  margin-top: 0.5rem;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.mobile-card > .q-card-section:first-child {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0; // Critical for proper flex shrinking
}

.mobile-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; // Critical: allow flex item to shrink below content size
  padding-bottom: 1rem; // Add spacing at bottom for scroll visibility

  // Ensure the PlayerList component takes remaining space and scrolls
  .player-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0; // Allow proper flex shrinking
  }

  // Fixed header elements (stats, filters) should not be part of scrolling
  > *:not(.player-list) {
    flex: 0 0 auto;
  }
}

// Adjust mobile card content for different screen sizes
@media (max-width: 480px) {
  .mobile-card-content {
    min-height: 300px;
  }
}

@media (max-height: 600px) {
  .mobile-card-content {
    min-height: 250px;
  }
}

// For very small screens
@media (max-width: 360px) {
  .mobile-card-content {
    min-height: 280px;
  }
}

// Tab styling for mobile
.q-tabs {
  background: white;
  border-radius: 12px 12px 0 0;

  .q-tab {
    border-radius: 8px 8px 0 0;
    margin: 0 2px;
    min-height: 56px;
    transition: transform 0.1s ease;

    &.q-tab--active {
      background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%);
      color: white !important;
    }

    // Shake animation for tab updates
    &.shake {
      animation: tabShake 0.6s ease-in-out;
    }

    .q-icon {
      font-size: 1.2rem;
    }
  }
}

// Ensure mobile tab panels have proper height for scrolling
.lt-md {
  .q-tab-panels {
    height: 100%;
  }

  .q-tab-panel {
    height: 100%;
    min-height: 500px; // Ensure enough height for all tabs
    padding: 0;

    .mobile-card {
      height: 100%;
    }
  }

  // All cards: let flex layout determine height dynamically based on visible controls
  .queue-card .mobile-card-content,
  .players-card .mobile-card-content,
  .matches-card .mobile-card-content {
    flex: 1;
    min-height: 0; // Allow shrinking to fit available space
  }

  // Mobile queue list: shorter max-height when admin controls are visible
  .queue-card .player-list {
    max-height: v-bind(queueMaxHeightMobile);
  }

  // Mobile players list: capped scrollable height
  .players-card .player-list {
    max-height: calc(100vh - 280px);
  }

  // Mobile matches list: capped scrollable height
  .matches-card .q-list {
    max-height: calc(100vh - 280px);
  }
}

// Tab shake animation keyframes
@keyframes tabShake {
  0%,
  100% {
    transform: translateX(0);
  }

  10%,
  30%,
  50%,
  70%,
  90% {
    transform: translateX(-2px);
  }

  20%,
  40%,
  60%,
  80% {
    transform: translateX(2px);
  }
}

.q-tab-panels {
  background: white;
  border-radius: 0 0 12px 12px;

  .q-tab-panel {
    padding: 0.5rem;
  }
}

// Responsive tab adjustments
@media (max-width: 480px) {
  .q-tabs {
    .q-tab {
      min-height: 52px;
      font-size: 0.75rem;

      .q-tab__content {
        min-width: unset;
        padding: 0 8px;
      }

      .q-icon {
        font-size: 1.1rem;
      }
    }
  }

  // All cards: keep reasonable minimum height on very small screens
  .queue-card .mobile-card-content,
  .players-card .mobile-card-content,
  .matches-card .mobile-card-content {
    min-height: 280px;
  }
}

// Feedback list ellipsis styling
.feedback-list {
  .q-item__section--main {
    min-width: 0;
  }

  .q-item__label.text-weight-medium,
  .q-item__label.text-grey-7,
  .q-item__label.text-grey-8 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
