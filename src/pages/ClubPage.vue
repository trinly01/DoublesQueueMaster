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
                <img
                  :src="logoUrl"
                  alt="Logo"
                  style="height: 20px; margin-right: 6px"
                />
                <span class="text-caption text-weight-medium text-white">
                  DinkMatch
                </span>
              </div>
              <h1
                :class="$q.screen.lt.md ? 'text-h6' : 'text-h5'"
                class="text-weight-bold text-white q-mt-none q-mb-none"
              >
                {{ clubName }}
              </h1>
              <p
                class="text-caption text-grey-1 q-ma-none"
                :style="{ fontSize: $q.screen.lt.md ? '10px' : '12px' }"
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
      </div>

      <q-dialog v-model="showLeaderboardDialog">
        <q-card style="min-width: 320px; max-width: 90vw">
          <q-card-section class="row items-center q-pb-none">
            <div class="text-h6">Club Leaderboard</div>
            <q-space />
            <q-btn icon="close" flat round dense v-close-popup />
          </q-card-section>
          <q-card-section
            class="q-px-md q-pt-xs q-pb-md"
            style="max-height: 78vh; overflow-y: auto"
          >
            <div v-if="clubLeaderboardLoading" class="flex flex-center q-py-md">
              <q-spinner color="accent" size="32px" />
            </div>
            <q-list separator v-else-if="clubLeaderboard.length">
              <q-item
                v-for="(player, idx) in clubLeaderboard"
                :key="player.username"
                :class="player.winRate >= 50 ? 'bg-green-1' : 'bg-red-1'"
              >
                <q-item-section avatar>
                  <div class="row items-center no-wrap" style="gap: 8px">
                    <div
                      class="text-h6 text-weight-bold text-grey-5 text-right"
                      style="min-width: 24px"
                    >
                      {{ idx + 1 }}
                    </div>
                    <PlayerAvatar
                      :name="player.firstName"
                      :username="player.username"
                      :color="getRatingColor(player.rating || 1450)"
                      :image-url="player.avatar"
                      size="32px"
                      :index="idx"
                    />
                  </div>
                </q-item-section>
                <q-item-section class="col">
                  <q-item-label class="text-weight-medium ellipsis">
                    {{ player.firstName || player.username }}
                  </q-item-label>
                  <q-item-label caption class="ellipsis"
                    >@{{ player.username }}</q-item-label
                  >
                </q-item-section>
                <q-item-section side class="text-right">
                  <q-chip
                    :color="getRatingColor(player.rating || 1450)"
                    text-color="white"
                    size="sm"
                    dense
                    class="text-weight-bold q-mb-xs"
                  >
                    {{ player.score }}
                  </q-chip>
                  <div class="text-caption">
                    <span class="text-grey-10">{{ player.games }}G</span>
                    <span class="text-green text-weight-bold q-ml-xs"
                      >{{ player.wins || 0 }}W</span
                    >
                    <span class="text-red-10 q-ml-xs"
                      >{{ player.losses || 0 }}L</span
                    >
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
            <div v-else class="text-center text-grey q-py-md">
              No completed matches yet.
            </div>
          </q-card-section>
        </q-card>
      </q-dialog>

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
                      :label="`L1: ${queueStats.level1}`"
                      color="green-6"
                      text-color="white"
                      size="sm"
                    />
                    <q-chip
                      :label="`L2: ${queueStats.level2}`"
                      color="orange-7"
                      text-color="white"
                      size="sm"
                    />
                    <q-chip
                      :label="`L3: ${queueStats.level3}`"
                      color="red-8"
                      text-color="white"
                      size="sm"
                    />
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
                      <q-item v-bind="scope.itemProps">
                        <q-item-section>
                          <q-item-label>{{ scope.opt.label }}</q-item-label>
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
                      :available-courts="getCourtCount()"
                      :show-actions="isCurrentUserAdmin"
                      @completeMatch="openMatchResultDialog(index)"
                      @editMatch="editMatch(index)"
                      @assignCourt="openCourtSelectionDialog(index)"
                      @changeCourt="openCourtSelectionDialog(index)"
                      @startMatch="startMatch(index)"
                      @cancelMatch="cancelMatch(index)"
                      @custom-announce="handleCustomAnnounce"
                      :is-court-available="
                        match.court ? isCourtAvailable(match.court) : false
                      "
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
                            :label="`L1: ${queueStats.level1}`"
                            color="green-6"
                            text-color="white"
                            size="sm"
                          />
                          <q-chip
                            :label="`L2: ${queueStats.level2}`"
                            color="orange-7"
                            text-color="white"
                            size="sm"
                          />
                          <q-chip
                            :label="`L3: ${queueStats.level3}`"
                            color="red-8"
                            text-color="white"
                            size="sm"
                          />
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
                        <q-item v-bind="scope.itemProps">
                          <q-item-section>
                            <q-item-label>{{ scope.opt.label }}</q-item-label>
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
                        :available-courts="getCourtCount()"
                        :show-actions="isCurrentUserAdmin"
                        @completeMatch="openMatchResultDialog(index)"
                        @editMatch="editMatch(index)"
                        @assignCourt="openCourtSelectionDialog(index)"
                        @changeCourt="openCourtSelectionDialog(index)"
                        @startMatch="startMatch(index)"
                        @cancelMatch="cancelMatch(index)"
                        @custom-announce="handleCustomAnnounce"
                        :is-court-available="
                          match.court ? isCourtAvailable(match.court) : false
                        "
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
      <q-dialog v-model="showAddPlayerDialog" :maximized="$q.screen.lt.md">
        <q-card
          class="bg-white"
          style="
            max-width: 800px;
            width: 95vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
          "
        >
          <!-- Header -->
          <DialogHeader title="Add New Player" icon="person_add" />

          <!-- Content -->
          <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
            <!-- Mode Toggle -->
            <div class="q-mb-sm q-pb-lg">
              <q-btn-toggle
                v-model="addPlayerMode"
                :options="addPlayerModeOptions"
                color="grey-5"
                toggle-color="accent"
                spread
                class="full-width"
              />
            </div>

            <!-- Single Player Mode -->
            <div v-if="addPlayerMode === 'single'" class="q-gutter-y-md">
              <q-input
                v-model="newPlayerName"
                label="Player Name"
                type="text"
                @keyup.enter="addNewPlayer"
                :rules="[(val) => !!val?.trim() || 'Player name is required']"
                :error="isNewPlayerNameTaken"
                error-message="Player already exists"
                outlined
                dense
                autofocus
              >
                <template v-slot:prepend>
                  <q-icon name="person" />
                </template>
              </q-input>

              <q-input
                v-model="newPlayerDuprId"
                label="DUPR ID (optional)"
                type="text"
                outlined
                dense
              >
                <template v-slot:prepend>
                  <q-icon name="badge" />
                </template>
              </q-input>

              <q-select
                v-model="newPlayerLevel"
                :options="levelOptions"
                label="Player Level"
                :rules="[(val) => val !== null || 'Player level is required']"
                outlined
                dense
                emit-value
                map-options
              >
                <template v-slot:prepend>
                  <q-icon name="star" />
                </template>
                <template v-slot:option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section avatar>
                      <q-icon
                        :name="getLevelIcon(scope.opt.value)"
                        :color="getLevelColor(scope.opt.value)"
                      />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ scope.opt.label }}</q-item-label>
                      <q-item-label caption>{{
                        scope.opt.description
                      }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>

            <!-- Bulk Import Mode -->
            <div v-else-if="addPlayerMode === 'bulk'" class="q-gutter-y-md">
              <!-- Text Input -->
              <div>
                <q-input
                  v-model="bulkPlayerText"
                  label="Player Names (one per line, or separated by commas/semicolons)"
                  type="textarea"
                  outlined
                  rows="6"
                  @update:model-value="parseBulkPlayers"
                  placeholder="Enter player names separated by newlines, commas, or semicolons&#10;&#10;Example:&#10;John Smith&#10;Jane Doe&#10;Bob Wilson&#10;&#10;Or: John Smith, Jane Doe, Bob Wilson"
                >
                  <template v-slot:prepend>
                    <q-icon name="group_add" />
                  </template>
                </q-input>
              </div>

              <!-- Default Level Selection -->
              <div v-if="bulkPlayers.length > 0">
                <q-select
                  v-model="bulkDefaultLevel"
                  :options="levelOptions"
                  label="Default Level for All Players"
                  outlined
                  dense
                  emit-value
                  map-options
                  @update:model-value="updateAllBulkLevels"
                >
                  <template v-slot:prepend>
                    <q-icon name="star" />
                  </template>
                </q-select>
              </div>

              <!-- Preview List -->
              <div v-if="bulkPlayers.length > 0">
                <div class="text-subtitle2 q-mb-sm">
                  <q-icon name="preview" class="q-mr-xs" />
                  Preview ({{ bulkPlayers.length }} players)
                </div>
                <q-list bordered separator>
                  <q-item
                    v-for="(player, index) in bulkPlayers"
                    :key="index"
                    class="q-pa-sm"
                  >
                    <q-item-section avatar>
                      <PlayerAvatar :name="player.username" size="sm" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-weight-medium">{{
                        player.username
                      }}</q-item-label>
                      <q-item-label caption
                        >Level {{ player.level }}</q-item-label
                      >
                    </q-item-section>
                    <q-item-section side>
                      <q-select
                        v-model="bulkPlayers[index].level"
                        :options="levelOptions"
                        dense
                        outlined
                        emit-value
                        map-options
                        style="min-width: 120px"
                      >
                        <template v-slot:prepend>
                          <q-icon
                            :name="getLevelIcon(player.level)"
                            :color="getLevelColor(player.level)"
                            size="xs"
                          />
                        </template>
                      </q-select>
                    </q-item-section>
                  </q-item>
                </q-list>
              </div>
            </div>

            <!-- Club Members Mode -->
            <div v-else-if="addPlayerMode === 'club'" class="q-gutter-y-md">
              <PayBanner
                v-if="isClubSubscriptionExpired"
                :loading="paymentLoading"
                @pay="callPayment({ clubId: currentClubId })"
              />
              <!-- Search & Sort -->
              <div class="row q-col-gutter-sm">
                <div class="col-12 col-sm-5">
                  <q-input
                    v-model="clubMemberSearch"
                    label="Search club members"
                    outlined
                    dense
                    clearable
                  >
                    <template v-slot:prepend>
                      <q-icon name="search" />
                    </template>
                  </q-input>
                </div>
                <div class="col-12 col-sm-4">
                  <q-select
                    v-model="clubMemberSort"
                    :options="[
                      { label: 'Name A-Z', value: 'nameAsc' },
                      { label: 'Name Z-A', value: 'nameDesc' },
                      { label: 'Rating High-Low', value: 'ratingDesc' },
                      { label: 'Rating Low-High', value: 'ratingAsc' },
                    ]"
                    label="Sort by"
                    outlined
                    dense
                    emit-value
                    map-options
                  />
                </div>
                <div class="col-12 col-sm-3">
                  <q-btn
                    color="accent"
                    icon="qr_code_scanner"
                    label="Scan QR"
                    class="full-width"
                    dense
                    unelevated
                    style="height: 40px"
                    :disable="isClubSubscriptionExpired"
                    @click="openScanDialog"
                  />
                </div>
              </div>

              <!-- Selected count -->
              <div class="text-caption text-grey-7">
                {{ selectedClubMembers.length }} member(s) selected
              </div>

              <!-- Members list -->
              <q-list separator dense class="rounded-borders">
                <q-item
                  v-for="member in availableClubMembers"
                  :key="member.id"
                  :clickable="!isClubSubscriptionExpired"
                  @click="
                    !isClubSubscriptionExpired && toggleClubMember(member.id)
                  "
                  :class="{ 'bg-purple-1': isClubMemberSelected(member.id) }"
                >
                  <q-item-section avatar>
                    <PlayerAvatar
                      :name="member.firstName"
                      :username="member.username"
                      :email="member.email"
                      :user-id="member.id"
                      :dupr-id="member.duprId"
                      :image-url="
                        !clubMemberAvatarErrors.has(member.id)
                          ? member.avatar
                          : undefined
                      "
                      size="md"
                      @image-error="clubMemberAvatarErrors.add(member.id)"
                    />
                  </q-item-section>
                  <q-item-section>
                    <div class="row items-center no-wrap">
                      <q-item-label class="text-weight-medium ellipsis">
                        {{
                          member.firstName ||
                          member.username ||
                          member.email?.split('@')[0] ||
                          'Unknown'
                        }}
                      </q-item-label>
                      <q-chip
                        :label="member.rating || 1450"
                        :color="getRatingColor(member.rating || 1450)"
                        text-color="white"
                        size="xs"
                        dense
                        class="q-ml-xs"
                      />
                    </div>
                    <q-item-label
                      caption
                      class="text-grey-6"
                      style="font-size: 10px"
                      v-if="member.username && member.firstName"
                    >
                      @{{ member.username }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <div class="row items-center q-gutter-sm">
                      <q-checkbox
                        :model-value="isClubMemberSelected(member.id)"
                        color="accent"
                        :disable="isClubSubscriptionExpired"
                        @click.stop="toggleClubMember(member.id)"
                      />
                    </div>
                  </q-item-section>
                </q-item>
                <q-item v-if="availableClubMembers.length === 0">
                  <q-item-section class="text-grey">
                    No club members available to add
                  </q-item-section>
                </q-item>
              </q-list>
            </div>
          </q-card-section>

          <!-- Footer Actions -->
          <q-separator />
          <q-card-actions align="right" class="q-pa-md">
            <q-btn
              flat
              label="Cancel"
              color="grey"
              @click="showAddPlayerDialog = false"
            >
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >Cancel</q-tooltip
              >
            </q-btn>

            <!-- Single Player Mode Button -->
            <q-btn
              v-if="addPlayerMode === 'single'"
              color="accent"
              @click="addNewPlayer"
              label="Add Player"
              :disable="
                !newPlayerName?.trim() ||
                newPlayerLevel === null ||
                isNewPlayerNameTaken
              "
              icon="add"
            >
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >Add</q-tooltip
              >
            </q-btn>

            <!-- Bulk Import Mode Button -->
            <q-btn
              v-else-if="addPlayerMode === 'bulk'"
              color="accent"
              @click="addBulkPlayers"
              label="Import All Players"
              :disable="bulkPlayers.length === 0"
              icon="group_add"
            >
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >Import all</q-tooltip
              >
            </q-btn>

            <!-- Club Members Mode Button -->
            <q-btn
              v-else-if="addPlayerMode === 'club'"
              color="accent"
              @click="addClubMembers"
              label="Add Selected Members"
              :disable="
                selectedClubMembers.length === 0 || isClubSubscriptionExpired
              "
              icon="groups"
            >
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >Add members</q-tooltip
              >
            </q-btn>
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- QR Scanner Dialog -->
      <q-dialog
        v-model="showScanDialog"
        :maximized="$q.screen.lt.md"
        @hide="stopScan"
      >
        <q-card
          class="bg-white"
          style="
            max-width: 600px;
            width: 95vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
          "
        >
          <DialogHeader title="Scan Player QR" icon="qr_code_scanner" />
          <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
            <div v-if="scanError" class="text-negative text-center q-pa-md">
              <q-icon name="error" size="48px" />
              <div class="text-h6 q-mt-sm">{{ scanError }}</div>
              <q-btn
                color="accent"
                label="Try Again"
                class="q-mt-md"
                @click="startScan"
              />
            </div>
            <div
              v-else
              id="qr-reader"
              style="width: 100%; min-height: 300px"
            ></div>
          </q-card-section>
          <q-card-actions align="right" class="q-pa-md">
            <q-btn flat label="Cancel" color="grey" v-close-popup />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Edit Player Dialog -->
      <q-dialog v-model="showEditPlayerDialog" :maximized="$q.screen.lt.md">
        <q-card
          class="bg-white"
          style="
            max-width: 800px;
            width: 95vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
          "
        >
          <!-- Header -->
          <DialogHeader title="Edit Player" icon="edit" />

          <!-- Content -->
          <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
            <div class="q-gutter-y-md">
              <div class="text-subtitle2 q-mb-sm">
                Editing: <strong>{{ editingPlayer?.username }}</strong>
                <q-badge
                  v-if="editingPlayer?.userId"
                  color="blue-6"
                  class="q-ml-sm"
                >
                  <q-icon name="verified" size="12px" />
                  <q-tooltip
                    anchor="top middle"
                    self="bottom middle"
                    :offset="[8, 8]"
                    >Read-only</q-tooltip
                  >
                </q-badge>
              </div>

              <q-input
                v-model="editPlayerName"
                label="Player Name"
                type="text"
                :readonly="!!editingPlayer?.userId"
                :hint="
                  editingPlayer?.userId
                    ? 'Name managed by linked account'
                    : undefined
                "
                outlined
                dense
                :bg-color="editingPlayer?.userId ? 'grey-2' : undefined"
              >
                <template v-slot:prepend>
                  <q-icon name="person" />
                </template>
              </q-input>

              <q-select
                v-model="editPlayerLevel"
                :options="levelOptions"
                label="Player Level"
                :rules="[(val) => val !== null || 'Player level is required']"
                :readonly="!!editingPlayer?.userId"
                :hint="
                  editingPlayer?.userId
                    ? 'Level managed by linked account'
                    : undefined
                "
                outlined
                dense
                emit-value
                map-options
                :bg-color="editingPlayer?.userId ? 'grey-2' : undefined"
              >
                <template v-slot:prepend>
                  <q-icon name="star" />
                </template>
                <template v-slot:option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section avatar>
                      <q-icon
                        :name="getLevelIcon(scope.opt.value)"
                        :color="getLevelColor(scope.opt.value)"
                      />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ scope.opt.label }}</q-item-label>
                      <q-item-label caption>{{
                        scope.opt.description
                      }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>

              <q-banner
                v-if="hasNameConflict"
                class="q-mt-md"
                color="warning"
                icon="warning"
              >
                <template v-slot:avatar>
                  <q-icon name="warning" color="warning" />
                </template>
                Another player with this name already exists. Please choose a
                different name.
              </q-banner>
            </div>
          </q-card-section>

          <!-- Footer Actions -->
          <q-separator />
          <q-card-actions align="right" class="q-pa-md">
            <q-btn
              flat
              label="Cancel"
              color="grey"
              @click="showEditPlayerDialog = false"
            />
            <q-btn
              color="accent"
              @click="savePlayerEdit"
              label="Save Changes"
              icon="save"
              :disable="
                !editPlayerName?.trim() ||
                editPlayerLevel === null ||
                hasNameConflict
              "
            />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Match Result Dialog -->
      <q-dialog v-model="showMatchResultDialog" :maximized="$q.screen.lt.md">
        <q-card
          class="bg-white"
          style="
            max-width: 800px;
            width: 95vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
          "
        >
          <!-- Header -->
          <DialogHeader title="Match Result" icon="emoji_events" />

          <!-- Content -->
          <q-card-section
            class="q-pa-md"
            style="flex: 1; overflow-y: auto"
            v-if="currentMatch"
          >
            <div class="q-gutter-y-md">
              <div class="text-subtitle1 text-center q-mb-sm">
                Enter match scores
              </div>

              <MatchResult
                v-if="currentMatch"
                :teamA="currentMatch.teamA"
                :teamB="currentMatch.teamB"
                :court="currentMatch.court"
                :winProbability="currentMatch.winProbability"
                :status="currentMatch.status"
                :startedAt="
                  currentMatch.startedAt
                    ? currentMatch.startedAt.toISOString()
                    : undefined
                "
                editable
                v-model:teamAScore="teamAScore"
                v-model:teamBScore="teamBScore"
              />
            </div>
          </q-card-section>

          <!-- Footer Actions -->
          <q-separator />
          <q-card-actions align="right" class="q-pa-md">
            <q-btn
              flat
              label="Cancel"
              color="grey"
              @click="showMatchResultDialog = false"
            />
            <q-btn
              color="accent"
              :disable="!canCompleteMatch"
              @click="completeMatch"
              label="Complete Match"
              icon="check"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Settings Dialog -->
      <q-dialog v-model="showSettingsDialog" :maximized="$q.screen.lt.md">
        <q-card
          flat
          class="bg-white"
          style="
            max-width: 800px;
            width: 95vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
          "
        >
          <!-- Header -->
          <DialogHeader title="Settings" icon="settings" />

          <div class="q-px-md q-pt-md">
            <q-btn-group spread class="full-width z-top">
              <q-btn
                flat
                color="accent"
                :class="
                  settingsTab === 'matchmaking' ? 'bg-accent text-white' : ''
                "
                label="Matchmaking"
                dense
                size="sm"
                @click="settingsTab = 'matchmaking'"
              />
              <q-btn
                flat
                color="accent"
                :class="settingsTab === 'club' ? 'bg-accent text-white' : ''"
                label="Club"
                dense
                size="sm"
                @click="settingsTab = 'club'"
              />
              <q-btn
                flat
                color="accent"
                :class="
                  settingsTab === 'feedback' ? 'bg-accent text-white' : ''
                "
                dense
                size="sm"
                @click="settingsTab = 'feedback'"
              >
                Feedback
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
              </q-btn>
            </q-btn-group>
          </div>

          <div
            v-if="settingsTab === 'matchmaking'"
            class="q-pa-md"
            style="flex: 1; overflow-y: auto"
          >
            <div class="q-gutter-y-md">
              <div>
                <div class="text-subtitle2 q-mb-sm">Queue Management</div>
                <div class="row q-col-gutter-md">
                  <div class="col-12 col-sm-6">
                    <q-select
                      v-model="queueReturnMethod"
                      :options="queueReturnOptions"
                      label="Return Players to Queue"
                      outlined
                      dense
                      emit-value
                      map-options
                    >
                      <template v-slot:option="scope">
                        <q-item v-bind="scope.itemProps">
                          <q-item-section>
                            <q-item-label>{{ scope.opt.label }}</q-item-label>
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

                  <div class="col-12 col-sm-6">
                    <q-toggle
                      v-model="autoSortQueue"
                      label="Automatically sort queue by fairness"
                      color="accent"
                    />
                  </div>

                  <div class="col-12 col-sm-6">
                    <q-select
                      v-model="queuePriorityMode"
                      :options="queuePriorityOptions"
                      label="Queue priority order"
                      outlined
                      dense
                      emit-value
                      map-options
                    >
                      <template v-slot:option="scope">
                        <q-item v-bind="scope.itemProps">
                          <q-item-section>
                            <q-item-label>{{ scope.opt.label }}</q-item-label>
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

                  <div class="col-12 col-sm-6">
                    <q-select
                      v-model="matchmakingMode"
                      :options="matchmakingModeOptions"
                      label="Matchmaking mode"
                      outlined
                      dense
                      emit-value
                      map-options
                    >
                      <template v-slot:option="scope">
                        <q-item v-bind="scope.itemProps">
                          <q-item-section>
                            <q-item-label>{{ scope.opt.label }}</q-item-label>
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
                </div>
              </div>

              <q-separator />

              <div>
                <div class="text-subtitle2 q-mb-sm">Court Management</div>
                <div class="row q-col-gutter-md">
                  <div class="col-12 col-sm-6">
                    <q-select
                      v-model="availableCourts"
                      :options="courtOptions"
                      label="Number of available courts"
                      outlined
                      dense
                    />
                  </div>
                  <div class="col-12 col-sm-6">
                    <q-toggle
                      v-model="autoAdvanceMatches"
                      label="Automatically start next match when one completes"
                      color="accent"
                    />
                  </div>
                  <div class="col-12 col-sm-6">
                    <q-toggle
                      v-model="ttsEnabled"
                      label="Enable voice announcements (TTS)"
                      color="accent"
                    />
                  </div>
                </div>
              </div>

              <q-separator />

              <div>
                <div class="text-subtitle2 q-mb-sm">DUPR Export Settings</div>
                <q-select
                  v-model="scoreType"
                  :options="scoreTypeOptions"
                  label="Score Type"
                  outlined
                  dense
                  emit-value
                  map-options
                  class="q-mb-sm"
                >
                  <template v-slot:option="scope">
                    <q-item v-bind="scope.itemProps">
                      <q-item-section>
                        <q-item-label>{{ scope.opt.label }}</q-item-label>
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

              <q-separator />

              <div v-if="isCurrentUserAdmin" class="text-subtitle2 q-mb-sm">
                Data Management
              </div>

              <div v-if="isCurrentUserAdmin" class="row q-gutter-sm">
                <div class="col">
                  <q-btn
                    color="accent"
                    @click="resetGamesPlayed"
                    icon="refresh"
                    label="Reset Stats"
                    class="full-width"
                    stack
                    style="min-height: 72px"
                  />
                </div>
                <div class="col">
                  <q-btn
                    color="warning"
                    @click="clearMatches"
                    icon="delete"
                    label="Clear Matches"
                    class="full-width"
                    stack
                    style="min-height: 72px"
                  />
                </div>
                <div class="col">
                  <q-btn
                    color="warning"
                    @click="clearQueue"
                    icon="delete_outline"
                    label="Clear Queue"
                    class="full-width"
                    stack
                    style="min-height: 72px"
                  />
                </div>
              </div>

              <div v-if="isCurrentUserAdmin" class="q-mt-sm row q-gutter-sm">
                <div class="col">
                  <q-btn
                    color="negative"
                    @click="resetSessionData"
                    icon="restart_alt"
                    label="Reset Session"
                    class="full-width"
                    stack
                    style="min-height: 72px"
                  />
                </div>
                <div class="col">
                  <q-btn
                    color="positive"
                    @click="exportDuprCsv"
                    icon="download"
                    label="Export DUPR CSV"
                    class="full-width"
                    stack
                    style="min-height: 72px"
                    :disable="duprExportableMatches.length === 0"
                  />
                </div>
                <div class="col">
                  <q-btn
                    color="negative"
                    @click="resetAllData"
                    icon="delete_forever"
                    label="Reset All"
                    class="full-width"
                    stack
                    style="min-height: 72px"
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            v-else-if="settingsTab === 'club'"
            class="q-pa-md"
            style="flex: 1; overflow-y: auto"
          >
            <div class="q-gutter-y-md">
              <div class="row q-col-gutter-sm items-center">
                <div class="col-12 col-sm-7">
                  <q-input
                    v-model="clubSettingsSearch"
                    label="Search members"
                    outlined
                    dense
                    clearable
                  >
                    <template v-slot:prepend>
                      <q-icon name="search" />
                    </template>
                  </q-input>
                </div>
                <div class="col-12 col-sm-5">
                  <q-select
                    v-model="clubSettingsSort"
                    :options="[
                      { label: 'Name A-Z', value: 'nameAsc' },
                      { label: 'Name Z-A', value: 'nameDesc' },
                      { label: 'Rating High-Low', value: 'ratingDesc' },
                      { label: 'Rating Low-High', value: 'ratingAsc' },
                    ]"
                    label="Sort by"
                    outlined
                    dense
                    emit-value
                    map-options
                  />
                </div>
              </div>

              <div>
                <div class="text-subtitle2 q-mb-sm">
                  Admins ({{ adminMembers.length }})
                </div>
                <q-list separator dense class="rounded-borders">
                  <q-item v-for="member in adminMembers" :key="member.id">
                    <q-item-section avatar>
                      <q-avatar size="32px">
                        <img v-if="member.avatar" :src="member.avatar" />
                        <q-icon v-else name="person" color="grey-5" />
                      </q-avatar>
                    </q-item-section>
                    <q-item-section style="min-width: 0">
                      <div class="row items-center no-wrap">
                        <q-item-label class="ellipsis">{{
                          member.firstName || member.username || 'Unknown'
                        }}</q-item-label>
                        <q-chip
                          :label="member.rating ?? 1450"
                          :color="getRatingColor(member.rating ?? 1450)"
                          text-color="white"
                          size="xs"
                          dense
                          class="q-ml-xs"
                        />
                      </div>
                      <q-item-label
                        caption
                        v-if="member.username"
                        class="ellipsis"
                        >@{{ member.username }}</q-item-label
                      >
                    </q-item-section>
                    <q-item-section side>
                      <q-btn
                        flat
                        dense
                        color="warning"
                        size="sm"
                        icon="arrow_downward"
                        :disable="adminMembers.length <= 1"
                        @click="
                          confirmDemoteAdmin(
                            member.id,
                            member.adminJunctionId!,
                            member.firstName ||
                              member.username ||
                              'this member',
                          )
                        "
                      >
                        <q-tooltip
                          anchor="top middle"
                          self="bottom middle"
                          :offset="[8, 8]"
                          v-if="adminMembers.length <= 1"
                        >
                          Club must have at least one admin
                        </q-tooltip>
                        <q-tooltip
                          anchor="top middle"
                          self="bottom middle"
                          :offset="[8, 8]"
                          v-else
                          >Demote to member</q-tooltip
                        >
                      </q-btn>
                    </q-item-section>
                  </q-item>
                  <q-item v-if="adminMembers.length === 0">
                    <q-item-section class="text-grey">
                      No admins found
                    </q-item-section>
                  </q-item>
                </q-list>
              </div>

              <q-separator />

              <div>
                <div class="text-subtitle2 q-mb-sm">
                  Members ({{ regularMembers.length + adminMembers.length }})
                </div>
                <q-list separator dense class="rounded-borders">
                  <q-item v-for="member in regularMembers" :key="member.id">
                    <q-item-section avatar>
                      <q-avatar size="32px">
                        <img v-if="member.avatar" :src="member.avatar" />
                        <q-icon v-else name="person" color="grey-5" />
                      </q-avatar>
                    </q-item-section>
                    <q-item-section style="min-width: 0">
                      <div class="row items-center no-wrap">
                        <q-item-label class="ellipsis">{{
                          member.firstName || member.username || 'Unknown'
                        }}</q-item-label>
                        <q-chip
                          :label="member.rating ?? 1450"
                          :color="getRatingColor(member.rating ?? 1450)"
                          text-color="white"
                          size="xs"
                          dense
                          class="q-ml-xs"
                        />
                      </div>
                      <q-item-label
                        caption
                        v-if="member.username"
                        class="ellipsis"
                        >@{{ member.username }}</q-item-label
                      >
                    </q-item-section>
                    <q-item-section side>
                      <div class="row q-gutter-xs">
                        <q-btn
                          flat
                          dense
                          color="primary"
                          size="sm"
                          icon="arrow_upward"
                          @click="
                            confirmPromoteToAdmin(
                              member.id,
                              member.firstName ||
                                member.username ||
                                'this member',
                            )
                          "
                        >
                          <q-tooltip
                            anchor="top middle"
                            self="bottom middle"
                            :offset="[8, 8]"
                            >Make admin</q-tooltip
                          >
                        </q-btn>
                        <q-btn
                          flat
                          dense
                          color="negative"
                          size="sm"
                          icon="remove_circle"
                          @click="
                            confirmRemoveMember(
                              member.id,
                              member.playerJunctionId!,
                              member.firstName ||
                                member.username ||
                                'this member',
                              member.rating,
                            )
                          "
                        >
                          <q-tooltip
                            anchor="top middle"
                            self="bottom middle"
                            :offset="[8, 8]"
                            >Remove from club</q-tooltip
                          >
                        </q-btn>
                      </div>
                    </q-item-section>
                  </q-item>
                  <q-item v-if="regularMembers.length === 0">
                    <q-item-section class="text-grey">
                      No members found
                    </q-item-section>
                  </q-item>
                </q-list>
              </div>
            </div>
          </div>

          <div
            v-else-if="settingsTab === 'feedback'"
            class="q-pa-md q-pt-lg"
            style="flex: 1; overflow-y: auto"
          >
            <div v-if="clubFeedbackLoading" class="flex flex-center q-py-lg">
              <q-spinner color="primary" size="40px" />
            </div>

            <div
              v-else-if="clubFeedback.length === 0"
              class="text-center q-py-lg text-grey-6"
            >
              <q-icon name="inbox" size="48px" />
              <div class="text-h6 q-mt-sm">No feedback yet</div>
            </div>

            <q-list separator v-else>
              <q-item
                v-for="item in clubFeedback"
                :key="item.id"
                :class="item.type === 'report' ? 'bg-red-1' : 'bg-green-1'"
              >
                <q-item-section avatar>
                  <q-icon
                    :name="
                      item.type === 'report' ? 'report_problem' : 'thumb_up'
                    "
                    :color="item.type === 'report' ? 'negative' : 'positive'"
                    size="28px"
                  />
                </q-item-section>

                <q-item-section>
                  <q-item-label class="text-weight-medium">
                    {{ item.type === 'report' ? 'Report by' : 'Kudos by' }}
                    {{ item.reporterName || 'Unknown' }}
                    <span
                      v-if="item.reporterUsername"
                      class="text-caption text-grey-6"
                    >
                      (@{{ item.reporterUsername }})
                    </span>
                  </q-item-label>
                  <q-item-label caption class="text-grey-7">
                    <span class="text-grey-7">To:</span>
                    {{ item.playerName || 'Unknown' }}
                    <span
                      v-if="item.playerUsername"
                      class="text-caption text-grey-6"
                    >
                      (@{{ item.playerUsername }})
                    </span>
                  </q-item-label>
                  <q-item-label class="q-gutter-xs q-mt-sm">
                    <q-chip
                      v-for="reason in getClubFeedbackReasons(item)"
                      :key="reason.key"
                      dense
                      size="sm"
                      :icon="reason.icon"
                      :color="item.type === 'report' ? 'negative' : 'positive'"
                      text-color="white"
                    >
                      {{ reason.label }}
                    </q-chip>
                  </q-item-label>
                  <q-item-label
                    v-if="item.comments"
                    caption
                    class="q-mt-sm text-grey-8"
                  >
                    {{ item.comments }}
                  </q-item-label>
                </q-item-section>

                <q-item-section side>
                  <span class="text-caption text-grey-6">
                    {{ formatDateOnly(item.dateUpdated || item.dateCreated) }}
                  </span>
                </q-item-section>
              </q-item>
            </q-list>
          </div>

          <!-- Footer Actions -->
          <q-separator />
          <q-card-actions align="right" class="q-pa-md">
            <q-btn
              flat
              label="Close"
              color="grey"
              @click="showSettingsDialog = false"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>

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

              <!-- Step 3: Select Court -->
              <div
                v-if="manualSelectionStep === 3"
                class="court-selection-step"
              >
                <div class="text-h6 q-mb-sm">Step 3: Select Court</div>
                <div class="text-caption text-grey-7 q-mb-sm">
                  Choose how to assign a court for this match
                </div>

                <!-- Smart Auto-Assign (Primary Option) -->
                <q-card
                  flat
                  bordered
                  class="cursor-pointer q-mb-sm primary-court-option"
                  @click="selectAutoCourt"
                  :class="{ selected: selectedCourt === null }"
                >
                  <q-card-section class="row items-center">
                    <q-icon
                      name="auto_awesome"
                      color="accent"
                      size="md"
                      class="q-mr-md"
                    />
                    <div class="col">
                      <div class="text-weight-medium">Auto-Assign Court</div>
                      <div class="text-caption text-grey-6">
                        {{ getAutoAssignDescription() }}
                      </div>
                    </div>
                    <q-icon
                      v-if="selectedCourt === null"
                      name="check_circle"
                      color="accent"
                    />
                    <q-icon
                      v-else
                      name="radio_button_unchecked"
                      color="grey-6"
                    />
                  </q-card-section>
                </q-card>

                <!-- Manual Selection Toggle -->
                <q-btn
                  flat
                  color="primary"
                  icon="sports_tennis"
                  @click="toggleManualSelection"
                  class="q-mb-sm"
                >
                  <q-icon name="sports_tennis" class="q-mr-xs" />
                  {{ showManualSelection ? 'Hide' : 'Choose' }} Specific Court
                </q-btn>

                <!-- Manual Court List (Collapsible) -->
                <q-slide-transition>
                  <div v-if="showManualSelection">
                    <q-separator class="q-mb-sm" />
                    <div class="text-subtitle2 q-mb-sm">Select Court</div>
                    <q-list separator>
                      <q-item
                        v-for="court in courtSelectionOptions"
                        :key="court.value"
                        clickable
                        @click="selectSpecificCourt(court.value)"
                        :class="{
                          'selected-court': selectedCourt === court.value,
                        }"
                      >
                        <q-item-section avatar>
                          <q-avatar
                            :color="
                              selectedCourt === court.value
                                ? 'accent'
                                : 'blue-6'
                            "
                            text-color="white"
                          >
                            {{ court.value }}
                          </q-avatar>
                        </q-item-section>
                        <q-item-section>
                          <q-item-label>Court {{ court.value }}</q-item-label>
                          <q-item-label caption>
                            {{ getCourtMatchCount(court.value) }} matches
                          </q-item-label>
                        </q-item-section>
                        <q-item-section
                          side
                          v-if="selectedCourt === court.value"
                        >
                          <q-icon name="check_circle" color="accent" />
                        </q-item-section>
                        <q-item-section side v-else>
                          <q-icon
                            name="radio_button_unchecked"
                            color="grey-6"
                          />
                        </q-item-section>
                      </q-item>
                    </q-list>
                  </div>
                </q-slide-transition>
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
                label="Next: Select Court"
                icon="sports_tennis"
                @click="proceedToCourtSelection"
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
                label="Next: Select Court"
                icon="sports_tennis"
                @click="proceedToCourtSelectionFromTeams"
                :disable="manualTeam1.length !== 2 || manualTeam2.length !== 2"
              />
            </template>

            <!-- Step 3 Actions (Court Selection) -->
            <template v-else-if="manualSelectionStep === 3">
              <q-btn
                flat
                label="Back"
                icon="arrow_back"
                color="grey"
                @click="
                  () => {
                    manualSelectionStep = matchType === 'doubles' ? 2 : 1;
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
              />
            </template>
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Match Edit Dialog -->
      <q-dialog v-model="showMatchEditDialog" :maximized="$q.screen.lt.md">
        <q-card
          class="bg-white"
          style="
            max-width: 800px;
            width: 95vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
          "
        >
          <!-- Header -->
          <DialogHeader title="Edit Match" icon="edit" />

          <!-- Content -->
          <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
            <!-- Step 1: Player Management -->
            <div v-if="manualSelectionStep === 1">
              <div class="text-h6 q-mb-sm">
                Step 1: Manage Players
                <q-chip
                  :label="
                    currentMatchType === 'singles'
                      ? 'Singles Match'
                      : 'Doubles Match'
                  "
                  :color="currentMatchType === 'singles' ? 'blue' : 'green'"
                  text-color="white"
                  size="sm"
                  class="q-ml-sm"
                />
              </div>

              <!-- Current Players -->
              <div class="q-mb-lg">
                <div class="text-subtitle2 q-mb-sm">
                  Current Players ({{ selectedPlayers.length }})
                  <q-chip
                    v-if="selectedPlayers.length < 2"
                    color="orange"
                    text-color="white"
                    size="sm"
                    class="q-ml-sm"
                  >
                    Need at least 2 players
                  </q-chip>
                </div>
                <q-list bordered separator>
                  <q-item
                    v-for="player in selectedPlayers"
                    :key="player.username"
                    class="player-edit-item"
                  >
                    <q-item-section avatar>
                      <PlayerAvatar
                        :name="player.firstName"
                        :username="player.username"
                        :color="getRatingColor(player.rating)"
                        :user-id="player.userId"
                        :dupr-id="player.duprId"
                        :image-url="player.avatar"
                        size="md"
                      />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-weight-medium">{{
                        player.firstName || player.username
                      }}</q-item-label>
                      <q-item-label
                        caption
                        class="text-grey-6"
                        v-if="player.username && player.firstName"
                      >
                        @{{ player.username }}
                      </q-item-label>
                      <q-item-label caption class="player-stats">
                        <span class="text-grey-7"
                          >G:{{ player.matchesPlayed }}</span
                        >
                        <span
                          class="q-ml-xs text-positive"
                          v-if="player.wins !== undefined"
                          >W:{{ player.wins || 0 }}</span
                        >
                        <span
                          class="q-ml-xs text-negative"
                          v-if="player.losses !== undefined"
                          >L:{{ player.losses || 0 }}</span
                        >
                        <q-chip
                          :label="player.rating"
                          :color="getRatingColor(player.rating ?? 1450)"
                          text-color="white"
                          size="xs"
                          dense
                          class="q-ml-xs"
                        />
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <div class="row items-center q-gutter-xs">
                        <q-btn
                          flat
                          round
                          color="negative"
                          icon="remove_circle"
                          size="sm"
                          @click="removePlayerFromEdit(player)"
                          :disable="selectedPlayers.length <= 1"
                        >
                          <q-tooltip
                            anchor="top middle"
                            self="bottom middle"
                            :offset="[8, 8]"
                            >Remove</q-tooltip
                          >
                        </q-btn>
                        <q-btn
                          flat
                          round
                          color="accent"
                          icon="swap_horiz"
                          size="sm"
                          @click="replacePlayerInEdit(player)"
                          :disable="availableQueuePlayers.length === 0"
                        >
                          <q-tooltip
                            anchor="top middle"
                            self="bottom middle"
                            :offset="[8, 8]"
                            >Swap</q-tooltip
                          >
                        </q-btn>
                      </div>
                    </q-item-section>
                  </q-item>
                </q-list>
              </div>

              <!-- Add Players from Queue -->
              <div v-if="availableQueuePlayers.length > 0">
                <div class="text-subtitle2 q-mb-sm">
                  Add Players from Queue
                  <q-chip
                    :label="`${availableQueuePlayers.length} available`"
                    color="grey-5"
                    text-color="white"
                    size="sm"
                    class="q-ml-sm"
                  />
                </div>
                <q-list bordered separator>
                  <q-item
                    v-for="player in availableQueuePlayers"
                    :key="player.username"
                    clickable
                    class="player-edit-item"
                    @click="addPlayerToEdit(player)"
                    :disable="selectedPlayers.length >= 4"
                  >
                    <q-item-section avatar>
                      <PlayerAvatar
                        :name="player.firstName"
                        :username="player.username"
                        :color="getRatingColor(player.rating)"
                        :user-id="player.userId"
                        :dupr-id="player.duprId"
                        :image-url="player.avatar"
                        size="md"
                      />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-weight-medium">{{
                        player.firstName || player.username
                      }}</q-item-label>
                      <q-item-label
                        caption
                        class="text-grey-6"
                        v-if="player.username && player.firstName"
                      >
                        @{{ player.username }}
                      </q-item-label>
                      <q-item-label caption class="player-stats">
                        <span class="text-grey-7"
                          >G:{{ player.matchesPlayed }}</span
                        >
                        <span
                          class="q-ml-xs text-positive"
                          v-if="player.wins !== undefined"
                          >W:{{ player.wins || 0 }}</span
                        >
                        <span
                          class="q-ml-xs text-negative"
                          v-if="player.losses !== undefined"
                          >L:{{ player.losses || 0 }}</span
                        >
                        <q-chip
                          :label="player.rating"
                          :color="getRatingColor(player.rating ?? 1450)"
                          text-color="white"
                          size="xs"
                          dense
                          class="q-ml-xs"
                        />
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <q-btn
                        flat
                        round
                        color="accent"
                        icon="add_circle"
                        size="sm"
                        :disable="selectedPlayers.length >= 4"
                      >
                        <q-tooltip
                          anchor="top middle"
                          self="bottom middle"
                          :offset="[8, 8]"
                          >Add</q-tooltip
                        >
                      </q-btn>
                    </q-item-section>
                  </q-item>
                </q-list>
              </div>

              <!-- No Available Players Message -->
              <div v-else class="text-center text-grey-6 q-pa-md">
                <q-icon name="people_outline" size="48px" color="grey-4" />
                <p class="q-mt-sm">No players available in queue</p>
                <p class="text-caption">All players are already in matches</p>
              </div>
            </div>

            <!-- Step 2: Team Arrangement (for doubles) -->
            <div
              v-if="manualSelectionStep === 2 && currentMatchType === 'doubles'"
            >
              <div class="text-h6 q-mb-sm">Step 2: Arrange Teams</div>

              <TeamArrangement
                v-model:team1="manualTeam1"
                v-model:team2="manualTeam2"
                :create-balanced-match="createBalancedMatch"
              />
            </div>
          </q-card-section>

          <!-- Footer Actions -->
          <q-separator />
          <q-card-actions align="right" class="q-pa-md">
            <!-- Step 1 Actions -->
            <template v-if="manualSelectionStep === 1">
              <!-- For doubles (4 players), show team arrangement button -->
              <q-btn
                v-if="selectedPlayers.length === 4"
                color="accent"
                label="Next: Arrange Teams"
                icon-right="arrow_forward"
                @click="proceedToTeamArrangement"
              >
                <q-tooltip
                  anchor="top middle"
                  self="bottom middle"
                  :offset="[8, 8]"
                  >Next</q-tooltip
                >
              </q-btn>

              <!-- For singles and other matches, show save button -->
              <q-btn
                v-else
                color="accent"
                label="Save Changes"
                icon="save"
                @click="saveMatchEdit"
                :disable="selectedPlayers.length < 2"
              >
                <q-tooltip
                  anchor="top middle"
                  self="bottom middle"
                  :offset="[8, 8]"
                  v-if="selectedPlayers.length < 2"
                >
                  Need 2+ players
                </q-tooltip>
                <q-tooltip
                  anchor="top middle"
                  self="bottom middle"
                  :offset="[8, 8]"
                  v-else
                  >Save</q-tooltip
                >
              </q-btn>
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
                @click="showMatchEditDialog = false"
              />
              <q-btn
                color="accent"
                label="Save Changes"
                icon="check"
                @click="saveMatchEdit"
                :disable="
                  selectedPlayers.length < 2 || selectedPlayers.length > 4
                "
              >
                <q-tooltip
                  anchor="top middle"
                  self="bottom middle"
                  :offset="[8, 8]"
                  v-if="selectedPlayers.length < 2"
                >
                  Need 2+ players
                </q-tooltip>
                <q-tooltip
                  anchor="top middle"
                  self="bottom middle"
                  :offset="[8, 8]"
                  v-else-if="selectedPlayers.length > 4"
                >
                  Max 4 players
                </q-tooltip>
                <q-tooltip
                  anchor="top middle"
                  self="bottom middle"
                  :offset="[8, 8]"
                  v-else
                  >Save</q-tooltip
                >
              </q-btn>
            </template>
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Replace Player Dialog -->
      <q-dialog v-model="showReplacePlayerDialog" :maximized="$q.screen.lt.md">
        <q-card
          class="bg-white"
          style="
            max-width: 800px;
            width: 95vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
          "
        >
          <!-- Header -->
          <DialogHeader title="Replace Player" icon="swap_horiz" />

          <!-- Content -->
          <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
            <div class="text-subtitle2 q-mb-sm">
              Choose a player to replace
              <strong>{{
                playerToReplaceInEdit?.firstName ||
                playerToReplaceInEdit?.username
              }}</strong>
              with:
            </div>

            <q-list bordered separator>
              <q-item
                v-for="player in availableQueuePlayers"
                :key="player.username"
                clickable
                class="player-edit-item"
                @click="selectReplacementPlayer(player)"
              >
                <q-item-section avatar>
                  <PlayerAvatar
                    :name="player.firstName"
                    :username="player.username"
                    :color="getRatingColor(player.rating)"
                    :user-id="player.userId"
                    :dupr-id="player.duprId"
                    :image-url="player.avatar"
                    size="md"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-medium">{{
                    player.firstName || player.username
                  }}</q-item-label>
                  <q-item-label
                    caption
                    class="text-grey-6"
                    v-if="player.username && player.firstName"
                  >
                    @{{ player.username }}
                  </q-item-label>
                  <q-item-label caption class="player-stats">
                    <span class="text-grey-7"
                      >G:{{ player.matchesPlayed }}</span
                    >
                    <span
                      class="q-ml-xs text-positive"
                      v-if="player.wins !== undefined"
                      >W:{{ player.wins || 0 }}</span
                    >
                    <span
                      class="q-ml-xs text-negative"
                      v-if="player.losses !== undefined"
                      >L:{{ player.losses || 0 }}</span
                    >
                    <q-chip
                      :label="player.rating"
                      :color="getRatingColor(player.rating ?? 1450)"
                      text-color="white"
                      size="xs"
                      dense
                      class="q-ml-xs"
                    />
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-btn flat round color="accent" icon="swap_horiz" size="sm">
                    <q-tooltip
                      anchor="top middle"
                      self="bottom middle"
                      :offset="[8, 8]"
                      >Swap</q-tooltip
                    >
                  </q-btn>
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>

          <!-- Footer Actions -->
          <q-separator />
          <q-card-actions align="right" class="q-pa-md">
            <q-btn
              flat
              label="Cancel"
              color="grey"
              @click="showReplacePlayerDialog = false"
            >
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >Cancel</q-tooltip
              >
            </q-btn>
          </q-card-actions>
        </q-card>
      </q-dialog>

      <!-- Court Selection Dialog -->
      <q-dialog v-model="showCourtSelectionDialog" :maximized="$q.screen.lt.md">
        <q-card
          class="bg-white"
          style="
            max-width: 500px;
            width: 95vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
          "
        >
          <!-- Header -->
          <DialogHeader title="Assign Court" icon="sports_tennis" />

          <!-- Content -->
          <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
            <div class="q-gutter-y-md">
              <div class="text-subtitle2 q-mb-sm">Select Court</div>

              <!-- Auto-assign option -->
              <q-card
                flat
                bordered
                class="cursor-pointer"
                @click="assignCourtAutomatically"
              >
                <q-card-section class="row items-center">
                  <q-icon
                    name="auto_awesome"
                    color="accent"
                    size="md"
                    class="q-mr-md"
                  />
                  <div class="col">
                    <div class="text-weight-medium">Auto-Assign</div>
                    <div class="text-caption text-grey-6">
                      Automatically assign next available court
                    </div>
                  </div>
                  <q-icon name="arrow_forward" color="grey-6" />
                </q-card-section>
              </q-card>

              <q-separator />

              <!-- Manual court selection -->
              <div class="text-subtitle2 q-mb-sm">Manual Selection</div>
              <q-list separator>
                <q-item
                  v-for="court in courtSelectionOptions"
                  :key="court.value"
                  clickable
                  @click="assignSpecificCourt(court.value)"
                >
                  <q-item-section avatar>
                    <q-avatar color="accent" text-color="white">
                      {{ court.value }}
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>Court {{ court.value }}</q-item-label>
                    <q-item-label caption>
                      {{ getCourtMatchCount(court.value) }} matches
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="check_circle" color="green-6" />
                  </q-item-section>
                </q-item>
              </q-list>
            </div>
          </q-card-section>

          <!-- Footer Actions -->
          <q-separator />
          <q-card-actions align="right" class="q-pa-md">
            <q-btn
              flat
              label="Cancel"
              color="grey"
              @click="showCourtSelectionDialog = false"
            >
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >Cancel</q-tooltip
              >
            </q-btn>
          </q-card-actions>
        </q-card>
      </q-dialog>
    </template>

    <q-page-sticky position="bottom-left" :offset="[18, 18]">
      <q-btn round icon="person" color="accent" @click="goHome">
        <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
          >Profile</q-tooltip
        >
      </q-btn>
    </q-page-sticky>
  </q-page>
</template>

<script setup lang="ts">
import { MatchmakingApp, mergeAppState } from '../services/matchmaking';
import type { Player, AppState } from '../services/matchmaking';
import { readItems, updateItem, readMe } from '@likha-erp/likha-sdk';
import { likhaClient } from 'src/services/likhaClient';
import { joinClub as joinClubService } from 'src/services/clubMembership';
import { useAuth } from 'src/composables/useAuth';
import { usePayment } from 'src/composables/usePayment';

import logoUrl from 'src/assets/queue master logo.png';
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar, LocalStorage, copyToClipboard } from 'quasar';
import { useNotify } from 'src/composables/useNotify';
import TeamArrangement from '../components/TeamArrangement.vue';
import PlayerList from '../components/PlayerList.vue';
import PlayerCard from '../components/PlayerCard.vue';
import PlayerAvatar from '../components/PlayerAvatar.vue';
import PlayerReportDialog from '../components/PlayerReportDialog.vue';
import PayBanner from '../components/PayBanner.vue';
import EmptyState from '../components/EmptyState.vue';
import DialogHeader from '../components/DialogHeader.vue';
import {
  getClubFeedback,
  COMMEND_ITEMS,
  REPORT_ITEMS,
  type ClubFeedbackEntry,
  type ReportItem,
} from '../services/playerReport';
import { type DirectusCompletedMatch } from '../services/playerProfile';
import MatchCard from '../components/MatchCard.vue';
import MatchResult from '../components/MatchResult.vue';
import {
  resolveAvatarUrl,
  formatDateOnly,
  getLevelColor,
  getLevelIcon,
  getRatingColor,
} from '../utils/playerHelpers';
import { replayMatches } from '../utils/ratingReplay';
import { computeWinProbability } from '../services/matchmaking';
import { buildDuprCsv, downloadDuprCsv } from '../utils/duprExport';
import { Html5Qrcode } from 'html5-qrcode';
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
      const text = buildMatchAnnounceText(na, nb, undefined, true);
      announce(notify, text, next.matchId);
    }
    return;
  }

  // For in-progress matches, announce the court match normally
  const a = match.teamA.map((p) => p.firstName || p.username);
  const b = match.teamB.map((p) => p.firstName || p.username);
  const text = buildMatchAnnounceText(a, b, match.court);
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
      };
    });
});

const duprExportableMatches = computed(() => {
  const resetAt = MatchmakingApp.state.completedMatchesResetAt ?? 0;
  return MatchmakingApp.state.completedMatches.filter(
    (m) => m.completedAt > resetAt,
  );
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

const newPlayerName = ref<string | null>(null);
const newPlayerLevel = ref<1 | 2 | 3 | null>(null);
const newPlayerDuprId = ref<string>('');
// Add player dialog mode: 'single' | 'bulk' | 'club'
const addPlayerMode = ref<'single' | 'bulk' | 'club'>('single');
const selectedClubMembers = ref<string[]>([]);
const clubMemberSearch = ref('');
const clubMemberSort = ref<'nameAsc' | 'nameDesc' | 'ratingDesc' | 'ratingAsc'>(
  'nameAsc',
);
const clubMemberAvatarErrors = ref<Set<string>>(new Set());
const showScanDialog = ref(false);
const scanError = ref('');
let html5QrCode: Html5Qrcode | null = null;
const bulkPlayerText = ref<string>('');
const bulkPlayers = ref<
  Array<{ username: string; level: 1 | 2 | 3; original: string }>
>([]);
const bulkDefaultLevel = ref<1 | 2 | 3>(2);

const parseBulkPlayers = () => {
  if (!bulkPlayerText.value?.trim()) {
    bulkPlayers.value = [];
    return;
  }

  const text = bulkPlayerText.value;
  const names = text
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter((n) => n);

  const existingLevels = new Map(
    bulkPlayers.value.map((p) => [p.username, p.level]),
  );

  bulkPlayers.value = names.map((name) => ({
    username: name,
    level: existingLevels.get(name) || bulkDefaultLevel.value,
    original: name,
  }));
};

const updateAllBulkLevels = (val: 1 | 2 | 3) => {
  bulkPlayers.value.forEach((p) => (p.level = val));
};

// Court Management Settings
interface CourtOption {
  label: string;
  value: number;
}

const availableCourts = computed<number | CourtOption>({
  get: () =>
    (MatchmakingApp.state.availableCourts ?? 1) as number | CourtOption,
  set: (val) => {
    MatchmakingApp.state.availableCourts =
      typeof val === 'object' ? (val as CourtOption).value : val;
    MatchmakingApp.state.settingsUpdatedAt = Date.now();
    MatchmakingApp.persist();
  },
});
const autoAdvanceMatches = computed<boolean>({
  get: () => MatchmakingApp.state.autoAdvanceMatches ?? true,
  set: (val) => {
    MatchmakingApp.state.autoAdvanceMatches = val;
    MatchmakingApp.state.settingsUpdatedAt = Date.now();
    MatchmakingApp.persist();
  },
});
const ttsEnabled = computed<boolean>({
  get: () => MatchmakingApp.state.ttsEnabled ?? true,
  set: (val) => {
    MatchmakingApp.state.ttsEnabled = val;
    MatchmakingApp.state.settingsUpdatedAt = Date.now();
    MatchmakingApp.persist();
  },
});
watch(ttsEnabled, (newVal, oldVal) => {
  if (oldVal === true && newVal === false) {
    clearSpeechQueue();
  }
});
const maxCourts = ref<number>(8);

// Route and Club state
const route = useRoute();
const router = useRouter();
const isOpenPlay = computed(() => route.path === '/openplay');
const currentClubId = ref<string>('');
const currentClubUUID = ref<string>('');
const clubName = ref<string>('');
const clubLoadingState = ref<
  'loading' | 'loaded' | 'not-found' | 'unpublished' | 'error'
>('loading');
const clubStatus = ref<string>('published');
const isClubSubscriptionExpired = computed(
  () => !isOpenPlay.value && clubStatus.value !== 'published',
);
const clubErrorMessage = ref<string>('');
const { paymentLoading, fetchPaymentSettings, callPayment } = usePayment();
let ratingsRefreshInterval: ReturnType<typeof setInterval> | null = null;

// Current user and club membership
const currentUserId = ref<string>('');
const isCurrentUserMember = ref(true); // default true; checked after load
const clubAdminIds = ref<Set<string>>(new Set());
const clubMembers = ref<
  Array<{
    id: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    rating?: number;
    level?: 1 | 2 | 3;
    isAdmin?: boolean;
    avatar?: string;
    duprId?: string;
    playerJunctionId?: string;
    adminJunctionId?: string;
  }>
>([]);

const availableClubMembers = computed(() => {
  const search = (clubMemberSearch.value || '').trim().toLowerCase();

  let list = clubMembers.value.filter(
    (m) =>
      m.id &&
      !Object.values(MatchmakingApp.state.players).some(
        (p) => p.userId === m.id && !p.deletedAt,
      ),
  );

  if (search) {
    list = list.filter((m) => {
      const searchString =
        `${m.firstName || ''} ${m.username || ''} ${m.email || ''}`.toLowerCase();
      return searchString.includes(search);
    });
  }

  list = [...list].sort((a, b) => {
    // Selected members always on top
    const aSelected = selectedClubMembers.value.includes(a.id) ? 1 : 0;
    const bSelected = selectedClubMembers.value.includes(b.id) ? 1 : 0;
    if (aSelected !== bSelected) return bSelected - aSelected;

    // Then apply chosen sort
    switch (clubMemberSort.value) {
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

const clubSettingsSearch = ref('');
const clubSettingsSort = ref<
  'nameAsc' | 'nameDesc' | 'ratingDesc' | 'ratingAsc'
>('nameAsc');

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

const toggleClubMember = (memberId: string) => {
  if (isClubSubscriptionExpired.value) return;
  const idx = selectedClubMembers.value.indexOf(memberId);
  if (idx >= 0) {
    selectedClubMembers.value.splice(idx, 1);
  } else {
    selectedClubMembers.value.push(memberId);
  }
};

const isClubMemberSelected = (memberId: string): boolean => {
  return selectedClubMembers.value.includes(memberId);
};

const openScanDialog = () => {
  scanError.value = '';
  showScanDialog.value = true;
  // Wait for dialog to render before starting scanner
  setTimeout(() => startScan(), 300);
};

const startScan = async () => {
  scanError.value = '';
  try {
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode('qr-reader');
    }
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      () => {
        /* ignore scan errors */
      },
    );
  } catch (err) {
    scanError.value =
      'Camera access denied or not available. Please allow camera permission.';
    console.error('[QR Scan] Start failed:', err);
  }
};

const stopScan = async () => {
  try {
    if (html5QrCode && html5QrCode.isScanning) {
      await html5QrCode.stop();
      html5QrCode.clear();
    }
  } catch {
    // ignore stop errors
  }
};

const onScanSuccess = async (decodedText: string) => {
  // Stop scanning immediately
  await stopScan();
  showScanDialog.value = false;

  const scannedUsername = decodedText.trim();
  if (!scannedUsername) {
    notify({ type: 'warning', message: 'Invalid QR code' });
    return;
  }

  // Find member by username in availableClubMembers
  const member = availableClubMembers.value.find(
    (m) => m.username?.toLowerCase() === scannedUsername.toLowerCase(),
  );

  if (!member) {
    // Not a club member — offer to switch to Single Player mode
    notify({
      type: 'warning',
      message: `"${scannedUsername}" is not a club member. Switching to manual entry.`,
    });
    addPlayerMode.value = 'single';
    newPlayerName.value = scannedUsername;
    return;
  }

  // Check if already selected
  if (isClubMemberSelected(member.id)) {
    notify({
      type: 'info',
      message: `"${member.firstName || member.username}" is already selected`,
    });
    return;
  }

  // Auto-select the member
  toggleClubMember(member.id);
  notify({
    type: 'positive',
    message: `Selected "${member.firstName || member.username}"`,
  });

  // Optional: auto-submit if user prefers one-at-a-time scanning
  // For now, keep dialog open so admin can scan multiple players
};
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

// Dynamic max-height for queue list: taller when match-type + buttons are hidden
const queueMaxHeightDesktop = computed(() =>
  isCurrentUserAdmin.value ? 'calc(100vh - 480px)' : 'calc(100vh - 340px)',
);
const queueMaxHeightMobile = computed(() =>
  isCurrentUserAdmin.value ? 'calc(100vh - 460px)' : 'calc(100vh - 300px)',
);

const addPlayerModeOptions = computed(() => {
  const opts = [
    { label: 'Single Player', value: 'single', icon: 'person' },
    { label: 'Bulk Import', value: 'bulk', icon: 'group_add' },
  ];
  if (isCurrentUserAdmin.value && clubMembers.value.length > 0) {
    opts.push({ label: 'Club Members', value: 'club', icon: 'groups' });
  }
  return opts;
});

const goHome = () => {
  router.push('/');
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

// Cloud sync state
const isOnline = ref(navigator.onLine);
const hasPendingCloudSync = ref(false);
const syncAjaxBar = ref<{ start: () => void; stop: () => void } | null>(null);
// The server's matchmaking.lastModified that our local state was last PUSHED to.
// Used as an optimistic-concurrency token: set ONLY after a successful write.
const lastSyncedServerTimestamp = ref(0);
watch(hasPendingCloudSync, (pending) => {
  if (pending) syncAjaxBar.value?.start();
  else syncAjaxBar.value?.stop();
});
const getLastSyncedKey = (clubId: string) => `last_synced_ts_${clubId}`;
const loadLastSyncedTimestamp = (clubId: string) => {
  const saved = LocalStorage.getItem(getLastSyncedKey(clubId)) as number | null;
  return saved || 0;
};
const saveLastSyncedTimestamp = (clubId: string, ts: number) => {
  LocalStorage.set(getLastSyncedKey(clubId), ts);
};
// Track when we went offline to detect sleep/long offline periods
const offlineSince = ref<number | null>(null);

// Sync mutex: prevent overlapping performCloudSync calls
let syncInProgress = false;
let syncRetryPending = false;

// Debounce timer for batching rapid local mutations into one sync
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Page visibility tracking
let isTabVisible = true;

// Initialize Likha client from environment or localStorage
const likhaUrl = ref(
  localStorage.getItem('likhaUrl') || 'https://dink-it.zyberlab.com',
);
const likhaToken = ref(localStorage.getItem('likhaToken') || '');

// Load club data from cloud
const loadClubData = async (clubId: string) => {
  if (!clubId || !likhaUrl.value) {
    clubStatus.value = 'published';
    clubLoadingState.value = 'loaded';
    return;
  }

  // If switching clubs, clear cached matchmaking state so the new club starts fresh
  if (
    (currentClubId.value && currentClubId.value !== clubId) ||
    (MatchmakingApp.state.clubId && MatchmakingApp.state.clubId !== clubId)
  ) {
    MatchmakingApp.resetState();
  }

  // Capture expected club so we can abort if the user switched clubs while the API was in-flight
  const expectedClubId = clubId;

  clubLoadingState.value = 'loading';
  try {
    const result = await likhaClient.request(
      readItems('club', {
        filter: {
          clubId: {
            _eq: clubId,
          },
        },
        fields: [
          'id',
          'clubId',
          'name',
          'status',
          'appState',
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

    // Guard: if the user switched clubs while the API was in-flight, discard this response
    if (
      MatchmakingApp.state.clubId &&
      MatchmakingApp.state.clubId !== expectedClubId
    ) {
      clubLoadingState.value = 'loaded';
      return;
    }

    if (result && result.length > 0) {
      const club = result[0] as unknown as {
        id: string;
        clubId: string;
        name?: string;
        status?: string;
        appState?: {
          matchmaking?: unknown;
          courtSettings?: {
            availableCourts: unknown;
            autoAdvanceMatches: boolean;
          };
          queueSettings?: {
            queueReturnMethod:
              | 'fairness_first'
              | 'end_of_queue'
              | 'smart_position';
            autoSortQueue: boolean;
            queuePriorityMode: 'timestamp' | 'gamesPlayed';
            matchmakingMode?:
              | 'variety_first'
              | 'balance_first'
              | 'balanced_variety'
              | 'strict_balance'
              | 'fair_balance';
          };
          uiSettings?: {
            sortBy:
              | 'matchesPlayed'
              | 'rating'
              | 'winRate'
              | 'wins'
              | 'losses'
              | 'name';
            matchType: 'singles' | 'doubles';
            matchesFilterBy: 'all' | number;
          };
        };
        players?: Array<{
          id: string;
          directus_users_id?: {
            id: string;
            username?: string;
            first_name?: string;
            last_name?: string;
            email?: string;
            rating?: number;
            rating_updated_at?: number;
            avatar?: string;
          };
        }>;
        admins?: Array<{
          id: string;
          directus_users_id?: {
            id: string;
            email?: string;
          };
        }>;
      };
      currentClubId.value = clubId;
      currentClubUUID.value = club.id;
      clubName.value = club.name || clubId;
      MatchmakingApp.state.clubId = clubId;
      MatchmakingApp.state.clubUUID = club.id;

      clubStatus.value = club.status || 'published';

      // Local client is the source of truth. Only use cloud settings as fallback
      // when local state doesn't have them yet (first visit / new device).
      const serverMatchmaking = club.appState?.matchmaking as
        | AppState
        | undefined;
      if (serverMatchmaking) {
        // Only merge settings that are missing locally — never overwrite queues/matches/players
        if (
          MatchmakingApp.state.availableCourts === undefined &&
          serverMatchmaking.availableCourts !== undefined
        ) {
          MatchmakingApp.state.availableCourts =
            serverMatchmaking.availableCourts;
        }
        if (
          MatchmakingApp.state.autoAdvanceMatches === undefined &&
          serverMatchmaking.autoAdvanceMatches !== undefined
        ) {
          MatchmakingApp.state.autoAdvanceMatches =
            serverMatchmaking.autoAdvanceMatches;
        }
        if (
          MatchmakingApp.state.queueReturnMethod === undefined &&
          serverMatchmaking.queueReturnMethod !== undefined
        ) {
          MatchmakingApp.state.queueReturnMethod =
            serverMatchmaking.queueReturnMethod;
        }
        if (
          MatchmakingApp.state.autoSortQueue === undefined &&
          serverMatchmaking.autoSortQueue !== undefined
        ) {
          MatchmakingApp.state.autoSortQueue = serverMatchmaking.autoSortQueue;
        }
        if (
          MatchmakingApp.state.queuePriorityMode === undefined &&
          serverMatchmaking.queuePriorityMode !== undefined
        ) {
          MatchmakingApp.state.queuePriorityMode =
            serverMatchmaking.queuePriorityMode;
        }
        if (
          MatchmakingApp.state.matchmakingMode === undefined &&
          serverMatchmaking.matchmakingMode !== undefined
        ) {
          MatchmakingApp.state.matchmakingMode =
            serverMatchmaking.matchmakingMode;
        }
        if (
          MatchmakingApp.state.sortBy === undefined &&
          serverMatchmaking.sortBy !== undefined
        ) {
          MatchmakingApp.state.sortBy = serverMatchmaking.sortBy;
        }
        if (
          MatchmakingApp.state.matchType === undefined &&
          serverMatchmaking.matchType !== undefined
        ) {
          MatchmakingApp.state.matchType = serverMatchmaking.matchType;
        }
        if (
          MatchmakingApp.state.matchesFilterBy === undefined &&
          serverMatchmaking.matchesFilterBy !== undefined
        ) {
          MatchmakingApp.state.matchesFilterBy =
            serverMatchmaking.matchesFilterBy;
        }
        if (
          MatchmakingApp.state.ttsEnabled === undefined &&
          serverMatchmaking.ttsEnabled !== undefined
        ) {
          MatchmakingApp.state.ttsEnabled = serverMatchmaking.ttsEnabled;
        }
      } else {
        // Cloud appState is blank/null — clear local data so UI starts fresh
        MatchmakingApp.resetState();
        MatchmakingApp.state.clubId = clubId;
      }
      // Determine admin status from raw club data
      const isAdminFromData = (club.admins || []).some(
        (a) => a.directus_users_id?.id === currentUserId.value,
      );

      // Seed / sync player roster, queue, and matches from appState
      // Admins: smart-merge so a refresh picks up other admins' newly created
      //   queues/matches (latest-writer-wins) while preserving player stats.
      // Non-admins: server is source of truth — always overwrite.
      if (serverMatchmaking) {
        // Detect remote reset: another admin cleared all data (full reset).
        // Partial checkpoint advances (session resets) are handled by mergeAppState.
        const serverHasNoPlayers =
          Object.keys(serverMatchmaking.players || {}).length === 0;
        const serverHasNoQueues = (serverMatchmaking.queues || []).length === 0;
        const serverHasNoMatches =
          (serverMatchmaking.activeMatches || []).filter((m) => !m.deletedAt)
            .length === 0;
        const serverTime = serverMatchmaking.lastModified ?? 0;
        const localTime = MatchmakingApp.state.lastModified ?? 0;
        const isRemoteReset =
          serverHasNoPlayers &&
          serverHasNoQueues &&
          serverHasNoMatches &&
          serverTime > localTime;

        if (isRemoteReset) {
          // Another admin performed a reset — adopt server state (mergeAppState will purge)
          MatchmakingApp.state.players = {};
          MatchmakingApp.state.queues = [];
          MatchmakingApp.state.activeMatches = [];
          MatchmakingApp.state.completedMatches = [];
          MatchmakingApp.state.lastModified = serverTime;
          MatchmakingApp.state.playersResetAt =
            serverMatchmaking.playersResetAt ?? 0;
          MatchmakingApp.state.queuesResetAt =
            serverMatchmaking.queuesResetAt ?? 0;
          MatchmakingApp.state.matchesResetAt =
            serverMatchmaking.matchesResetAt ?? 0;
          notify({
            type: 'info',
            message: 'Club data was reset by another admin',
            timeout: 3000,
          });
        } else {
          // Check if local state is "fresh" (no meaningful data) - e.g., incognito/private mode
          // In this case, directly adopt server state instead of merging to prevent
          // timestamp-based logic from keeping empty local data.
          const isFreshState =
            Object.keys(MatchmakingApp.state.players).length === 0 &&
            MatchmakingApp.state.queues.length === 0 &&
            MatchmakingApp.state.activeMatches.length === 0;

          if (isAdminFromData) {
            if (isFreshState) {
              // Fresh state: directly adopt server data
              if (serverMatchmaking.players) {
                MatchmakingApp.state.players = {
                  ...serverMatchmaking.players,
                };
              }
              if (serverMatchmaking.queues) {
                MatchmakingApp.state.queues = [...serverMatchmaking.queues];
              }
              if (serverMatchmaking.activeMatches) {
                MatchmakingApp.state.activeMatches = [
                  ...serverMatchmaking.activeMatches,
                ];
              }
              if (serverMatchmaking.completedMatches) {
                MatchmakingApp.state.completedMatches = [
                  ...serverMatchmaking.completedMatches,
                ];
              }
              // Carry checkpoint timestamps so resets propagate
              MatchmakingApp.state.playersResetAt =
                serverMatchmaking.playersResetAt ?? 0;
              MatchmakingApp.state.queuesResetAt =
                serverMatchmaking.queuesResetAt ?? 0;
              MatchmakingApp.state.matchesResetAt =
                serverMatchmaking.matchesResetAt ?? 0;
            } else {
              // Existing local state: smart-merge with server
              const merged = mergeAppState(
                MatchmakingApp.state,
                serverMatchmaking,
              );
              Object.assign(MatchmakingApp.state, merged);
              // Extra safety: ensure no player appears in multiple matches
              MatchmakingApp.enforceOneMatchPerPlayer();
            }
          } else {
            // Non-admins: server is source of truth — always overwrite
            if (serverMatchmaking.players) {
              MatchmakingApp.state.players = {
                ...serverMatchmaking.players,
              };
            }
            if (serverMatchmaking.queues) {
              MatchmakingApp.state.queues = [...serverMatchmaking.queues];
            }
            if (serverMatchmaking.activeMatches) {
              MatchmakingApp.state.activeMatches = [
                ...serverMatchmaking.activeMatches,
              ];
            }
            if (serverMatchmaking.completedMatches) {
              MatchmakingApp.state.completedMatches = [
                ...serverMatchmaking.completedMatches,
              ];
            }
            // Carry checkpoint timestamps so resets propagate
            MatchmakingApp.state.playersResetAt =
              serverMatchmaking.playersResetAt ?? 0;
            MatchmakingApp.state.queuesResetAt =
              serverMatchmaking.queuesResetAt ?? 0;
            MatchmakingApp.state.matchesResetAt =
              serverMatchmaking.matchesResetAt ?? 0;
          }
        }
      }
      // Backward-compat: migrate old separate settings blocks into MatchmakingApp.state
      if (club.appState?.courtSettings) {
        const ac = club.appState.courtSettings.availableCourts;
        if (MatchmakingApp.state.availableCourts === undefined) {
          MatchmakingApp.state.availableCourts =
            typeof ac === 'object' ? (ac as CourtOption).value : (ac as number);
        }
        if (MatchmakingApp.state.autoAdvanceMatches === undefined) {
          MatchmakingApp.state.autoAdvanceMatches =
            club.appState.courtSettings.autoAdvanceMatches;
        }
      }
      if (club.appState?.queueSettings) {
        if (MatchmakingApp.state.queueReturnMethod === undefined) {
          MatchmakingApp.state.queueReturnMethod =
            club.appState.queueSettings.queueReturnMethod;
        }
        if (MatchmakingApp.state.autoSortQueue === undefined) {
          MatchmakingApp.state.autoSortQueue =
            club.appState.queueSettings.autoSortQueue;
        }
        if (MatchmakingApp.state.queuePriorityMode === undefined) {
          MatchmakingApp.state.queuePriorityMode =
            club.appState.queueSettings.queuePriorityMode;
        }
        if (MatchmakingApp.state.matchmakingMode === undefined) {
          MatchmakingApp.state.matchmakingMode =
            club.appState.queueSettings.matchmakingMode;
        }
      }
      if (club.appState?.uiSettings) {
        if (MatchmakingApp.state.sortBy === undefined) {
          MatchmakingApp.state.sortBy = club.appState.uiSettings.sortBy;
        }
        if (MatchmakingApp.state.matchType === undefined) {
          MatchmakingApp.state.matchType = club.appState.uiSettings.matchType;
        }
        if (MatchmakingApp.state.matchesFilterBy === undefined) {
          MatchmakingApp.state.matchesFilterBy =
            club.appState.uiSettings.matchesFilterBy;
        }
      }
      // Ensure the club UUID is always present after any server state merge
      if (currentClubUUID.value) {
        MatchmakingApp.state.clubUUID = currentClubUUID.value;
        // Backfill club on any completed matches that were created without it
        MatchmakingApp.state.completedMatches.forEach((m) => {
          if (!m.club) m.club = currentClubUUID.value;
        });
      }

      MatchmakingApp.persist();

      // Update our concurrency token to the server's version so subsequent syncs
      // don't falsely conflict with the state we just merged.
      if (serverMatchmaking?.lastModified) {
        lastSyncedServerTimestamp.value = serverMatchmaking.lastModified;
        saveLastSyncedTimestamp(clubId, serverMatchmaking.lastModified);
      }

      // Build admin set and clubMembers list
      clubAdminIds.value = new Set(
        (club.admins || [])
          .map((a) => a.directus_users_id?.id)
          .filter((id): id is string => !!id),
      );
      // Build admin junction ID lookup for member management
      const adminJunctionMap = new Map<string, string>();
      (club.admins || []).forEach((a) => {
        const adminUserId = a.directus_users_id?.id;
        if (adminUserId && a.id) {
          adminJunctionMap.set(adminUserId, a.id);
        }
      });

      clubMembers.value =
        (club.players || [])
          .map((p) => {
            const u = p.directus_users_id as Record<string, unknown> | null;
            const userId = typeof u?.id === 'string' ? u.id : '';
            const avatarId =
              typeof u?.avatar === 'string' ? u.avatar : undefined;
            return {
              id: userId,
              username:
                typeof u?.username === 'string' ? u.username : undefined,
              firstName:
                typeof u?.first_name === 'string' ? u.first_name : undefined,
              lastName:
                typeof u?.last_name === 'string' ? u.last_name : undefined,
              email: typeof u?.email === 'string' ? u.email : undefined,
              rating: typeof u?.rating === 'number' ? u.rating : undefined,
              duprId: typeof u?.dupr_id === 'string' ? u.dupr_id : undefined,
              isAdmin: clubAdminIds.value.has(userId),
              avatar: avatarId
                ? `${likhaUrl.value}/assets/${avatarId}`
                : undefined,
              playerJunctionId: p.id || undefined,
              adminJunctionId: adminJunctionMap.get(userId) || undefined,
            };
          })
          .filter((m) => m.id) || [];

      // Check if current user is a club member (skip for open play)
      isCurrentUserMember.value =
        isOpenPlay.value ||
        clubMembers.value.some((m) => m.id === currentUserId.value);

      // Persist club metadata for offline admin detection
      LocalStorage.set(`club_meta_${clubId}`, {
        clubUUID: club.id,
        adminIds: Array.from(clubAdminIds.value),
        members: clubMembers.value,
        timestamp: Date.now(),
      });

      // Merge club players into local state
      if (club.players && Array.isArray(club.players)) {
        club.players.forEach((p) => {
          const user = p.directus_users_id as Record<string, unknown> | null;
          if (user && user.id) {
            // Check if we already have a player with this userId (they might have been renamed locally)
            const existingPlayer = Object.values(
              MatchmakingApp.state.players,
            ).find((player) => player.userId === user.id);

            if (existingPlayer) {
              // LWW: only adopt the DB rating when it's newer than our local one.
              // If we have a local ratingUpdatedAt (from the rating engine or a
              // prior manual edit) and the DB timestamp is missing/older, keep local.
              const dbTs = Number(user.rating_updated_at || 0);
              const localTs = Number(existingPlayer.ratingUpdatedAt || 0);
              const dbIsNewer = dbTs > localTs;
              const localHasTs = localTs > 0;
              const shouldAdopt = dbTs > 0 ? dbIsNewer : !localHasTs; // if DB has no timestamp, only overwrite if local also has none

              if (shouldAdopt) {
                const userRating =
                  typeof user.rating === 'number' ? user.rating : undefined;
                existingPlayer.rating =
                  userRating || existingPlayer.rating || 1450;
                if (dbTs > 0) existingPlayer.ratingUpdatedAt = dbTs;
                existingPlayer.updatedAt = Date.now();
              }

              // Update avatar if present
              const avatarId =
                typeof user.avatar === 'string' ? user.avatar : undefined;
              if (avatarId) {
                existingPlayer.avatar = `${likhaUrl.value}/assets/${avatarId}`;
                existingPlayer.updatedAt = Date.now();
              }

              // Update firstName if present
              const firstName =
                typeof user.first_name === 'string'
                  ? user.first_name
                  : undefined;
              if (firstName) {
                existingPlayer.firstName = firstName;
                existingPlayer.updatedAt = Date.now();
              }
            }
            // Note: We do NOT add new club members automatically - that should be done via the "Add Club Members" UI
          }
        });
        MatchmakingApp.persist();
      }

      clubLoadingState.value = 'loaded';
    } else {
      // Club truly not found
      clubLoadingState.value = 'not-found';
      clubErrorMessage.value = `Club "${clubId}" not found.`;
    }
  } catch (err) {
    // Handle 401 Unauthorized errors
    if (await handleAuthError(err, router)) return;

    // Check if the error is due to an unpublished club
    const error = err as { response?: { status?: number }; message?: string };
    if (
      error?.response?.status === 403 ||
      error?.message?.includes('unpublished')
    ) {
      // Try to fetch club without filter to check if it exists but is unpublished
      try {
        const clubResult = await likhaClient.request(
          readItems('club', {
            filter: {
              clubId: {
                _eq: clubId,
              },
            },
            fields: [
              'id',
              'clubId',
              'name',
              'status',
              'admins.directus_users_id.id',
            ] as unknown as string[],
            limit: 1,
            deep: {
              admins: { _limit: -1 },
            },
          }),
        );

        if (clubResult && clubResult.length > 0) {
          const unpublishedClub = clubResult[0] as unknown as {
            id: string;
            clubId: string;
            name?: string;
            status?: string;
            admins?: Array<{
              directus_users_id?: {
                id: string;
              };
            }>;
          };

          // Check if current user is an admin of this unpublished club
          const isAdmin = (unpublishedClub.admins || []).some(
            (a) => a.directus_users_id?.id === currentUserId.value,
          );

          if (isAdmin) {
            clubLoadingState.value = 'unpublished';
            clubErrorMessage.value = `Club "${unpublishedClub.name || clubId}" is not yet activated. Please click the Pay button below to activate.`;
            return;
          }
        }
      } catch {
        // Ignore secondary fetch error, fall through to generic error handling
      }
    }

    console.warn(
      'Failed to load club from server (offline?), using cache:',
      err,
    );

    // Offline fallback: use cached matchmaking state if available
    const cached = LocalStorage.getItem('matchmaking_state') as Record<
      string,
      unknown
    > | null;
    if (cached && Object.keys(cached).length > 0) {
      currentClubId.value = clubId;
      MatchmakingApp.state.clubId = clubId;

      // Restore club metadata for admin detection
      const meta = LocalStorage.getItem(`club_meta_${clubId}`) as {
        clubUUID?: string;
        adminIds?: string[];
        members?: typeof clubMembers.value;
      } | null;
      if (meta) {
        currentClubUUID.value = meta.clubUUID || '';
        MatchmakingApp.state.clubUUID = meta.clubUUID || '';
        clubAdminIds.value = new Set(meta.adminIds || []);
        clubMembers.value = meta.members || [];
        isCurrentUserMember.value =
          isOpenPlay.value ||
          clubMembers.value.some((m) => m.id === currentUserId.value);
      }

      clubStatus.value = 'published';
      clubLoadingState.value = 'loaded';
      notify({
        color: 'warning',
        message: 'Offline — showing cached club data',
      });
    } else {
      clubLoadingState.value = 'error';
      clubErrorMessage.value =
        'Failed to load club data. No cached data available.';
    }
  }
};

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

// Immediate sync to cloud (read-before-write for multi-admin conflict detection)
const performCloudSync = async (skipServerMerge = false) => {
  if (isOpenPlay.value) return;

  // Mutex: if another sync is in-flight, mark pending and bail.
  if (syncInProgress) {
    syncRetryPending = true;
    return;
  }
  syncInProgress = true;
  hasPendingCloudSync.value = true;

  if (!isOnline.value || !likhaUrl.value || !currentClubUUID.value) {
    syncInProgress = false;
    return;
  }

  try {
    // 1. Read current server state first (skip if we're coming back online with offline changes)
    let serverMatchmaking: AppState | undefined;
    let serverTimestamp = 0;
    if (!skipServerMerge) {
      const serverResult = await likhaClient.request(
        readItems('club', {
          filter: { id: { _eq: currentClubUUID.value } },
          fields: ['appState'],
        }),
      );

      const serverAppState = (
        serverResult?.[0] as unknown as {
          appState?: { matchmaking?: AppState };
        }
      )?.appState;
      serverMatchmaking = serverAppState?.matchmaking;
      serverTimestamp = serverMatchmaking?.lastModified ?? 0;
    }

    // 2. Only allow admins to write to the cloud
    if (!currentUserId.value || !clubAdminIds.value.has(currentUserId.value)) {
      // Non-admins still advance their base version so they don't false-conflict later.
      lastSyncedServerTimestamp.value = serverTimestamp;
      hasPendingCloudSync.value = false;
      syncInProgress = false;
      console.log('Skipped cloud sync: not an admin');
      return;
    }

    // 2b. Only sync if local state belongs to this club
    if (MatchmakingApp.state.clubId !== currentClubId.value) {
      hasPendingCloudSync.value = false;
      syncInProgress = false;
      console.log(
        'Skipped cloud sync: local state belongs to a different club',
      );
      return;
    }

    // 3. Optimistic concurrency: if the server moved since the version our local
    // state was based on, another admin wrote concurrently → smart-merge before pushing.
    if (
      serverMatchmaking &&
      serverTimestamp !== lastSyncedServerTimestamp.value
    ) {
      const merged = mergeAppState(MatchmakingApp.state, serverMatchmaking);
      Object.assign(MatchmakingApp.state, merged);
      // Extra safety: ensure no player appears in multiple matches
      MatchmakingApp.enforceOneMatchPerPlayer();
      notify({
        type: 'info',
        message: 'Merged concurrent changes from another admin.',
        timeout: 3000,
      });
    }

    // 5. Stamp, push to cloud, persist locally, and advance our base version.
    const stamp = Date.now();
    MatchmakingApp.state.lastModified = stamp;
    MatchmakingApp.state.clubUUID = currentClubUUID.value;
    if (currentClubUUID.value) {
      MatchmakingApp.state.completedMatches.forEach((m) => {
        if (!m.club) m.club = currentClubUUID.value;
      });
    }

    console.log(
      '[cloudSync] pushing — queues:',
      MatchmakingApp.state.queues.filter((q) => !q.deletedAt).length,
      'matches:',
      MatchmakingApp.state.activeMatches.filter((m) => !m.deletedAt).length,
      'ts:',
      stamp,
    );

    const payload = {
      matchmaking: MatchmakingApp.state,
    };

    await likhaClient.request(
      updateItem('club', currentClubUUID.value, {
        appState: payload,
      }),
    );

    MatchmakingApp.persistSilently();
    lastSyncedServerTimestamp.value = stamp;
    if (currentClubId.value) {
      saveLastSyncedTimestamp(currentClubId.value, stamp);
    }
    hasPendingCloudSync.value = false;
    syncRetryPending = false;
    console.log('Successfully synced to cloud');
  } catch (err) {
    // Handle 401 Unauthorized errors
    if (await handleAuthError(err, router)) {
      syncInProgress = false;
      return;
    }
    console.error('Failed to sync to cloud:', err);
    hasPendingCloudSync.value = true;
  } finally {
    syncInProgress = false;
    // If another sync was requested while we were busy, run one follow-up.
    if (syncRetryPending) {
      syncRetryPending = false;
      performCloudSync();
    }
  }
};

const updateOnlineStatus = () => {
  const wasOffline = !isOnline.value;
  isOnline.value = navigator.onLine;

  // Track when we went offline
  if (!isOnline.value && wasOffline) {
    offlineSince.value = Date.now();
  }

  // If we just came back online and have pending sync, sync now with retry
  if (isOnline.value && wasOffline && hasPendingCloudSync.value) {
    const attemptSync = async (retries = 3, delay = 1000) => {
      try {
        // Check if we were offline for a long time (e.g., sleep)
        const offlineDuration = offlineSince.value
          ? Date.now() - offlineSince.value
          : 0;
        const wasSleeping = offlineDuration > 5 * 60 * 1000; // 5 minutes

        // When coming back online after sleep/offline, prioritize server state
        // to avoid overwriting newer changes from other devices (e.g., phone)
        await performCloudSync(false);
        // After successful sync, refresh ratings to pull the updated values from cloud
        void refreshPlayerRatings();

        if (wasSleeping) {
          notify({
            type: 'info',
            message: 'Back online. Synced with server data.',
            timeout: 3000,
          });
        }
      } catch {
        if (retries > 0) {
          setTimeout(() => attemptSync(retries - 1, delay * 2), delay);
        } else {
          notify({
            type: 'negative',
            message: 'Cloud sync failed after reconnect. Will retry.',
            timeout: 3000,
          });
        }
      }
    };
    attemptSync();
    notify({
      type: 'positive',
      message: 'Back online. Syncing to cloud...',
      timeout: 2000,
    });
  }

  // Re-establish live updates after a reconnect if the socket dropped, and
  // refresh ratings that may have changed while we were offline.
  // Skip refreshPlayerRatings if we have pending sync (offline changes to push)
  // to avoid stale DB ratings overwriting our local offline changes before they sync.
  if (isOnline.value && wasOffline) {
    offlineSince.value = null; // Reset offline tracking
    restartRealtime(); // Force clean reconnect
    // If we have pending sync, don't refresh ratings yet - let the sync complete first
    // Otherwise, refresh to get latest data from server
    if (!hasPendingCloudSync.value) void refreshPlayerRatings();
  }
};

// ---- Real-time sync (WebSocket subscription) ----
// Pushes other admins' changes to this client instantly, then smart-merges them.
let realtimeUnsub: (() => void) | null = null;
let realtimeStarting = false;

type ClubRealtimeMessage = {
  type?: string;
  event?: 'init' | 'create' | 'update' | 'delete';
  data?: Array<{ id?: string; appState?: { matchmaking?: AppState } }>;
};

const applyServerMatchmaking = (serverMatchmaking?: AppState) => {
  if (!serverMatchmaking) return;
  const incomingTs = serverMatchmaking.lastModified ?? 0;
  // Ignore the echo of our own last write.
  if (incomingTs === lastSyncedServerTimestamp.value) {
    console.log(
      '[applyServer] ignoring echo of our own write, ts:',
      incomingTs,
    );
    return;
  }

  console.log(
    '[applyServer] incoming — queues:',
    serverMatchmaking.queues?.length,
    'matches:',
    serverMatchmaking.activeMatches?.filter((m) => !m.deletedAt).length,
    'ts:',
    incomingTs,
    'our last synced:',
    lastSyncedServerTimestamp.value,
  );

  const merged = mergeAppState(MatchmakingApp.state, serverMatchmaking);
  Object.assign(MatchmakingApp.state, merged);
  // Extra safety: ensure no player appears in multiple matches
  // and no court has multiple in-progress matches
  MatchmakingApp.enforceOneMatchPerPlayer();
  MatchmakingApp.enforceOneMatchPerCourt();
  MatchmakingApp.persistSilently();
  lastSyncedServerTimestamp.value = incomingTs;
  if (currentClubId.value) {
    saveLastSyncedTimestamp(currentClubId.value, incomingTs);
  }

  console.log(
    '[applyServer] merged — queues:',
    MatchmakingApp.state.queues.filter((q) => !q.deletedAt).length,
    'matches:',
    MatchmakingApp.state.activeMatches.filter((m) => !m.deletedAt).length,
  );
};

const startRealtime = async () => {
  if (realtimeUnsub || realtimeStarting) return;
  if (!isOnline.value || !currentClubUUID.value) return;

  realtimeStarting = true;
  try {
    await likhaClient.connect();
    const { subscription, unsubscribe } = await likhaClient.subscribe('club', {
      event: 'update',
      query: {
        filter: { id: { _eq: currentClubUUID.value } },
        fields: ['id', 'appState'],
      },
    });

    realtimeUnsub = unsubscribe;

    void (async () => {
      try {
        for await (const message of subscription) {
          const msg = message as ClubRealtimeMessage;
          console.log('[realtime] received message:', msg);
          if (msg.type && msg.type !== 'subscription') {
            console.log(
              '[realtime] skipping non-subscription message, type:',
              msg.type,
            );
            continue;
          }
          applyServerMatchmaking(msg.data?.[0]?.appState?.matchmaking);
        }
      } catch (err) {
        console.warn('Realtime stream ended:', err);
      } finally {
        // Stream closed (drop or unsubscribe) → let polling take over and
        // allow a fresh subscribe on the next reconnect.
        realtimeUnsub = null;
      }
    })();

    console.log('Realtime subscription active for club', currentClubUUID.value);
  } catch (err) {
    console.warn(
      'Realtime subscribe failed; falling back to polling/manual refresh',
      err,
    );
  } finally {
    realtimeStarting = false;
  }
};

const stopRealtime = () => {
  if (realtimeUnsub) {
    try {
      realtimeUnsub();
    } catch {
      /* noop */
    }
    realtimeUnsub = null;
  }
};

let lastResumeSyncAt = 0;

const restartRealtime = () => {
  if (!isOnline.value || !currentClubUUID.value) return;
  stopRealtime();
  void startRealtime();
};

const handleJoinClub = async () => {
  if (!currentClubId.value || !currentUserId.value) return;
  try {
    const result = await joinClubService(
      currentClubId.value,
      currentUserId.value,
    );
    if (!result.success) {
      notify({ color: 'negative', message: result.error });
      return;
    }
    if (!result.alreadyMember) {
      notify({ type: 'positive', message: 'Joined club successfully!' });
    }
    // Reload club data to reflect membership
    void loadClubData(currentClubId.value);
  } catch (err) {
    if (await handleAuthError(err, router)) return;
    notify({ color: 'negative', message: 'Failed to join club' });
  }
};

const doResumeSync = async () => {
  // Throttle: ignore if we synced < 3s ago
  if (Date.now() - lastResumeSyncAt < 3000) return;
  lastResumeSyncAt = Date.now();
  if (isOnline.value && currentClubId.value) {
    // Load server state first, then sync. This guarantees we merge the
    // latest server state before pushing any local changes.
    await loadClubData(currentClubId.value);
    void performCloudSync();
    void refreshPlayerRatings();
  }
  // Always reconnect realtime when app comes back to foreground.
  restartRealtime();
};

const handleVisibilityChange = () => {
  const wasHidden = !isTabVisible;
  isTabVisible = !document.hidden;
  if (isTabVisible && wasHidden) {
    doResumeSync();
  }
};

const handleFocus = () => {
  doResumeSync();
};

const handlePageShow = () => {
  doResumeSync();
};

onMounted(async () => {
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('pageshow', handlePageShow);
  document.addEventListener('resume', handlePageShow);

  if (!isOpenPlay.value) {
    // Fetch payment settings
    console.log('fetching settings');
    void fetchPaymentSettings();

    // Fetch current user (or restore from cache if offline)
    try {
      const me = await likhaClient.request(readMe());
      currentUserId.value =
        ((me as Record<string, unknown>).id as string) || '';
      if (currentUserId.value) {
        LocalStorage.set('current_user_id', currentUserId.value);
      }
    } catch (err) {
      // If token is fully expired (no valid refresh), force re-login
      if (await handleAuthError(err, router)) return;

      const cachedUserId = LocalStorage.getItem('current_user_id') as
        | string
        | null;
      if (cachedUserId) {
        currentUserId.value = cachedUserId;
      }
    }
  }

  // Load club from URL param
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
      void handleJoinClub();
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

  // Player ratings live in directus_users (not in club.appState), so realtime
  // can't observe them. Poll the club.players M2M periodically to keep ratings fresh.
  ratingsRefreshInterval = setInterval(() => {
    if (isOnline.value && currentClubUUID.value) {
      void refreshPlayerRatings();
    }
  }, 60000);
});

onUnmounted(() => {
  window.removeEventListener('online', updateOnlineStatus);
  window.removeEventListener('offline', updateOnlineStatus);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('focus', handleFocus);
  window.removeEventListener('pageshow', handlePageShow);
  document.removeEventListener('resume', handlePageShow);
  stopRealtime();
  if (ratingsRefreshInterval) {
    clearInterval(ratingsRefreshInterval);
    ratingsRefreshInterval = null;
  }
});

// Helper function to extract court count from q-select value
const getCourtCount = (): number => {
  if (
    typeof availableCourts.value === 'object' &&
    availableCourts.value !== null
  ) {
    return availableCourts.value.value;
  }
  return availableCourts.value || 2;
};

// Dialog states
const showAddPlayerDialog = ref(false);
watch(showAddPlayerDialog, (open) => {
  if (open) {
    addPlayerMode.value = 'single';
    selectedClubMembers.value = [];
    clubMemberSearch.value = '';
    newPlayerName.value = null;
    newPlayerLevel.value = null;
    newPlayerDuprId.value = '';
    bulkPlayerText.value = '';
    bulkPlayers.value = [];
    bulkDefaultLevel.value = 2;
  }
});
const showSettingsDialog = ref(false);
const showLeaderboardDialog = ref(false);
const settingsTab = ref<'matchmaking' | 'club' | 'feedback'>('matchmaking');

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
const showCourtSelectionDialog = ref(false);
const playerToReplaceInEdit = ref<Player | null>(null);
const currentMatchIndex = ref<number>(-1);
const currentMatchForCourtAssignment = ref<number>(-1);

// Manual selection states
const showManualSelectionDialog = ref(false);
const manualSelectionStep = ref<1 | 2 | 3>(1);
const selectedPlayers = ref<Player[]>([]);
const manualTeam1 = ref<Player[]>([]);
const manualTeam2 = ref<Player[]>([]);
const selectedCourt = ref<number | null>(null);
const showManualSelection = ref(false);

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

function getClubFeedbackReasons(item: ClubFeedbackEntry): ReportItem[] {
  const source = item.type === 'report' ? REPORT_ITEMS : COMMEND_ITEMS;
  return item.content.items
    .map((key) => source.find((i) => i.key === key))
    .filter((i): i is ReportItem => !!i);
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

// Fetch latest members when selecting Club Members mode in Add Player dialog
watch(addPlayerMode, (mode) => {
  if (mode === 'club') {
    void refreshClubMembers();
  }
});

// Sort state
const sortBy = computed<
  'matchesPlayed' | 'rating' | 'winRate' | 'wins' | 'losses' | 'name'
>({
  get: () =>
    (MatchmakingApp.state.sortBy || 'matchesPlayed') as
      | 'matchesPlayed'
      | 'rating'
      | 'winRate'
      | 'wins'
      | 'losses'
      | 'name',
  set: (val) => {
    MatchmakingApp.state.sortBy = val;
    MatchmakingApp.state.settingsUpdatedAt = Date.now();
    MatchmakingApp.persist();
  },
});

// Search state for players
const searchPlayers = ref<string>('');

// Matches filter state
const matchesFilterBy = computed<'all' | number>({
  get: () => (MatchmakingApp.state.matchesFilterBy ?? 'all') as 'all' | number,
  set: (val) => {
    MatchmakingApp.state.matchesFilterBy = val;
    MatchmakingApp.state.settingsUpdatedAt = Date.now();
    MatchmakingApp.persist();
  },
});

// Match type state
const matchType = computed<'singles' | 'doubles'>({
  get: () => MatchmakingApp.state.matchType || 'doubles',
  set: (val) => {
    MatchmakingApp.state.matchType = val;
    MatchmakingApp.state.settingsUpdatedAt = Date.now();
    MatchmakingApp.persist();
  },
});

// Queue management state
const queueReturnMethod = computed<
  'fairness_first' | 'end_of_queue' | 'smart_position'
>({
  get: () => MatchmakingApp.state.queueReturnMethod || 'fairness_first',
  set: (val) => {
    MatchmakingApp.state.queueReturnMethod = val;
    MatchmakingApp.state.settingsUpdatedAt = Date.now();
    MatchmakingApp.persist();
  },
});

// Edit player state
const showEditPlayerDialog = ref(false);
const editingPlayer = ref<Player | null>(null);
const showPlayerReportDialog = ref(false);
const reportTargetPlayer = ref<Player | null>(null);
const reportInitialType = ref<'report' | 'commend'>('commend');
const editPlayerName = ref<string | null>(null);
const editPlayerLevel = ref<1 | 2 | 3 | null>(null);
const autoSortQueue = computed<boolean>({
  get: () => MatchmakingApp.state.autoSortQueue ?? true,
  set: (val) => {
    MatchmakingApp.state.autoSortQueue = val;
    MatchmakingApp.state.settingsUpdatedAt = Date.now();
    MatchmakingApp.persist();
  },
});
const queuePriorityMode = computed<'timestamp' | 'gamesPlayed'>({
  get: () => MatchmakingApp.state.queuePriorityMode || 'timestamp',
  set: (val) => {
    MatchmakingApp.state.queuePriorityMode = val;
    MatchmakingApp.state.settingsUpdatedAt = Date.now();
    MatchmakingApp.persist();
  },
});

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
    // 1. Announce newly started matches (startedAt is new), sorted by court
    const newlyStarted = matches.value
      .filter(
        (m) =>
          m.status === 'in-progress' &&
          m.startedAt &&
          m.startedAt.getTime() > lastProcessedStartedAt.value,
      )
      .sort((a, b) => (a.court ?? 0) - (b.court ?? 0));

    for (const m of newlyStarted) {
      const a = m.teamA.map((p) => p.firstName || p.username);
      const b = m.teamB.map((p) => p.firstName || p.username);
      const text = buildMatchAnnounceText(a, b, m.court);
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
      const text = buildMatchAnnounceText(na, nb, undefined, true);
      announce(notify, text, next.matchId);
      prevNextInLineId.value = nextId;
    }
  },
);

const matchmakingMode = computed<
  | 'variety_first'
  | 'balance_first'
  | 'balanced_variety'
  | 'strict_balance'
  | 'fair_balance'
>({
  get: () => MatchmakingApp.state.matchmakingMode || 'fair_balance',
  set: (val) => {
    MatchmakingApp.state.matchmakingMode = val;
    MatchmakingApp.state.settingsUpdatedAt = Date.now();
    MatchmakingApp.persist();
  },
});

const currentMatchIndexForActions = ref<number>(-1);

// Level options for select
const levelOptions = [
  { label: 'Beginner', value: 1, description: 'New to the game' },
  { label: 'Intermediate', value: 2, description: 'Some experience' },
  { label: 'Advanced', value: 3, description: 'Experienced player' },
];

// Match type options
const matchTypeOptions = [
  { label: 'Singles (1v1)', value: 'singles' },
  { label: 'Doubles (2v2)', value: 'doubles' },
];

// Score type for DUPR CSV export
const scoreType = computed<'RALLY' | 'SIDEOUT'>({
  get: () => MatchmakingApp.state.scoreType || 'RALLY',
  set: (val) => {
    MatchmakingApp.state.scoreType = val;
    MatchmakingApp.state.settingsUpdatedAt = Date.now();
    MatchmakingApp.persist();
  },
});
const scoreTypeOptions = [
  {
    label: 'Rally',
    value: 'RALLY',
    description: 'Point on every serve (modern)',
  },
  {
    label: 'Sideout',
    value: 'SIDEOUT',
    description: 'Point only on own serve (traditional)',
  },
];

// Sort options
const sortOptions = [
  { label: 'Rating', value: 'rating' },
  { label: 'Win Rate', value: 'winRate' },
  { label: 'Wins', value: 'wins' },
  { label: 'Games Played', value: 'matchesPlayed' },
  { label: 'Losses', value: 'losses' },
  { label: 'Name (A-Z)', value: 'name' },
];

// Matches filter options
const matchesFilterOptions = computed(() => {
  const options: { label: string; value: string | number }[] = [
    { label: 'All', value: 'all' },
  ];
  const courtCount =
    typeof availableCourts.value === 'number'
      ? availableCourts.value
      : availableCourts.value.value;
  for (let i = 1; i <= courtCount; i++) {
    options.push({ label: `Court ${i}`, value: i });
  }
  return options;
});

// Queue return options
const queueReturnOptions = [
  {
    label: 'Jump to Front',
    value: 'fairness_first',
    description: 'Returning players go to the front of the queue',
  },
  {
    label: 'Go to Back',
    value: 'end_of_queue',
    description: 'Returning players go to the end of the queue',
  },
  {
    label: 'Priority Position',
    value: 'smart_position',
    description: 'Smart position based on games played',
  },
];

// Queue priority options
const queuePriorityOptions = [
  {
    label: 'First in Line',
    value: 'timestamp',
    description: 'Players are served in the order they joined',
  },
  {
    label: 'Less Played First',
    value: 'gamesPlayed',
    description: 'Players with fewer games get priority',
  },
];

// Matchmaking mode options
const matchmakingModeOptions = [
  {
    label: 'Variety first (fresh partners)',
    value: 'variety_first',
    description: 'Prioritize new partners, then opponents, then balance',
  },
  {
    label: 'Balance first (rating parity)',
    value: 'balance_first',
    description: 'Most balanced match with novelty as a penalty',
  },
  {
    label: 'Balanced variety',
    value: 'balanced_variety',
    description:
      'Equal weighting of balance and variety, always the best match',
  },
  {
    label: 'Strict balance',
    value: 'strict_balance',
    description: 'Always the most balanced match, no novelty consideration',
  },
  {
    label: 'Fair balance (next in line, even teams)',
    value: 'fair_balance',
    description:
      'Drafts the next players in queue order, then forms the most balanced teams from them',
  },
];

const courtOptions = computed(() =>
  Array.from({ length: maxCourts.value }, (_, i) => ({
    label: `${i + 1} Court${i > 0 ? 's' : ''}`,
    value: i + 1,
  })),
);

// Court options for manual selection (based on settings)
const courtSelectionOptions = computed(() => {
  const courtCount = Math.max(getCourtCount(), 2);
  return Array.from({ length: courtCount }, (_, i) => ({
    value: i + 1,
    label: `Court ${i + 1}`,
  }));
});

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
  const level1 = queue.value.filter((p) => p.level === 1).length;
  const level2 = queue.value.filter((p) => p.level === 2).length;
  const level3 = queue.value.filter((p) => p.level === 3).length;

  return { total, level1, level2, level3 };
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

const filteredMatches = computed(() => {
  let filtered =
    matchesFilterBy.value === 'all'
      ? matches.value
      : matches.value.filter((match) => match.court === matchesFilterBy.value);

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

const isNewPlayerNameTaken = computed(() => {
  if (!newPlayerName.value?.trim()) return false;
  const trimmed = newPlayerName.value.trim().toLowerCase();
  return players.value.some(
    (p) => p.username.toLowerCase() === trimmed && !p.deletedAt,
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

// Watch for matchmaking state changes and sync to cloud
// Debounced wrapper: batch rapid mutations into a single sync attempt.
const debouncedCloudSync = () => {
  hasPendingCloudSync.value = true;
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    performCloudSync();
  }, 500);
};

MatchmakingApp.onStateChange = debouncedCloudSync;

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
// Action functions
const addClubMembers = () => {
  if (isClubSubscriptionExpired.value) return;
  if (selectedClubMembers.value.length === 0) return;

  const added: string[] = [];
  const alreadyInQueue: string[] = [];
  const alreadyInMatch: string[] = [];

  selectedClubMembers.value.forEach((memberId) => {
    const member = clubMembers.value.find((m) => m.id === memberId);
    if (!member) return;

    const username =
      member.username || member.email?.split('@')[0] || 'Unknown';

    // Pass profile extras so firstName, avatar, userId, and real rating are preserved
    const memberLevel = member.level ?? 2;
    const memberRating =
      member.rating ??
      (memberLevel === 1 ? 1450 : memberLevel === 2 ? 1500 : 1550);
    const result = MatchmakingApp.checkInPlayer(username, memberLevel, {
      firstName: member.firstName,
      avatar: member.avatar,
      userId: member.id,
      duprId: member.duprId,
      rating: memberRating,
    });

    if (result === 'added') {
      added.push(username);
    } else if (result === 'already_in_queue') {
      alreadyInQueue.push(username);
    } else if (result === 'already_in_match') {
      alreadyInMatch.push(username);
    }
  });

  if (added.length > 0) {
    notify({
      type: 'positive',
      message: `Added ${added.length} member(s) to queue: ${added.join(', ')}`,
      timeout: 3000,
    });
  }
  if (alreadyInQueue.length > 0) {
    notify({
      type: 'warning',
      message: `Skipped ${alreadyInQueue.length} already in queue: ${alreadyInQueue.join(', ')}`,
      timeout: 3000,
    });
  }
  if (alreadyInMatch.length > 0) {
    notify({
      type: 'warning',
      message: `Skipped ${alreadyInMatch.length} already in match: ${alreadyInMatch.join(', ')}`,
      timeout: 3000,
    });
  }

  addPlayerMode.value = 'single';
  selectedClubMembers.value = [];
  clubMemberSearch.value = '';
  showAddPlayerDialog.value = false;
};

const addNewPlayer = () => {
  if (!newPlayerName.value?.trim() || newPlayerLevel.value === null) return;
  const trimmedName = newPlayerName.value.trim();
  const initialRating =
    newPlayerLevel.value === 1
      ? 1450
      : newPlayerLevel.value === 2
        ? 1500
        : 1550;
  const result = MatchmakingApp.checkInPlayer(
    trimmedName,
    newPlayerLevel.value,
    { rating: initialRating, duprId: newPlayerDuprId.value || undefined },
  );

  if (result === 'already_in_match') {
    notify({
      type: 'warning',
      message: `Player "${trimmedName}" is already in a match`,
    });
    return;
  }

  if (result === 'already_in_queue') {
    notify({
      type: 'warning',
      message: `Player "${trimmedName}" is already in the queue`,
    });
    return;
  }

  newPlayerName.value = null;
  newPlayerLevel.value = null;
  newPlayerDuprId.value = '';
  showAddPlayerDialog.value = false;
  notify({
    type: 'positive',
    message: `Player "${trimmedName}" added successfully`,
  });
};
const addBulkPlayers = () => {
  const newPlayers: Player[] = [];
  const duplicateNames: string[] = [];
  const invalidNames: string[] = [];
  const alreadyInQueue: string[] = [];
  const alreadyInMatch: string[] = [];

  // Validate each player
  for (const bulkPlayer of bulkPlayers.value) {
    const trimmedName = bulkPlayer.username.trim();

    if (!trimmedName) {
      invalidNames.push(bulkPlayer.original);
      continue;
    }

    if (
      players.value.some(
        (player) => player.username.toLowerCase() === trimmedName.toLowerCase(),
      )
    ) {
      duplicateNames.push(trimmedName);
      continue;
    }

    const initialRating =
      bulkPlayer.level === 1 ? 1450 : bulkPlayer.level === 2 ? 1500 : 1550;

    const result = MatchmakingApp.checkInPlayer(
      trimmedName,
      bulkPlayer.level as 1 | 2 | 3,
      { rating: initialRating },
    );
    if (result === 'already_in_queue') {
      alreadyInQueue.push(trimmedName);
    } else if (result === 'already_in_match') {
      alreadyInMatch.push(trimmedName);
    }
  }

  // Add valid players
  if (bulkPlayers.value.length > 0) {
    notify({
      type: 'positive',
      message: `Successfully imported ${newPlayers.length} player${newPlayers.length > 1 ? 's' : ''}`,
    });
  }

  // Show warnings for duplicates, invalid names, and players already in queue/match
  if (duplicateNames.length > 0) {
    notify({
      type: 'warning',
      message: `Skipped ${duplicateNames.length} duplicate player${duplicateNames.length > 1 ? 's' : ''}: ${duplicateNames.join(', ')}`,
      timeout: 5000,
    });
  }

  if (invalidNames.length > 0) {
    notify({
      type: 'warning',
      message: `Skipped ${invalidNames.length} invalid name${invalidNames.length > 1 ? 's' : ''}: ${invalidNames.join(', ')}`,
      timeout: 5000,
    });
  }

  if (alreadyInQueue.length > 0) {
    notify({
      type: 'warning',
      message: `Skipped ${alreadyInQueue.length} player${alreadyInQueue.length > 1 ? 's' : ''} already in queue: ${alreadyInQueue.join(', ')}`,
      timeout: 5000,
    });
  }

  if (alreadyInMatch.length > 0) {
    notify({
      type: 'warning',
      message: `Skipped ${alreadyInMatch.length} player${alreadyInMatch.length > 1 ? 's' : ''} already in match: ${alreadyInMatch.join(', ')}`,
      timeout: 5000,
    });
  }

  // Reset form and close dialog
  addPlayerMode.value = 'single';
  selectedClubMembers.value = [];
  bulkPlayerText.value = '';
  bulkPlayers.value = [];
  bulkDefaultLevel.value = 2;
  showAddPlayerDialog.value = false;
};

const generateNewMatches = () => {
  MatchmakingApp.state.teamSize = matchType.value === 'singles' ? 1 : 2;
  MatchmakingApp.state.settingsUpdatedAt = Date.now();
  MatchmakingApp.persist();
  MatchmakingApp.draftNextMatches(queuePriorityMode.value);

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
        message: `Match started on Court ${courtNumber}`,
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
  selectedCourt.value = null;
  showManualSelection.value = false;
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

const proceedToCourtSelection = () => {
  if (selectedPlayers.value.length !== 2) {
    notify({
      type: 'warning',
      message: 'Please select exactly 2 players',
    });
    return;
  }
  manualSelectionStep.value = 3;
};

const proceedToCourtSelectionFromTeams = () => {
  if (manualTeam1.value.length !== 2 || manualTeam2.value.length !== 2) {
    notify({
      type: 'warning',
      message: 'Please arrange both teams properly',
    });
    return;
  }
  manualSelectionStep.value = 3;
};

const selectAutoCourt = () => {
  selectedCourt.value = null; // null means auto-assign
};

const toggleManualSelection = () => {
  showManualSelection.value = !showManualSelection.value;
};

const getCourtMatchCount = (courtNumber: number): number => {
  return matches.value.filter((match) => match.court === courtNumber).length;
};

const getAutoAssignDescription = (): string => {
  // Calculate court load balancing
  const courtMatchCounts = new Map<number, number>();

  // Extract the actual number from the q-select value
  const courtCount = getCourtCount();

  // Initialize all courts with 0 matches
  for (let court = 1; court <= courtCount; court++) {
    courtMatchCounts.set(court, 0);
  }

  // Count matches per court (both in-progress and waiting)
  matches.value.forEach((match) => {
    if (match.court) {
      const currentCount = courtMatchCounts.get(match.court) || 0;
      courtMatchCounts.set(match.court, currentCount + 1);
    }
  });

  // Find the least busy court
  let leastBusyCourt = 1;
  let minMatches = courtMatchCounts.get(1) || 0;

  for (let court = 1; court <= courtCount; court++) {
    const matchCount = courtMatchCounts.get(court) || 0;
    if (matchCount < minMatches) {
      minMatches = matchCount;
      leastBusyCourt = court;
    }
  }

  const leastBusyMatches = courtMatchCounts.get(leastBusyCourt) || 0;
  return `Will assign Court ${leastBusyCourt} (least busy court, ${leastBusyMatches} matches)`;
};

const selectSpecificCourt = (courtNumber: number) => {
  selectedCourt.value = courtNumber;
};

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

  let assignedCourt = selectedCourt.value || undefined;

  // Auto-assign court if none selected
  if (!assignedCourt) {
    assignedCourt = assignCourt();
  }

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
  });

  matchPlayers.forEach((p) => MatchmakingApp.removeFromQueue(p.username));
  MatchmakingApp.persist();

  showManualSelectionDialog.value = false;
  selectedPlayers.value = [];
  manualTeam1.value = [];
  manualTeam2.value = [];
  selectedCourt.value = null;
  manualSelectionStep.value = 1;

  notify({
    type: 'positive',
    message: `Manual match created successfully${isCourtEmpty && assignedCourt ? ` on Court ${assignedCourt}` : ''}!`,
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

const openCourtSelectionDialog = (filteredIndex: number) => {
  // Find the actual match in the global matches array
  const filteredMatch = filteredMatches.value[filteredIndex];
  const globalIndex = matches.value.findIndex(
    (match) => match.id === filteredMatch.id,
  );

  currentMatchForCourtAssignment.value = globalIndex;
  showCourtSelectionDialog.value = true;
};

const assignCourtAutomatically = () => {
  const matchIndex = currentMatchForCourtAssignment.value;
  const match = matches.value[matchIndex];
  const court = assignCourt();

  if (court > 0 && isCourtAvailable(court)) {
    const actualMatch = MatchmakingApp.state.activeMatches.find(
      (am) => am.matchId === match.id,
    );
    if (actualMatch) {
      startMatchOnCourt(actualMatch, court);
    }

    MatchmakingApp.persist();

    notify({
      type: 'positive',
      message: `Match started on Court ${court}`,
    });
  } else {
    notify({
      type: 'negative',
      message: 'No available courts',
    });
  }

  showCourtSelectionDialog.value = false;
};

// Check if a court is available (no in-progress match)
const isCourtAvailable = (courtNumber: number): boolean => {
  return !matches.value.some(
    (m) => m.court === courtNumber && m.status === 'in-progress',
  );
};

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

  // Assign a court if not already assigned
  const actualMatch = MatchmakingApp.state.activeMatches.find(
    (am) => am.matchId === match.id,
  );
  if (!actualMatch) return;

  if (!actualMatch.court) {
    const assignedCourt = assignCourt();
    actualMatch.court = assignedCourt;
    actualMatch.updatedAt = Date.now();
  }

  // Check if court is available
  if (!isCourtAvailable(actualMatch.court)) {
    notify({
      type: 'negative',
      message: `Court ${actualMatch.court} is currently in use`,
    });
    return;
  }

  // Start the match
  startMatchOnCourt(actualMatch, actualMatch.court);

  // Save data
  MatchmakingApp.persist();

  notify({
    type: 'positive',
    message: `Match started on Court ${match.court}`,
  });
};

const assignSpecificCourt = (courtNumber: number) => {
  const matchIndex = currentMatchForCourtAssignment.value;
  const match = matches.value[matchIndex];
  const originalCourt = match.court;

  // Check if the target court has an in-progress match
  const existingInProgressMatch = matches.value.find(
    (m) => m.court === courtNumber && m.status === 'in-progress',
  );

  if (existingInProgressMatch) {
    // Court has an in-progress match - implement swap
    $q.dialog({
      title: 'Court Swap Required',
      message: `Court ${courtNumber} already has a match in progress. Do you want to swap the matches?`,
      cancel: { label: 'Cancel', color: 'grey', flat: true },
      ok: {
        label: 'Swap Matches',
        color: 'accent',
        icon: 'swap_horiz',
      },
      persistent: true,
    }).onOk(() => {
      // Perform the swap
      const actualExisting = MatchmakingApp.state.activeMatches.find(
        (am) => am.matchId === existingInProgressMatch.id,
      );
      if (actualExisting) {
        actualExisting.court = originalCourt;
        actualExisting.status = 'waiting';
        delete (actualExisting as { startedAt?: number }).startedAt;
        actualExisting.updatedAt = Date.now();
      }

      const actualMatch = MatchmakingApp.state.activeMatches.find(
        (am) => am.matchId === match.id,
      );
      if (actualMatch) {
        actualMatch.court = courtNumber;
        // Only start if it was already in-progress (shouldn't happen for waiting matches)
        if (actualMatch.status !== 'in-progress') {
          startMatchOnCourt(actualMatch, courtNumber);
        }
      }

      notify({
        type: 'positive',
        message: `Matches swapped! Match moved to Court ${courtNumber}`,
      });

      MatchmakingApp.persist();

      showCourtSelectionDialog.value = false;
    });
  } else {
    // Court is available - assign and auto-start
    const actualMatch = MatchmakingApp.state.activeMatches.find(
      (am) => am.matchId === match.id,
    );
    if (actualMatch) {
      startMatchOnCourt(actualMatch, courtNumber);
    }

    MatchmakingApp.persist();

    notify({
      type: 'positive',
      message: `Match started on Court ${courtNumber}`,
    });

    showCourtSelectionDialog.value = false;
  }
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

// Court Selection Styling
.selected-court {
  background-color: rgba(25, 118, 210, 0.1) !important;
  border-left: 4px solid #1976d2;
}

.court-selection-step {
  .q-item {
    transition: background-color 0.2s ease;

    &:hover:not(.bg-grey-1) {
      background-color: rgba(25, 118, 210, 0.05);
    }
  }
}

// Enhanced Court Selection UX
.primary-court-option {
  transition: all 0.2s ease;
  border: 2px solid transparent;

  &.selected {
    border-color: #1976d2;
    background-color: rgba(25, 118, 210, 0.05);
    box-shadow: 0 2px 8px rgba(25, 118, 210, 0.15);
  }

  &:hover {
    background-color: rgba(25, 118, 210, 0.02);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
}

// Manual selection toggle button
.court-selection-step .q-btn {
  transition: all 0.2s ease;

  &:hover {
    background-color: rgba(25, 118, 210, 0.05);
  }
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
