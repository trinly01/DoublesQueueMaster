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
      <div class="header-section">
        <div class="container">
          <div class="row items-center justify-between">
            <div class="col">
              <div class="row items-center q-mb-none">
                <q-avatar
                  v-if="getClubLogoUrl"
                  size="40px"
                  class="q-mr-xs"
                  style="top: 8px"
                >
                  <img :src="getClubLogoUrl" :alt="clubName" />
                </q-avatar>
                <q-avatar v-else size="40px" class="q-mr-xs" style="top: 8px">
                  <img :src="logoUrl" alt="DinkMatch" />
                </q-avatar>
                <div class="col">
                  <h1
                    :class="$q.screen.lt.md ? 'text-h6' : 'text-h5'"
                    class="text-weight-bold text-white q-ma-none ellipsis"
                    style="line-height: 1.3"
                  >
                    {{ clubName }}
                  </h1>
                  <span
                    class="text-caption text-weight-medium text-grey-1"
                    style="
                      line-height: 1;
                      display: block;
                      padding-top: 2px;
                      padding-left: 4px;
                    "
                  >
                    DinkMatch.club
                  </span>
                </div>
              </div>
              <p
                class="text-caption q-ma-none"
                :style="{
                  fontSize: $q.screen.lt.md ? '10px' : '12px',
                  color: 'rgba(255, 255, 255, 0.6)',
                  paddingLeft: '40px',
                }"
              >
                Smart queue matchmaking
              </p>
            </div>
            <div class="col-auto">
              <q-fab
                color="white"
                text-color="white"
                icon="menu"
                direction="down"
                flat
                padding="sm"
              >
                <q-fab-action
                  color="white"
                  text-color="primary"
                  icon="emoji_events"
                  @click="showLeaderboardDialog = true"
                >
                  <q-tooltip
                    anchor="center left"
                    self="center right"
                    :offset="[8, 0]"
                    >Leaderboard</q-tooltip
                  >
                </q-fab-action>
                <q-fab-action
                  color="white"
                  text-color="primary"
                  icon="share"
                  @click="copyClubLink"
                >
                  <q-tooltip
                    anchor="center left"
                    self="center right"
                    :offset="[8, 0]"
                    >Share</q-tooltip
                  >
                </q-fab-action>
                <q-fab-action
                  v-if="isCurrentUserAdmin"
                  :color="ttsEnabled ? 'white' : 'amber-4'"
                  :text-color="ttsEnabled ? 'primary' : 'white'"
                  :icon="ttsEnabled ? 'volume_up' : 'volume_off'"
                  :class="{ 'speaking-pulse': isSpeaking }"
                  @click="
                    ttsEnabled
                      ? ((ttsEnabled = false), clearSpeechQueue())
                      : (ttsEnabled = true)
                  "
                >
                  <q-tooltip
                    anchor="center left"
                    self="center right"
                    :offset="[8, 0]"
                    >{{ ttsEnabled ? 'Mute' : 'Unmute' }}</q-tooltip
                  >
                </q-fab-action>
                <q-fab-action
                  v-if="isCurrentUserAdmin"
                  color="white"
                  text-color="primary"
                  icon="settings"
                  @click="showSettingsDialog = true"
                >
                  <q-badge
                    v-if="unreadClubFeedbackCount > 0"
                    color="negative"
                    floating
                    rounded
                    style="top: -4px; right: -4px"
                  >
                    {{
                      unreadClubFeedbackCount > 99
                        ? '99+'
                        : unreadClubFeedbackCount
                    }}
                  </q-badge>
                  <q-tooltip
                    anchor="center left"
                    self="center right"
                    :offset="[8, 0]"
                    >Settings</q-tooltip
                  >
                </q-fab-action>
              </q-fab>
            </div>
          </div>
        </div>
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
      </div>

      <LeaderboardDialog
        v-model="showLeaderboardDialog"
        :leaderboard="clubLeaderboard"
        :loading="clubLeaderboardLoading"
      />

      <div class="container q-pa-md">
        <q-banner
          v-if="!isOnline"
          :class="
            $q.dark.isActive ? 'bg-grey-8 text-white' : 'bg-grey-2 text-grey-9'
          "
          class="q-mb-sm rounded-borders"
        >
          <template v-slot:avatar>
            <q-icon name="signal_wifi_off" color="primary" />
          </template>
          You have lost connection to the internet. This app is offline. Any
          changes made will be saved locally and synced automatically when you
          reconnect.
        </q-banner>

        <q-banner
          v-if="clubLoadingState === 'error'"
          class="bg-red-1 text-red-9 q-mb-sm rounded-borders"
          inline-actions
        >
          <template v-slot:avatar>
            <q-icon name="error_outline" color="red" />
          </template>
          {{ clubErrorMessage }}
          <template v-slot:action>
            <q-btn
              flat
              color="red"
              label="Dismiss"
              @click="clubLoadingState = 'loaded'"
            />
          </template>
        </q-banner>

        <q-banner
          v-if="
            clubLoadingState === 'loaded' && !isCurrentUserMember && !isOpenPlay
          "
          :class="
            $q.dark.isActive ? 'bg-blue-8 text-white' : 'bg-blue-1 text-blue-9'
          "
          class="q-mb-sm rounded-borders"
          inline-actions
        >
          <template v-slot:avatar>
            <q-icon name="groups" color="blue" />
          </template>
          You are not a member of this club yet.
          <template v-slot:action>
            <q-btn
              flat
              color="blue"
              label="Join Club"
              @click="handleJoinClub"
            />
          </template>
        </q-banner>

        <!-- Desktop/Large Tablet Layout: 3 Columns -->
        <div class="row q-col-gutter-lg gt-sm">
          <!-- Left Column: Players List -->
          <div class="col-12 col-md-4">
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
                    @player-commend="
                      (p) => openPlayerReportDialog(p, 'commend')
                    "
                    @player-report="(p) => openPlayerReportDialog(p, 'report')"
                    @player-remove="removePlayer"
                    @player-requeue="requeuePlayer"
                    @empty-action="showAddPlayerDialog = true"
                  />
                </div>
              </q-card-section>
            </q-card>
          </div>

          <!-- Center Column: Queue -->
          <div class="col-12 col-md-4">
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
                    @player-commend="
                      (p) => openPlayerReportDialog(p, 'commend')
                    "
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
                  <q-btn
                    class="col"
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
                  <q-btn
                    class="col"
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
                <PayBanner
                  v-if="isClubSubscriptionExpired"
                  class="q-mt-sm"
                  message="Competitive & All-Star are Pro features."
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
          </div>

          <!-- Right Column: Matches -->
          <div class="col-12 col-md-4">
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
          </div>
        </div>

        <!-- Mobile Layout: qTabs -->
        <div class="lt-md">
          <q-tabs
            v-model="activeMobileTab"
            class="text-grey-7"
            active-color="primary"
            indicator-color="primary"
            align="justify"
            narrow-indicator
            scrollable="false"
          >
            <q-tab
              name="players"
              icon="people"
              :label="`Players (${players.length})`"
              :class="{ shake: tabShakeStates.players }"
            />
            <q-tab
              name="queue"
              icon="queue"
              :label="`Queue (${queue.length})`"
              :class="{ shake: tabShakeStates.queue }"
            />
            <q-tab
              name="matches"
              icon="sports_tennis"
              :label="`Matches (${filteredMatches.length})`"
              :class="{ shake: tabShakeStates.matches }"
            />
          </q-tabs>

          <q-separator />

          <q-tab-panels v-model="activeMobileTab" animated>
            <!-- Players Tab -->
            <q-tab-panel name="players">
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
                      @player-commend="
                        (p) => openPlayerReportDialog(p, 'commend')
                      "
                      @player-report="
                        (p) => openPlayerReportDialog(p, 'report')
                      "
                      @player-remove="removePlayer"
                      @player-requeue="requeuePlayer"
                      @empty-action="showAddPlayerDialog = true"
                    />
                  </div>
                </q-card-section>
              </q-card>
            </q-tab-panel>

            <!-- Queue Tab -->
            <q-tab-panel name="queue">
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
                      @player-commend="
                        (p) => openPlayerReportDialog(p, 'commend')
                      "
                      @player-report="
                        (p) => openPlayerReportDialog(p, 'report')
                      "
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
                    <q-btn
                      class="col"
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
                    <q-btn
                      class="col"
                      color="accent"
                      @click="startManualSelection"
                      size="md"
                      icon="touch_app"
                      :disable="
                        queue.length < (matchType === 'singles' ? 2 : 4)
                      "
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
                  <PayBanner
                    v-if="isClubSubscriptionExpired"
                    class="q-mt-sm"
                    message="Competitive & All-Star are Pro features."
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
            </q-tab-panel>

            <!-- Matches Tab -->
            <q-tab-panel name="matches">
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
            </q-tab-panel>
          </q-tab-panels>
        </div>
      </div>

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
      <q-dialog
        v-model="showManualSelectionDialog"
        :maximized="$q.screen.lt.md"
        transition-show="slide-up"
        transition-hide="slide-down"
      >
        <q-card
          class="bg-white"
          style="
            max-width: 700px;
            width: 95vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
          "
        >
          <!-- Header -->
          <DialogHeader
            :title="`${matchType === 'singles' ? 'Singles' : 'Doubles'} Match Selection`"
            icon="touch_app"
          />

          <!-- Content -->
          <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
            <div class="manual-selection-container">
              <!-- Step 1: Select Players -->
              <div v-if="manualSelectionStep === 1" class="selection-step">
                <div class="text-h6 q-mb-sm">
                  Step 1: Select
                  {{ matchType === 'singles' ? '2' : '4' }} Players
                </div>
                <div class="text-caption text-grey-7 q-mb-sm">
                  Click on players to select them for the match ({{
                    selectedPlayers.length
                  }}/{{ matchType === 'singles' ? 2 : 4 }} selected)
                </div>

                <q-list separator bordered class="rounded-borders">
                  <PlayerCard
                    v-for="player in queue"
                    :key="player.username"
                    :player="player"
                    :isSelected="isPlayerSelected(player)"
                    :showActions="true"
                    :show-feedback-button="false"
                    @click="togglePlayerSelection(player)"
                    class="player-selection-item cursor-pointer"
                  >
                    <template #actions="{ player }">
                      <q-checkbox
                        :model-value="isPlayerSelected(player)"
                        color="accent"
                        @click.stop="togglePlayerSelection(player)"
                      />
                    </template>
                  </PlayerCard>
                </q-list>
              </div>

              <!-- Step 2: Arrange Teams -->
              <div v-if="manualSelectionStep === 2" class="arrangement-step">
                <div class="text-h6 q-mb-sm">Step 2: Arrange Teams</div>

                <TeamArrangement
                  v-model:team1="manualTeam1"
                  v-model:team2="manualTeam2"
                  :create-balanced-match="createBalancedMatch"
                />
              </div>
            </div>
          </q-card-section>

          <!-- Footer Actions -->
          <q-separator />
          <q-card-actions align="right" class="q-pa-md">
            <!-- Step 1 Actions -->
            <template v-if="manualSelectionStep === 1">
              <q-btn
                flat
                label="Cancel"
                color="grey"
                @click="cancelManualSelection"
              />
              <q-btn
                v-if="matchType === 'doubles'"
                color="accent"
                label="Next: Arrange Teams"
                icon-right="arrow_forward"
                @click="proceedToTeamArrangement"
                :disable="selectedPlayers.length !== 4"
              />
              <q-btn
                v-else
                color="accent"
                label="Create Match"
                icon="check"
                @click="createManualMatchWithCourt"
                :disable="selectedPlayers.length !== 2"
              />
            </template>

            <!-- Step 2 Actions (Team Arrangement) -->
            <template v-else-if="manualSelectionStep === 2">
              <q-btn
                flat
                label="Back"
                icon="arrow_back"
                color="grey"
                @click="
                  () => {
                    manualSelectionStep = 1;
                    selectedForSwap = null;
                    selectedForSwapTeam = null;
                  }
                "
              />
              <q-btn
                flat
                label="Cancel"
                color="grey"
                @click="cancelManualSelection"
              />
              <q-btn
                color="accent"
                label="Create Match"
                icon="check"
                @click="createManualMatchWithCourt"
                :disable="manualTeam1.length !== 2 || manualTeam2.length !== 2"
              />
            </template>
          </q-card-actions>
        </q-card>
      </q-dialog>

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
import { readItems, updateItem, readMe } from '@likha-erp/likha-sdk';
import { likhaClient } from 'src/services/likhaClient';
import { useAuth } from 'src/composables/useAuth';
import { useCloudSync } from '../composables/useCloudSync';
import { useClubData } from '../composables/useClubData';
import { usePayment } from '../composables/usePayment';
import { useDeviceSettings } from 'src/composables/useDeviceSettings';

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar, LocalStorage, copyToClipboard } from 'quasar';
import logoUrl from 'src/assets/queue master logo.png';
import { useNotify } from 'src/composables/useNotify';
import TeamArrangement from '../components/TeamArrangement.vue';
import PlayerList from '../components/PlayerList.vue';
import PlayerCard from '../components/PlayerCard.vue';
import PlayerReportDialog from '../components/PlayerReportDialog.vue';
import PayBanner from '../components/PayBanner.vue';
import EmptyState from '../components/EmptyState.vue';
import DialogHeader from '../components/DialogHeader.vue';
import {
  getClubFeedback,
  type ClubFeedbackEntry,
} from '../services/playerReport';
import { type DirectusCompletedMatch } from '../services/playerProfile';
import MatchCard from '../components/MatchCard.vue';
import MatchResultDialog from '../components/club/MatchResultDialog.vue';
import EditPlayerDialog from '../components/club/EditPlayerDialog.vue';
import ReplacePlayerDialog from '../components/club/ReplacePlayerDialog.vue';
import LeaderboardDialog from '../components/club/LeaderboardDialog.vue';
import AddPlayerDialog from '../components/club/AddPlayerDialog.vue';
import MatchEditDialog from '../components/club/MatchEditDialog.vue';
import SettingsDialog from '../components/club/SettingsDialog.vue';
import {
  resolveAvatarUrl,
  getRatingColor,
  getRatingCategory,
} from '../utils/playerHelpers';
import { replayMatches } from '../utils/ratingReplay';
import { computeWinProbability } from '../services/matchmaking';
import { buildDuprCsv, downloadDuprCsv } from '../utils/duprExport';
import { useMatchSettings } from '../composables/useMatchSettings';
import {
  announce,
  getNextInLine,
  buildMatchAnnounceText,
  getPlayerName,
  clearSpeechQueue,
  isSpeaking,
  setAdminMode,
} from '../services/announcer';

// Player type

// Quasar instance for notifications
const $q = useQuasar();
const { notify } = useNotify();

// Announce match on double-click / double-tap on a match card
const handleCustomAnnounce = (match: {
  id: string;
  teamA: { firstName?: string; username: string }[];
  teamB: { firstName?: string; username: string }[];
  court?: number;
  status?: string;
}) => {
  // For waiting matches, only announce the next-in-line
  if (match.status === 'waiting') {
    const next = getNextInLine(
      matches.value,
      queuePriorityMode.value,
      MatchmakingApp.state.activeMatches,
    );
    if (next) {
      const na = next.teamA.map((u) =>
        getPlayerName(MatchmakingApp.state.players, u),
      );
      const nb = next.teamB.map((u) =>
        getPlayerName(MatchmakingApp.state.players, u),
      );
      const text = buildMatchAnnounceText(na, nb, true);
      announce(notify, text, next.matchId);
    }
    return;
  }

  // For in-progress matches, announce the match normally
  const a = match.teamA.map((p) => p.firstName || p.username);
  const b = match.teamB.map((p) => p.firstName || p.username);
  const text = buildMatchAnnounceText(a, b);
  announce(notify, text, match.id);
};

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
        matchmakingMode: m.matchmakingMode,
        generationType: m.generationType,
        isEdited: m.isEdited,
      };
    });
});

const duprExportableMatches = computed(() => {
  const resetAt = MatchmakingApp.state.completedMatchesResetAt ?? 0;
  return MatchmakingApp.state.completedMatches.filter(
    (m) => m.completedAt > resetAt,
  );
});

const adminMatchStats = computed(() => {
  const stats: Record<
    string,
    { total: number; auto: number; manual: number; edited: number }
  > = {};
  const completed = MatchmakingApp.state.completedMatches;
  console.log('[adminMatchStats] completedMatches count:', completed.length);
  for (const m of completed) {
    console.log('[adminMatchStats] match:', m.matchId, 'meta:', m.meta);
    const admin = m.meta?.generatedBy;
    if (!admin) continue;
    if (!stats[admin])
      stats[admin] = { total: 0, auto: 0, manual: 0, edited: 0 };
    stats[admin].total++;
    if (m.meta?.isEdited) stats[admin].edited++;
    else if (m.meta?.generationType === 'auto') stats[admin].auto++;
    else if (m.meta?.generationType === 'manual') stats[admin].manual++;
  }
  console.log('[adminMatchStats] result:', JSON.stringify(stats));
  console.log(
    '[adminMatchStats] adminMembers:',
    adminMembers.value.map((m) => ({
      firstName: m.firstName,
      username: m.username,
    })),
  );
  return stats;
});

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

const filteredSortedMembers = computed(() => {
  let list = clubMembers.value;
  const search = (clubSettingsSearch.value || '').trim().toLowerCase();
  if (search) {
    list = list.filter(
      (m) =>
        (m.firstName || '').toLowerCase().includes(search) ||
        (m.username || '').toLowerCase().includes(search) ||
        (m.email || '').toLowerCase().includes(search),
    );
  }
  list = [...list].sort((a, b) => {
    switch (clubSettingsSort.value) {
      case 'nameAsc':
        return (a.firstName || a.username || '').localeCompare(
          b.firstName || b.username || '',
        );
      case 'nameDesc':
        return (b.firstName || b.username || '').localeCompare(
          a.firstName || a.username || '',
        );
      case 'ratingDesc':
        return (b.rating || 0) - (a.rating || 0);
      case 'ratingAsc':
        return (a.rating || 0) - (b.rating || 0);
      default:
        return 0;
    }
  });
  return list;
});

const adminMembers = computed(() =>
  filteredSortedMembers.value.filter((m) => m.isAdmin),
);
const regularMembers = computed(() =>
  filteredSortedMembers.value.filter((m) => !m.isAdmin),
);

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

watch([showSettingsDialog, settingsTab], ([showDialog, tab]) => {
  if (showDialog && tab === 'club') {
    void refreshClubInfo().then(() => populateEditClubFields());
  }
});

type ClubLeaderboardEntry = {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  rating: number;
  avatar?: string;
  wins: number;
  losses: number;
  games: number;
  score: number;
  winRate: number;
};

const clubLeaderboard = ref<ClubLeaderboardEntry[]>([]);
const clubLeaderboardLoading = ref(false);

const getClubLeaderboardCacheKey = () =>
  `club_leaderboard_${currentClubUUID.value}`;
const loadCachedClubLeaderboard = () => {
  const raw = LocalStorage.getItem(getClubLeaderboardCacheKey());
  if (!raw) return false;
  try {
    const cached = raw as {
      data: ClubLeaderboardEntry[];
      timestamp: number;
    };
    if (
      cached &&
      Array.isArray(cached.data) &&
      Date.now() - cached.timestamp < 5 * 60 * 1000
    ) {
      clubLeaderboard.value = cached.data;
      return true;
    }
  } catch (e) {
    console.error('Failed to load cached club leaderboard:', e);
  }
  return false;
};
const saveCachedClubLeaderboard = () => {
  LocalStorage.set(getClubLeaderboardCacheKey(), {
    data: clubLeaderboard.value,
    timestamp: Date.now(),
  });
};

const fetchClubLeaderboard = async () => {
  if (!currentClubUUID.value || clubLeaderboardLoading.value) return;
  const cached = loadCachedClubLeaderboard();
  clubLeaderboardLoading.value = !cached || clubLeaderboard.value.length === 0;
  try {
    const matches = (await likhaClient.request(
      readItems('completed_match', {
        filter: { club: { _eq: currentClubUUID.value } },
        fields: ['*', 'players.directus_users_id.*'],
        sort: ['-completed_at'],
        limit: 500,
      }),
    )) as DirectusCompletedMatch[];

    // Replay matches chronologically using the same algorithm as the rating script.
    const replayed = replayMatches(
      [...matches].reverse().map((m) => ({
        teamAScore: m.team_a_score,
        teamBScore: m.team_b_score,
        teamA: (m.team_a || []).map((p) => ({
          username: p.username,
          name: p.firstName,
          firstName: p.firstName,
          lastName: p.lastName,
          rating: p.rating,
          avatar: p.avatar,
        })),
        teamB: (m.team_b || []).map((p) => ({
          username: p.username,
          name: p.firstName,
          firstName: p.firstName,
          lastName: p.lastName,
          rating: p.rating,
          avatar: p.avatar,
        })),
      })),
    );

    // Build registered-user info map from the players junction.
    const userMap = new Map<
      string,
      {
        firstName: string;
        lastName: string;
        avatar?: string;
      }
    >();
    for (const m of matches) {
      for (const jp of m.players || []) {
        const user = jp.directus_users_id;
        if (!user?.username) continue;
        userMap.set(user.username, {
          firstName: user.first_name || user.username,
          lastName: user.last_name || '',
          avatar: resolveAvatarUrl(user.avatar),
        });
      }
    }

    const memberMap = new Map(clubMembers.value.map((m) => [m.username, m]));
    const list = Object.values(replayed)
      .filter((p) => userMap.has(p.username))
      .map((p) => {
        const user = userMap.get(p.username);
        const member = memberMap.get(p.username);
        return {
          id: member?.id || p.username,
          username: p.username,
          firstName: member?.firstName || user?.firstName || p.firstName,
          lastName: member?.lastName || user?.lastName || p.lastName,
          rating: p.rating,
          avatar: resolveAvatarUrl(member?.avatar || user?.avatar || p.avatar),
          wins: p.wins,
          losses: p.losses,
          games: p.matchesPlayed,
          score: Math.round(p.rating),
          winRate: p.matchesPlayed > 0 ? (p.wins / p.matchesPlayed) * 100 : 0,
        };
      });
    const sorted = list.sort(
      (a, b) => b.score - a.score || (b.rating || 1450) - (a.rating || 1450),
    );
    clubLeaderboard.value = sorted.slice(0, 20);
    saveCachedClubLeaderboard();
    console.log(
      '[fetchClubLeaderboard] matches:',
      matches.length,
      'players:',
      list.length,
      'leaderboard:',
      clubLeaderboard.value,
    );
  } catch (err) {
    console.error('Failed to fetch club leaderboard:', err);
    if (!cached || clubLeaderboard.value.length === 0) {
      clubLeaderboard.value = [];
    }
  } finally {
    clubLeaderboardLoading.value = false;
  }
};

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

// Manual selection states
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

// ── Centralised announcement watcher ─────────────────
// Uses startedAt timestamps to detect newly-started matches
// and matchId to detect next-in-line changes.
const nextInLineMatch = computed(() =>
  getNextInLine(
    matches.value,
    queuePriorityMode.value,
    MatchmakingApp.state.activeMatches,
  ),
);

// Seed with current max startedAt so existing matches aren't re-announced.
// When no in-progress matches exist, seed with Date.now() so already-started
// matches from other admins don't get falsely announced on initial load.
const existingStartedAts = matches.value
  .filter((m) => m.status === 'in-progress')
  .map((m) => m.startedAt?.getTime() || 0);
const lastProcessedStartedAt = ref(
  existingStartedAts.length > 0 ? Math.max(...existingStartedAts) : Date.now(),
);
const prevNextInLineId = ref<string | null>(
  nextInLineMatch.value?.matchId || null,
);

watch(
  () => {
    const inProgress = matches.value
      .filter((m) => m.status === 'in-progress')
      .map((m) => m.id)
      .sort()
      .join(',');
    return `${inProgress}::${nextInLineMatch.value?.matchId || ''}`;
  },
  () => {
    // 1. Announce newly started matches (startedAt is new), sorted by start time
    const newlyStarted = matches.value
      .filter(
        (m) =>
          m.status === 'in-progress' &&
          m.startedAt &&
          m.startedAt.getTime() > lastProcessedStartedAt.value,
      )
      .sort(
        (a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0),
      );

    for (const m of newlyStarted) {
      const a = m.teamA.map((p) => p.firstName || p.username);
      const b = m.teamB.map((p) => p.firstName || p.username);
      const text = buildMatchAnnounceText(a, b);
      for (let i = 0; i < 2; i++) {
        announce(notify, text, m.id);
      }
    }

    if (newlyStarted.length > 0) {
      lastProcessedStartedAt.value = Math.max(
        lastProcessedStartedAt.value,
        ...newlyStarted.map((m) => m.startedAt!.getTime()),
      );
    }

    // 2. Then announce next-in-line if it changed
    const nextId = nextInLineMatch.value?.matchId || null;
    if (nextId && nextId !== prevNextInLineId.value) {
      const next = nextInLineMatch.value!;
      const na = next.teamA.map((u) =>
        getPlayerName(MatchmakingApp.state.players, u),
      );
      const nb = next.teamB.map((u) =>
        getPlayerName(MatchmakingApp.state.players, u),
      );
      const text = buildMatchAnnounceText(na, nb, true);
      announce(notify, text, next.matchId);
      prevNextInLineId.value = nextId;
    }
  },
);

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

const filteredMatches = computed(() => {
  let filtered =
    matchesFilterBy.value === 'all'
      ? matches.value
      : matches.value.filter((match) => match.status === matchesFilterBy.value);

  // Sort by status: in-progress first, then waiting, then by queue priority
  filtered = [...filtered].sort((a, b) => {
    const statusOrder = { 'in-progress': 0, waiting: 1, completed: 2 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
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
    const aTime =
      (a as unknown as { oldestQueueEntryAt?: number }).oldestQueueEntryAt ??
      a.createdAt.getTime();
    const bTime =
      (b as unknown as { oldestQueueEntryAt?: number }).oldestQueueEntryAt ??
      b.createdAt.getTime();
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

// Helper function to find the best singles pair from all available players
// Ultra-flexible match generation that handles ANY combination
// Court assignment logic
const assignCourt = (): number => {
  const courtCount = getCourtCount();

  // Enhanced load balancing: track both in-progress and waiting matches
  const courtLoads = new Map<
    number,
    { inProgress: number; waiting: number; total: number }
  >();
  for (let court = 1; court <= courtCount; court++) {
    courtLoads.set(court, { inProgress: 0, waiting: 0, total: 0 });
  }

  // Count existing matches per court with detailed breakdown
  matches.value.forEach((match) => {
    if (match.court) {
      const currentLoad = courtLoads.get(match.court)!;
      if (match.status === 'in-progress') {
        currentLoad.inProgress++;
      } else if (match.status === 'waiting') {
        currentLoad.waiting++;
      }
      currentLoad.total++;
    }
  });

  // Find the best court using enhanced criteria
  let bestCourt = 1;
  let bestScore = Infinity;

  for (let court = 1; court <= courtCount; court++) {
    const load = courtLoads.get(court)!;

    // Calculate court score (lower is better)
    // Priority 1: Empty courts (no in-progress matches) - highest priority
    // Priority 2: Courts with fewer total matches
    // Priority 3: Courts with fewer waiting matches
    let score = load.total * 1000; // Base score on total matches

    if (load.inProgress > 0) {
      score += 10000; // Heavy penalty for courts with in-progress matches
    }

    score += load.waiting * 100; // Slight penalty for waiting matches

    if (score < bestScore) {
      bestScore = score;
      bestCourt = court;
    }
  }

  return bestCourt;
};

// Assign courts to all matches with proper distribution
// Helper function to create balanced teams from 4 players with randomness
const createBalancedMatch = (players: Player[]): Player[] => {
  // If not exactly 4 players, return as-is (cannot balance)
  if (players.length !== 4) {
    return players;
  }

  // Sort players by rating for better team balancing
  const sortedPlayers = [...players].sort(
    (a, b) => (a.rating || 1450) - (b.rating || 1450),
  );

  // Generate all possible team combinations
  const combinations = generateTeamCombinations(sortedPlayers);

  // Calculate skill differences for all combinations
  const combinationsWithScores = combinations.map((combination) => {
    const team1 = combination.team1;
    const team2 = combination.team2;

    const team1Skill = team1.reduce((sum, p) => sum + (p.rating || 1450), 0);
    const team2Skill = team2.reduce((sum, p) => sum + (p.rating || 1450), 0);
    const difference = Math.abs(team1Skill - team2Skill);

    return {
      ...combination,
      difference,
      team1Skill,
      team2Skill,
    };
  });

  // Sort by skill difference (most balanced first)
  combinationsWithScores.sort((a, b) => a.difference - b.difference);

  // Get the best combinations (within 1 skill point difference)
  const bestDifference = combinationsWithScores[0].difference;
  const acceptableCombinations = combinationsWithScores.filter(
    (combo) => combo.difference <= bestDifference + 1,
  );

  // Randomly select from acceptable combinations
  const randomIndex = Math.floor(Math.random() * acceptableCombinations.length);
  const selectedCombination = acceptableCombinations[randomIndex];

  return [...selectedCombination.team1, ...selectedCombination.team2];
};

// Helper function to generate all possible team combinations
const generateTeamCombinations = (
  players: Player[],
): Array<{ team1: Player[]; team2: Player[] }> => {
  const combinations: Array<{ team1: Player[]; team2: Player[] }> = [];

  // Generate all possible ways to split 4 players into 2 teams of 2
  const indices = [0, 1, 2, 3];

  // Team 1 will have players at indices 0 and 1, Team 2 will have 2 and 3
  // But we need to try different combinations
  const team1Combinations = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ];

  for (const team1Indices of team1Combinations) {
    const team2Indices = indices.filter((i) => !team1Indices.includes(i));
    const team1 = team1Indices.map((i) => players[i]);
    const team2 = team2Indices.map((i) => players[i]);

    combinations.push({ team1, team2 });
  }

  return combinations;
};

// Helper function to create balanced singles matches from 2 players

const currentAdminName = computed(() => {
  const member = clubMembers.value.find((m) => m.id === currentUserId.value);
  return member?.firstName || member?.username || undefined;
});

const generateNewMatches = () => {
  MatchmakingApp.state.teamSize = matchType.value === 'singles' ? 1 : 2;
  MatchmakingApp.stampSetting('teamSize');
  MatchmakingApp.persist();
  MatchmakingApp.draftNextMatches(
    queuePriorityMode.value,
    currentAdminName.value,
  );

  if (autoAdvanceMatches.value) {
    const courtCount = getCourtCount();
    for (let c = 1; c <= courtCount; c++) {
      if (isCourtAvailable(c)) {
        autoAdvanceNextMatchForCourt(c);
      }
    }
  }

  notify({
    type: 'positive',
    message: 'Matches generated!',
  });
};

const openMatchResultDialog = (filteredIndex: number) => {
  // Find the actual match in the global matches array
  const filteredMatch = filteredMatches.value[filteredIndex];
  const globalIndex = matches.value.findIndex(
    (match) => match.id === filteredMatch.id,
  );

  currentMatchIndex.value = globalIndex;
  teamAScore.value = 0;
  teamBScore.value = 0;
  showMatchResultDialog.value = true;
};

const completeMatch = () => {
  if (currentMatchIndex.value === -1) {
    console.warn('[completeMatch] currentMatchIndex is -1, aborting');
    return;
  }
  const match = matches.value[currentMatchIndex.value];
  if (!match) {
    console.warn(
      '[completeMatch] match is undefined at index',
      currentMatchIndex.value,
    );
    return;
  }

  const scoreA = Number(teamAScore.value) || 0;
  const scoreB = Number(teamBScore.value) || 0;

  // Ensure the completed match is tagged with the current club UUID
  if (currentClubUUID.value && !MatchmakingApp.state.clubUUID) {
    MatchmakingApp.state.clubUUID = currentClubUUID.value;
  }

  if (scoreA === scoreB) {
    notify({
      type: 'warning',
      message: 'Ties are not allowed.',
    });
    return;
  }

  const freedCourt = match.court;
  console.log(
    '[completeMatch] Completing match',
    match.id,
    'court:',
    freedCourt,
    'returnMethod:',
    queueReturnMethod.value,
  );

  MatchmakingApp.reportMatchScore(
    match.id,
    scoreA,
    scoreB,
    queueReturnMethod.value,
  );

  if (freedCourt && autoAdvanceMatches.value) {
    autoAdvanceNextMatchForCourt(freedCourt);
  } else if (autoAdvanceMatches.value) {
    const courtCount = getCourtCount();
    for (let c = 1; c <= courtCount; c++) {
      if (isCourtAvailable(c)) {
        autoAdvanceNextMatchForCourt(c);
      }
    }
  }

  showMatchResultDialog.value = false;
  currentMatchIndex.value = -1;
  teamAScore.value = 0;
  teamBScore.value = 0;

  notify({
    type: 'positive',
    message: 'Match completed! Stats updated.',
  });
};

// Auto-advance next match for a specific court (priority based on queue settings)
const autoAdvanceNextMatchForCourt = (courtNumber?: number) => {
  // Only auto-advance if the setting is enabled
  if (!autoAdvanceMatches.value) return;

  // Find the highest-priority waiting match based on queuePriorityMode
  const waitingMatches = matches.value
    .filter(
      (match) =>
        match.status === 'waiting' &&
        (!match.court || match.court === courtNumber),
    )
    .sort((a, b) => {
      // Use queue priority order (same logic as filteredMatches)
      if (queuePriorityMode.value === 'gamesPlayed') {
        const aGames =
          (a as unknown as { minGamesPlayed?: number }).minGamesPlayed ?? 0;
        const bGames =
          (b as unknown as { minGamesPlayed?: number }).minGamesPlayed ?? 0;
        if (aGames !== bGames) return aGames - bGames;
      }
      const aTime =
        (a as unknown as { oldestQueueEntryAt?: number }).oldestQueueEntryAt ??
        a.createdAt.getTime();
      const bTime =
        (b as unknown as { oldestQueueEntryAt?: number }).oldestQueueEntryAt ??
        b.createdAt.getTime();
      return aTime - bTime;
    });

  const nextMatch = waitingMatches[0];

  if (nextMatch && courtNumber) {
    // Check if the court is actually available (no in-progress match on it)
    if (isCourtAvailable(courtNumber)) {
      // Court is available, assign and start the match
      const actualMatch = MatchmakingApp.state.activeMatches.find(
        (am) => am.matchId === nextMatch.id,
      );
      if (actualMatch) {
        startMatchOnCourt(actualMatch, courtNumber);
      }

      // Persist the auto-advance changes
      MatchmakingApp.persist();

      // Notify user about auto-advance
      notify({
        type: 'info',
        message: 'Next match auto-started',
        timeout: 3000,
      });
    } else {
      // Court is still occupied, don't auto-start the match
      // The match will remain in waiting status and can be started manually later
      console.log(
        `Court ${courtNumber} is occupied, cannot auto-advance waiting match`,
      );
    }
  }
};
_autoAdvanceNextMatchForCourt = autoAdvanceNextMatchForCourt;

const removePlayer = (username: string) => {
  $q.dialog({
    title: 'Remove Player',
    message: `Are you sure you want to remove "${username}"? This will delete their stats and remove them from the queue.`,
    cancel: { label: 'Cancel', color: 'grey', flat: true },
    ok: { label: 'Remove', color: 'negative', icon: 'delete' },
    persistent: true,
  }).onOk(() => {
    const player = MatchmakingApp.state.players[username];
    if (player) {
      player.deletedAt = Date.now();
      player.updatedAt = Date.now();
    }
    MatchmakingApp.removeFromQueue(username);
    MatchmakingApp.state.lastModified = Date.now();
    MatchmakingApp.persist();
    notify({
      type: 'info',
      message: `Player "${username}" removed`,
    });
  });
};

const removeFromQueue = (username: string) => {
  $q.dialog({
    title: 'Remove from Queue',
    message: `Remove "${username}" from the queue?`,
    cancel: { label: 'Cancel', color: 'grey', flat: true },
    ok: { label: 'Remove', color: 'warning', icon: 'remove_circle' },
    persistent: true,
  }).onOk(() => {
    MatchmakingApp.removeFromQueue(username);
    notify({
      type: 'info',
      message: `Player "${username}" removed from queue`,
    });
  });
};

const resetGamesPlayed = () => {
  $q.dialog({
    title: 'Confirm Reset Stats',
    message:
      'Are you sure you want to reset all player stats? This will set games played, wins, and losses to zero for all players.',
    cancel: {
      label: 'Cancel',
      color: 'grey',
      flat: true,
    },
    ok: {
      label: 'Reset Stats',
      color: 'accent',
      icon: 'refresh',
    },
    persistent: true,
  }).onOk(() => {
    // Reset player stats (preserve ratings)
    const now = Date.now();
    Object.values(MatchmakingApp.state.players).forEach((player) => {
      player.matchesPlayed = 0;
      player.wins = 0;
      player.losses = 0;
      player.statsUpdatedAt = now;
      player.updatedAt = now;
    });

    MatchmakingApp.persist();

    notify({
      type: 'positive',
      message: 'All player stats have been reset',
    });
  });
};

const clearMatches = () => {
  $q.dialog({
    title: 'Confirm Clear Matches',
    message:
      'Are you sure you want to clear all matches? This will remove all current matches from the system.',
    cancel: {
      label: 'Cancel',
      color: 'grey',
      flat: true,
    },
    ok: {
      label: 'Clear Matches',
      color: 'warning',
      icon: 'delete',
    },
    persistent: true,
  }).onOk(() => {
    // Tombstone all matches instead of wiping (for cross-admin sync)
    MatchmakingApp.state.activeMatches.forEach((m) => {
      m.deletedAt = Date.now();
      m.updatedAt = Date.now();
    });
    MatchmakingApp.persist();

    notify({
      type: 'positive',
      message: 'All matches have been cleared',
    });
  });
};

const clearQueue = () => {
  $q.dialog({
    title: 'Confirm Clear Queue',
    message:
      'Are you sure you want to clear the queue? This will remove all players from the queue.',
    cancel: {
      label: 'Cancel',
      color: 'grey',
      flat: true,
    },
    ok: {
      label: 'Clear Queue',
      color: 'warning',
      icon: 'delete_outline',
    },
    persistent: true,
  }).onOk(() => {
    // Tombstone all queue entries so deletions propagate across admins.
    // Keep the tombstoned entries in the array (do not wipe the array) —
    // otherwise a stale admin's live queue would resurrect on the next sync.
    const now = Date.now();
    MatchmakingApp.state.queues.forEach((q) => {
      q.deletedAt = now;
      q.updatedAt = now;
    });
    MatchmakingApp.persist();

    notify({
      type: 'positive',
      message: 'Queue has been cleared',
    });
  });
};

const requeuePlayer = (username: string) => {
  const p = players.value.find((p) => p.username === username);
  if (!p) return;

  $q.dialog({
    title: 'Add to Queue',
    message: `Add "${p.firstName || p.username}" to the queue?`,
    cancel: { label: 'Cancel', color: 'grey' },
    ok: { label: 'Add', color: 'accent' },
    persistent: true,
  }).onOk(() => {
    const result = MatchmakingApp.checkInPlayer(p.username, p.level);

    if (result === 'already_in_match') {
      notify({
        type: 'warning',
        message: `Player "${username}" is already in a match`,
      });
      return;
    }

    if (result === 'already_in_queue') {
      notify({
        type: 'warning',
        message: `Player "${username}" is already in the queue`,
      });
      return;
    }

    notify({
      type: 'positive',
      message: `Player "${username}" added to queue`,
    });
  });
};

const addAllPlayersToQueue = () => {
  $q.dialog({
    title: 'Add All Players to Queue',
    message: `Add all ${players.value.length} players to the queue?`,
    cancel: {
      label: 'Cancel',
      color: 'grey',
      flat: true,
    },
    ok: {
      label: 'Add All',
      color: 'accent',
      icon: 'group_add',
    },
    persistent: true,
  }).onOk(() => {
    let addedCount = 0;
    let alreadyInQueueCount = 0;
    let alreadyInMatchCount = 0;

    players.value.forEach((p) => {
      const result = MatchmakingApp.checkInPlayer(p.username, p.level);
      if (result === 'added') addedCount++;
      else if (result === 'already_in_queue') alreadyInQueueCount++;
      else if (result === 'already_in_match') alreadyInMatchCount++;
    });

    if (addedCount > 0) {
      notify({
        type: 'positive',
        message: `Added ${addedCount} player${addedCount > 1 ? 's' : ''} to queue`,
      });
    }

    if (alreadyInQueueCount > 0) {
      notify({
        type: 'warning',
        message: `Skipped ${alreadyInQueueCount} player${alreadyInQueueCount > 1 ? 's' : ''} already in queue`,
        timeout: 3000,
      });
    }

    if (alreadyInMatchCount > 0) {
      notify({
        type: 'warning',
        message: `Skipped ${alreadyInMatchCount} player${alreadyInMatchCount > 1 ? 's' : ''} already in match`,
        timeout: 3000,
      });
    }
  });
};

// Enhanced queue return functions

const resetSessionData = () => {
  const resetAt = MatchmakingApp.state.completedMatchesResetAt ?? 0;
  const lastExported = MatchmakingApp.state.lastExportedAt ?? 0;
  const unexported = MatchmakingApp.state.completedMatches.filter(
    (m) => m.completedAt > resetAt && m.completedAt > lastExported,
  );

  const doReset = () => {
    const now = Date.now();

    // Reset player stats
    Object.values(MatchmakingApp.state.players).forEach((player) => {
      player.matchesPlayed = 0;
      player.wins = 0;
      player.losses = 0;
      player.statsUpdatedAt = now;
      player.updatedAt = now;
    });

    // Hard-delete matches and queues; checkpoint handles cross-admin purge
    MatchmakingApp.state.activeMatches = [];
    MatchmakingApp.state.queues = [];
    MatchmakingApp.state.matchesResetAt = now;
    MatchmakingApp.state.queuesResetAt = now;

    // Epoch-based clear for completedMatches (multi-admin safe)
    MatchmakingApp.clearCompletedMatches();

    MatchmakingApp.state.settingsUpdatedAt = now;
    MatchmakingApp.state.lastModified = now;
    MatchmakingApp.persist();

    notify({
      type: 'positive',
      message: 'Session reset complete',
    });
  };

  if (unexported.length > 0) {
    $q.dialog({
      title: 'Unexported Matches',
      message: `You have ${unexported.length} completed match(es) that have not been exported to DUPR.`,
      ok: {
        label: 'Export & Reset',
        color: 'positive',
        icon: 'download',
        noCaps: true,
      },
      cancel: {
        label: 'Reset Anyway',
        color: 'negative',
        flat: true,
        noCaps: true,
      },
      persistent: true,
    })
      .onOk(() => {
        exportDuprCsv();
        doReset();
      })
      .onCancel(() => {
        $q.dialog({
          title: 'Confirm Reset Without Export',
          message: 'Are you sure? Unexported match data will be lost.',
          ok: {
            label: 'Reset Anyway',
            color: 'negative',
          },
          cancel: {
            label: 'Cancel',
            color: 'grey',
            flat: true,
          },
          persistent: true,
        }).onOk(doReset);
      });
    return;
  }

  $q.dialog({
    title: 'Reset Session',
    message:
      'This will reset all player stats, clear all matches, and clear the queue. Players will be kept. Are you sure?',
    cancel: {
      label: 'Cancel',
      color: 'grey',
      flat: true,
    },
    ok: {
      label: 'Reset Session',
      color: 'negative',
      icon: 'restart_alt',
    },
    persistent: true,
  }).onOk(doReset);
};

const exportDuprCsv = () => {
  const matches = duprExportableMatches.value;
  if (matches.length === 0) {
    notify({
      type: 'warning',
      message: 'No completed matches to export',
    });
    return;
  }

  const eventName = `${clubName.value || 'Club'} - ${new Date().toISOString().split('T')[0]}`;
  const scoreTypeVal = MatchmakingApp.state.scoreType || 'RALLY';

  const csv = buildDuprCsv(matches, { eventName, scoreType: scoreTypeVal });
  const filename = `dupr_matches_${route.params.id}_${new Date().toISOString().split('T')[0]}.csv`;
  downloadDuprCsv(csv, filename);
  MatchmakingApp.markExported();
  notify({
    type: 'positive',
    message: `Exported ${matches.length} match(es) to DUPR CSV`,
  });
};

const resetAllData = () => {
  $q.dialog({
    title: 'Reset Everything',
    message:
      'Are you sure you want to delete ALL data including players? This cannot be undone.',
    cancel: true,
    persistent: true,
    ok: {
      color: 'negative',
      label: 'Delete Everything',
    },
  }).onOk(() => {
    MatchmakingApp.hardResetEverything();
    showSettingsDialog.value = false;
    notify({
      type: 'warning',
      message: 'All data has been reset',
    });
  });
};

// Club Member Management
const removeClubMember = async (memberId: string, playerJunctionId: string) => {
  if (!currentClubUUID.value) return;
  try {
    await likhaClient.request(
      updateItem('club', currentClubUUID.value, {
        players: { delete: [playerJunctionId] },
      }),
    );
    await refreshClubMembers();
    notify({ type: 'positive', message: 'Member removed from club' });
  } catch (err) {
    console.error('Failed to remove club member:', err);
    notify({ type: 'negative', message: 'Failed to remove member' });
  }
};

const promoteToAdmin = async (memberId: string) => {
  if (!currentClubUUID.value) return;
  try {
    await likhaClient.request(
      updateItem('club', currentClubUUID.value, {
        admins: { create: [{ directus_users_id: memberId }] },
      }),
    );
    await refreshClubMembers();
    notify({ type: 'positive', message: 'Member promoted to admin' });
  } catch (err) {
    console.error('Failed to promote member:', err);
    notify({ type: 'negative', message: 'Failed to promote member' });
  }
};

const demoteAdmin = async (memberId: string, adminJunctionId: string) => {
  if (!currentClubUUID.value) return;
  try {
    await likhaClient.request(
      updateItem('club', currentClubUUID.value, {
        admins: { delete: [adminJunctionId] },
      }),
    );
    await refreshClubMembers();
    notify({ type: 'positive', message: 'Admin demoted to member' });
  } catch (err) {
    console.error('Failed to demote admin:', err);
    notify({ type: 'negative', message: 'Failed to demote admin' });
  }
};

const confirmDemoteAdmin = (
  memberId: string,
  adminJunctionId: string,
  name: string,
) => {
  const adminCount = clubMembers.value.filter((m) => m.isAdmin).length;
  if (adminCount <= 1) {
    notify({ type: 'warning', message: 'Club must have at least one admin' });
    return;
  }
  $q.dialog({
    title: 'Demote Admin',
    message: `Demote ${name} to regular member?`,
    cancel: true,
    persistent: true,
  }).onOk(() => demoteAdmin(memberId, adminJunctionId));
};

const confirmPromoteToAdmin = (memberId: string, name: string) => {
  $q.dialog({
    title: 'Make Admin',
    message: `Promote ${name} to admin?`,
    cancel: true,
    persistent: true,
  }).onOk(() => promoteToAdmin(memberId));
};

const confirmRemoveMember = (
  memberId: string,
  playerJunctionId: string,
  name: string,
  rating?: number,
) => {
  const player = MatchmakingApp.state.players[name];
  const isActive = !!player && !player.deletedAt;
  const activeStats = isActive
    ? `Games: ${player.matchesPlayed || 0} | Rating: ${player.rating || 1450}`
    : '';
  const ratingLine = rating ? `Rating: ${rating}` : '';
  const message = [
    `Remove ${name} from the club?`,
    ratingLine,
    activeStats,
    isActive ? 'This player is currently active in the session.' : '',
  ]
    .filter(Boolean)
    .join('\n');

  $q.dialog({
    title: 'Remove Member',
    message,
    cancel: true,
    persistent: true,
  }).onOk(() => removeClubMember(memberId, playerJunctionId));
};

const refreshClubMembers = async () => {
  if (!currentClubId.value) return;
  try {
    const result = await likhaClient.request(
      readItems('club', {
        filter: { clubId: { _eq: currentClubId.value } },
        fields: [
          'players.id',
          'players.directus_users_id.id',
          'players.directus_users_id.username',
          'players.directus_users_id.first_name',
          'players.directus_users_id.last_name',
          'players.directus_users_id.email',
          'players.directus_users_id.rating',
          'players.directus_users_id.dupr_id',
          'players.directus_users_id.avatar',
          'admins.id',
          'admins.directus_users_id.id',
          'admins.directus_users_id.email',
        ] as unknown as string[],
        deep: {
          players: { _limit: -1 },
          admins: { _limit: -1 },
        },
      }),
    );
    if (!result || result.length === 0) return;
    const club = result[0] as unknown as {
      players?: Array<{
        id: string;
        directus_users_id?: Record<string, unknown> | null;
      }>;
      admins?: Array<{
        id: string;
        directus_users_id?: { id?: string } | null;
      }>;
    };
    clubAdminIds.value = new Set(
      (club.admins || [])
        .map((a) => a.directus_users_id?.id)
        .filter((id): id is string => !!id),
    );
    const adminJunctionMap = new Map<string, string>();
    (club.admins || []).forEach((a) => {
      const uid = a.directus_users_id?.id;
      if (uid && a.id) adminJunctionMap.set(uid, a.id);
    });
    clubMembers.value =
      (club.players || [])
        .map((p) => {
          const u = p.directus_users_id as Record<string, unknown> | null;
          const userId = typeof u?.id === 'string' ? u.id : '';
          const avatarId = typeof u?.avatar === 'string' ? u.avatar : undefined;
          return {
            id: userId,
            username: typeof u?.username === 'string' ? u.username : undefined,
            firstName:
              typeof u?.first_name === 'string' ? u.first_name : undefined,
            lastName:
              typeof u?.last_name === 'string' ? u.last_name : undefined,
            email: typeof u?.email === 'string' ? u.email : undefined,
            rating: typeof u?.rating === 'number' ? u.rating : undefined,
            isAdmin: clubAdminIds.value.has(userId),
            avatar: avatarId
              ? `${likhaUrl.value}/assets/${avatarId}`
              : undefined,
            playerJunctionId: p.id || undefined,
            adminJunctionId: adminJunctionMap.get(userId) || undefined,
          };
        })
        .filter((m) => m.id) || [];
  } catch (err) {
    console.warn('Failed to refresh club members:', err);
  }
};

// Manual Selection Functions
const startManualSelection = () => {
  selectedPlayers.value = [];
  manualTeam1.value = [];
  manualTeam2.value = [];
  manualSelectionStep.value = 1;
  showManualSelectionDialog.value = true;
};

const cancelManualSelection = () => {
  selectedPlayers.value = [];
  manualTeam1.value = [];
  manualTeam2.value = [];
  manualSelectionStep.value = 1;
  selectedForSwap.value = null;
  selectedForSwapTeam.value = null;
  showManualSelectionDialog.value = false;
};

const togglePlayerSelection = (player: Player) => {
  const index = selectedPlayers.value.findIndex(
    (p) => p.username === player.username,
  );
  const maxPlayers = matchType.value === 'singles' ? 2 : 4;

  if (index >= 0) {
    // Remove player
    selectedPlayers.value.splice(index, 1);
  } else {
    // Add player if less than max selected
    if (selectedPlayers.value.length < maxPlayers) {
      selectedPlayers.value.push(player);
    } else {
      notify({
        type: 'warning',
        message: `You can only select ${maxPlayers} players`,
      });
    }
  }
};

const isPlayerSelected = (player: Player): boolean => {
  return selectedPlayers.value.some((p) => p.username === player.username);
};

const proceedToTeamArrangement = () => {
  const playerCount = selectedPlayers.value.length;

  if (playerCount < 2) {
    notify({
      type: 'warning',
      message: 'Please select at least 2 players',
    });
    return;
  }

  if (playerCount > 4) {
    notify({
      type: 'warning',
      message: 'Maximum 4 players allowed for tennis matches',
    });
    return;
  }

  // For doubles (4 players), use smart algorithm to create balanced teams
  if (playerCount === 4) {
    const balanced = createBalancedMatch([...selectedPlayers.value]);
    manualTeam1.value = [balanced[0], balanced[1]];
    manualTeam2.value = [balanced[2], balanced[3]];
  } else {
    // For singles or other configurations, clear teams
    manualTeam1.value = [];
    manualTeam2.value = [];
  }

  manualSelectionStep.value = 2;
};

// const getTeamSkill = (team: Player[]): number => {
//   return team.reduce((sum, p) => sum + p.level, 0);
// };

// const getSkillDifference = (): number => {
//   return Math.abs(getTeamSkill(manualTeam1.value) - getTeamSkill(manualTeam2.value));
// };

// Old functions - replaced by createManualMatchWithCourt
/*
const createManualMatch = () => {
  if (manualTeam1.value.length !== 2 || manualTeam2.value.length !== 2) {
    notify({
      type: 'warning',
      message: 'Each team must have exactly 2 players',
    });
    return;
  }

  // Check if teams are very unbalanced and show confirmation
  if (getSkillDifference() >= 3) {
    $q.dialog({
      title: 'Unbalanced Teams',
      message: `These teams are very unbalanced (skill difference: ${getSkillDifference()}). Are you sure you want to create this match?`,
      cancel: {
        label: 'Go Back',
        color: 'grey',
        flat: true
      },
      ok: {
        label: 'Create Anyway',
        color: 'accent',
        icon: 'check'
      },
      persistent: true
    }).onOk(() => {
      finalizeManualMatch();
    });
  } else {
    finalizeManualMatch();
  }
};

const finalizeManualMatch = () => {
  // Create the match
  const newMatch: Match = {
    id: `match-${Date.now()}`,
    players: [...manualTeam1.value, ...manualTeam2.value],
    status: 'waiting',
    order: matches.value.length + 1,
    createdAt: new Date(),
    court: undefined
  };
  matches.value.push(newMatch);

  // Remove players from queue
  const matchedPlayerNames = newMatch.players.map(p => p.username);
  queue.value = queue.value.filter(p => !matchedPlayerNames.includes(p.username));

  // Save data

  // Close dialog and reset
  showManualSelectionDialog.value = false;
  selectedPlayers.value = [];
  manualTeam1.value = [];
  manualTeam2.value = [];
  manualSelectionStep.value = 1;
  selectedForSwap.value = null;
  selectedForSwapTeam.value = null;

  notify({
    type: 'positive',
    message: 'Manual match created successfully!',
  });
};
*/

const createManualMatchWithCourt = () => {
  let matchPlayers: Player[];

  if (matchType.value === 'doubles') {
    matchPlayers = [...manualTeam1.value, ...manualTeam2.value];
  } else {
    matchPlayers = [...selectedPlayers.value];
  }

  // Check for duplicate players in the selection
  const usernames = matchPlayers.map((p) => p.username);
  const uniqueUsernames = new Set(usernames);
  if (usernames.length !== uniqueUsernames.size) {
    notify({
      type: 'negative',
      message: 'Cannot create match with duplicate players',
    });
    return;
  }

  // Check if any selected players are already in other matches
  const playersInMatches = matchPlayers.filter((p) =>
    MatchmakingApp.state.activeMatches.some(
      (m) =>
        !m.deletedAt &&
        (m.teamA.includes(p.username) || m.teamB.includes(p.username)),
    ),
  );

  if (playersInMatches.length > 0) {
    const names = playersInMatches.map((p) => p.username).join(', ');
    notify({
      type: 'negative',
      message: `Cannot create match: ${names} already in another match`,
    });
    return;
  }

  // Auto-assign a slot
  const assignedCourt = assignCourt();

  const isCourtEmpty =
    !!assignedCourt &&
    !matches.value.some(
      (m) => m.court === assignedCourt && m.status === 'in-progress',
    );

  // Map original queue types
  const originalQueueTypes: Record<string, 'GENERAL' | 'WINNERS' | 'LOSERS'> =
    {};
  matchPlayers.forEach((p) => {
    const queueEntry = MatchmakingApp.state.queues
      .filter((q) => !q.deletedAt)
      .find((q) => q.username === p.username);
    originalQueueTypes[p.username] = queueEntry?.queueType || 'GENERAL';
  });

  MatchmakingApp.state.activeMatches.push({
    matchId: `match-${Date.now()}`,
    queueSource: 'MANUAL',
    teamA: (matchType.value === 'doubles'
      ? manualTeam1.value
      : [selectedPlayers.value[0]]
    ).map((p) => p.username),
    teamB: (matchType.value === 'doubles'
      ? manualTeam2.value
      : [selectedPlayers.value[1]]
    ).map((p) => p.username),
    expectedDifference: 0,
    ...(isCourtEmpty
      ? {
          status: 'in-progress' as const,
          court: assignedCourt,
          startedAt: Date.now(),
        }
      : { status: 'waiting' as const, court: undefined }),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    originalQueueTypes,
    generatedBy: currentAdminName.value,
    generationType: 'manual' as const,
  });

  matchPlayers.forEach((p) => MatchmakingApp.removeFromQueue(p.username));
  MatchmakingApp.persist();

  showManualSelectionDialog.value = false;
  selectedPlayers.value = [];
  manualTeam1.value = [];
  manualTeam2.value = [];
  manualSelectionStep.value = 1;

  notify({
    type: 'positive',
    message: 'Manual match created successfully!',
  });
};

/*
const createSinglesManualMatch = () => {
  if (selectedPlayers.value.length !== 2) {
    notify({
      type: 'warning',
      message: 'Please select exactly 2 players',
    });
    return;
  }

  // Create the singles match (just 2 players)
const newMatch: Match = {
  id: `match-${Date.now()}`,
  players: [...selectedPlayers.value],
  status: 'waiting',
  order: matches.value.length + 1,
  createdAt: new Date(),
  court: undefined
};
  matches.value.push(newMatch);

  // Remove players from queue
const matchedPlayerNames = newMatch.players.map(p => p.username);
  queue.value = queue.value.filter(p => !matchedPlayerNames.includes(p.username));

  // Save data

  // Close dialog and reset
  showManualSelectionDialog.value = false;
  selectedPlayers.value = [];

  notify({
    type: 'positive',
    message: 'Singles match created successfully!',
  });
};
*/

// Match management functions
const cancelMatch = (filteredIndex: number) => {
  // Find the actual match in the global matches array
  const filteredMatch = filteredMatches.value[filteredIndex];
  const globalIndex = matches.value.findIndex(
    (match) => match.id === filteredMatch.id,
  );

  const match = matches.value[globalIndex];
  const actualMatch = MatchmakingApp.state.activeMatches.find(
    (am) => am.matchId === match.id,
  );

  if (!actualMatch) {
    notify({
      type: 'negative',
      message: 'Match not found',
    });
    return;
  }

  $q.dialog({
    title: 'Cancel Match',
    message:
      'Are you sure you want to cancel this match? All players will return to the queue.',
    cancel: { label: 'Keep Match', color: 'grey', flat: true },
    ok: {
      label: 'Cancel Match',
      color: 'negative',
      icon: 'cancel',
    },
    persistent: true,
  }).onOk(() => {
    const players = match.players;

    // Show dialog to choose how to return players
    $q.dialog({
      title: 'Return Players to Queue',
      message: `How should ${players.length} player(s) be returned to the queue?`,
      options: {
        type: 'radio',
        model: queueReturnMethod.value,
        items: queueReturnOptions,
      },
      cancel: { label: 'Cancel', color: 'grey', flat: true },
      ok: { label: 'Return to Queue', color: 'accent', icon: 'queue' },
    }).onOk((returnMethod) => {
      // Update the global setting if user chooses a different method
      if (returnMethod && returnMethod !== queueReturnMethod.value) {
        queueReturnMethod.value = returnMethod;
      }

      // Calculate enteredAt based on return method
      const chosenMethod = returnMethod || queueReturnMethod.value;
      let enteredAt = Date.now();
      if (chosenMethod === 'fairness_first') {
        // Jump to Front
        enteredAt = 0; // Oldest possible time
      } else if (chosenMethod === 'smart_position') {
        // Priority Position
        enteredAt = Date.now();
      }

      // Return players to queue (prevent duplicates)
      const playerUsernames = [...actualMatch.teamA, ...actualMatch.teamB];
      for (const username of playerUsernames) {
        // Check if player is already in queue
        const alreadyInQueue = MatchmakingApp.state.queues.some(
          (q) => !q.deletedAt && q.username === username,
        );
        if (!alreadyInQueue) {
          MatchmakingApp.state.queues.push({
            username,
            queueType:
              actualMatch.originalQueueTypes?.[username] ||
              (actualMatch.queueSource === 'MANUAL'
                ? 'GENERAL'
                : actualMatch.queueSource) ||
              'GENERAL',
            enteredAt: enteredAt,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            queuedAt: Date.now(),
          });
        }
      }

      // Store court number before tombstoning match
      const courtNumber = actualMatch.court;

      // Tombstone match instead of removing (for cross-admin sync)
      actualMatch.deletedAt = Date.now();
      actualMatch.updatedAt = Date.now();

      // Auto-advance next match for this specific court
      if (courtNumber) {
        autoAdvanceNextMatchForCourt(courtNumber);
      }

      MatchmakingApp.persist();

      notify({
        type: 'positive',
        message: 'Match cancelled and players returned to queue',
      });
    });
  });
};

// Check if a court is available (no in-progress match)
const isCourtAvailable = (courtNumber: number): boolean => {
  return !matches.value.some(
    (m) => m.court === courtNumber && m.status === 'in-progress',
  );
};
_isCourtAvailable = isCourtAvailable;

// Reusable helpers for match state transitions
const startMatchOnCourt = (
  match: (typeof MatchmakingApp.state.activeMatches)[0],
  court: number,
) => {
  match.status = 'in-progress';
  match.court = court;
  match.startedAt = Date.now();
  match.updatedAt = Date.now();
};

// Start a waiting match
const startMatch = (filteredIndex: number) => {
  // Find the actual match in the global matches array
  const filteredMatch = filteredMatches.value[filteredIndex];
  const globalIndex = matches.value.findIndex(
    (match) => match.id === filteredMatch.id,
  );

  const match = matches.value[globalIndex];

  if (match.status !== 'waiting') {
    notify({
      type: 'negative',
      message: 'Cannot start this match',
    });
    return;
  }

  const actualMatch = MatchmakingApp.state.activeMatches.find(
    (am) => am.matchId === match.id,
  );
  if (!actualMatch) return;

  // Assign a slot if not already assigned
  if (!actualMatch.court) {
    actualMatch.court = assignCourt();
    actualMatch.updatedAt = Date.now();
  }

  // Check if slot is available
  if (!isCourtAvailable(actualMatch.court)) {
    notify({
      type: 'negative',
      message: 'All slots are currently in use',
    });
    return;
  }

  // Start the match
  startMatchOnCourt(actualMatch, actualMatch.court);

  // Save data
  MatchmakingApp.persist();

  notify({
    type: 'positive',
    message: 'Match started',
  });
};

const editMatch = (filteredIndex: number) => {
  // Find the actual match in the global matches array
  const filteredMatch = filteredMatches.value[filteredIndex];
  const globalIndex = matches.value.findIndex(
    (match) => match.id === filteredMatch.id,
  );

  currentMatchIndexForActions.value = globalIndex;
  showMatchEditDialog.value = true;
  manualSelectionStep.value = 1;

  // Pre-populate with current players
  selectedPlayers.value = [...matches.value[globalIndex].players];

  // Determine match type based on number of players
  const currentMatch = matches.value[globalIndex];
  const isDoublesMatch = currentMatch.players.length === 4;

  // For doubles matches, initialize teams
  if (isDoublesMatch) {
    manualTeam1.value = [currentMatch.players[0], currentMatch.players[1]];
    manualTeam2.value = [currentMatch.players[2], currentMatch.players[3]];
  } else {
    // For singles or if not 4 players, clear teams
    manualTeam1.value = [];
    manualTeam2.value = [];
  }
};

const saveMatchEdit = () => {
  // Store original match before updating
  const originalMatch = matches.value[currentMatchIndexForActions.value];
  const actualMatch = MatchmakingApp.state.activeMatches.find(
    (m) => m.matchId === originalMatch.id,
  );

  if (!actualMatch) {
    notify({
      type: 'negative',
      message: 'Match not found',
    });
    return;
  }

  // Create the updated match
  let updatedPlayers: Player[];
  let newTeamA: string[] = [];
  let newTeamB: string[] = [];

  if (
    currentMatchType.value === 'doubles' &&
    selectedPlayers.value.length === 4 &&
    manualTeam1.value.length === 2 &&
    manualTeam2.value.length === 2
  ) {
    // For doubles with proper teams, use the arranged teams
    updatedPlayers = [...manualTeam1.value, ...manualTeam2.value];
    newTeamA = manualTeam1.value.map((p) => p.username);
    newTeamB = manualTeam2.value.map((p) => p.username);
  } else if (selectedPlayers.value.length === 2) {
    // For singles
    updatedPlayers = [...selectedPlayers.value];
    newTeamA = [selectedPlayers.value[0].username];
    newTeamB = [selectedPlayers.value[1].username];
  } else {
    // Fallback: If not properly configured, just use selected players
    // Split them in half
    updatedPlayers = [...selectedPlayers.value];
    const half = Math.ceil(updatedPlayers.length / 2);
    newTeamA = updatedPlayers.slice(0, half).map((p) => p.username);
    newTeamB = updatedPlayers.slice(half).map((p) => p.username);
  }

  // Find players added and removed from the match
  const originalUsernames = originalMatch.players.map((p) => p.username);

  // Check for duplicate players in the selection
  const usernames = updatedPlayers.map((p) => p.username);
  const uniqueUsernames = new Set(usernames);
  if (usernames.length !== uniqueUsernames.size) {
    notify({
      type: 'negative',
      message: 'Cannot save match with duplicate players',
    });
    return;
  }

  // Check if any added players are already in other matches (excluding current match)
  const addedPlayers = updatedPlayers.filter(
    (p) => !originalUsernames.includes(p.username),
  );
  const playersInOtherMatches = addedPlayers.filter((p) =>
    MatchmakingApp.state.activeMatches.some(
      (m) =>
        !m.deletedAt &&
        m.matchId !== actualMatch.matchId &&
        (m.teamA.includes(p.username) || m.teamB.includes(p.username)),
    ),
  );

  if (playersInOtherMatches.length > 0) {
    const names = playersInOtherMatches.map((p) => p.username).join(', ');
    notify({
      type: 'negative',
      message: `Cannot save match: ${names} already in another match`,
    });
    return;
  }
  const updatedUsernames = updatedPlayers.map((p) => p.username);

  const removedFromMatch = originalMatch.players.filter(
    (p) => !updatedUsernames.includes(p.username),
  );
  const addedToMatch = updatedPlayers.filter(
    (p) => !originalUsernames.includes(p.username),
  );

  // Remove players added to the match from the queue
  addedToMatch.forEach((p) => {
    MatchmakingApp.removeFromQueue(p.username);
  });

  // Return players removed from the match back to the queue
  removedFromMatch.forEach((p) => {
    if (
      !MatchmakingApp.state.queues.some(
        (q) => !q.deletedAt && q.username === p.username,
      )
    ) {
      MatchmakingApp.state.queues.push({
        username: p.username,
        queueType: 'GENERAL',
        enteredAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        queuedAt: Date.now(),
      });
    }
  });

  // Update the match teams in MatchmakingApp state
  actualMatch.teamA = newTeamA;
  actualMatch.teamB = newTeamB;
  actualMatch.updatedAt = Date.now();
  actualMatch.generatedBy = currentAdminName.value;
  actualMatch.isEdited = true;

  // Save data (direct state mutation requires explicit persist)
  MatchmakingApp.persist();

  // Close dialog and reset
  showMatchEditDialog.value = false;
  selectedPlayers.value = [];
  manualTeam1.value = [];
  manualTeam2.value = [];
  manualSelectionStep.value = 1;
  selectedForSwap.value = null;
  selectedForSwapTeam.value = null;

  // Show detailed notification about changes
  let message = 'Match updated successfully!';
  if (removedFromMatch.length > 0 || addedToMatch.length > 0) {
    const changes = [];
    if (removedFromMatch.length > 0) {
      changes.push(`${removedFromMatch.length} player(s) returned to queue`);
    }
    if (addedToMatch.length > 0) {
      changes.push(`${addedToMatch.length} player(s) removed from queue`);
    }
    message += ` (${changes.join(', ')})`;
  }

  notify({
    type: 'positive',
    message: message,
    timeout: 4000,
  });
};

// Match edit helper functions
const availableQueuePlayers = computed(() => {
  const matchPlayerNames = selectedPlayers.value.map((p) => p.username);
  return queue.value.filter((p) => !matchPlayerNames.includes(p.username));
});

const currentMatchType = computed(() => {
  return selectedPlayers.value.length === 4 ? 'doubles' : 'singles';
});

const removePlayerFromEdit = (player: Player) => {
  // Allow removing players freely - user can add more if needed
  const index = selectedPlayers.value.findIndex(
    (p) => p.username === player.username,
  );
  if (index >= 0) {
    selectedPlayers.value.splice(index, 1);

    notify({
      type: 'info',
      message: `Removed ${player.username} from match`,
      timeout: 2000,
    });
  }
};

const addPlayerToEdit = (player: Player) => {
  // Allow adding players up to 4 (maximum for doubles)
  const maxPlayers = 4;
  if (selectedPlayers.value.length < maxPlayers) {
    selectedPlayers.value.push(player);

    notify({
      type: 'positive',
      message: `Added ${player.username} to match`,
      timeout: 2000,
    });
  }
};

const replacePlayerInEdit = (playerToReplace: Player) => {
  if (availableQueuePlayers.value.length === 0) {
    notify({
      type: 'warning',
      message: 'No players available in queue to replace with',
    });
    return;
  }

  // Set the player to replace and show custom dialog
  playerToReplaceInEdit.value = playerToReplace;
  showReplacePlayerDialog.value = true;
};

const selectReplacementPlayer = (replacementPlayer: Player) => {
  if (!playerToReplaceInEdit.value) return;

  // Replace the player
  const index = selectedPlayers.value.findIndex(
    (p) => p.username === playerToReplaceInEdit.value!.username,
  );
  if (index >= 0) {
    selectedPlayers.value[index] = replacementPlayer;

    notify({
      type: 'positive',
      message: `Replaced ${playerToReplaceInEdit.value.username} with ${replacementPlayer.username}`,
    });
  }

  // Close dialog and reset
  showReplacePlayerDialog.value = false;
  playerToReplaceInEdit.value = null;
};

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
