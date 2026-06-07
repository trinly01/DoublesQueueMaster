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
          @click="callForActivation"
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
                class="text-h5 text-weight-bold text-white q-mt-none q-mb-none"
              >
                {{ clubName }}
              </h1>
              <p class="text-caption text-grey-1 q-ma-none">
                Smart matchmaking for singles & doubles
              </p>
            </div>
            <div
              v-if="isCurrentUserAdmin"
              class="col-auto row items-center q-gutter-sm"
            >
              <q-spinner v-if="hasPendingCloudSync" color="white" size="20px" />
              <q-btn
                color="white"
                icon="settings"
                @click="showSettingsDialog = true"
                flat
                round
                dense
              >
                <q-tooltip>Settings</q-tooltip>
              </q-btn>
            </div>
          </div>
        </div>
      </div>

      <div class="container q-pa-md">
        <q-banner
          v-if="!isOnline"
          :class="
            $q.dark.isActive ? 'bg-grey-8 text-white' : 'bg-grey-2 text-grey-9'
          "
          class="q-mb-md rounded-borders"
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
          class="bg-red-1 text-red-9 q-mb-md rounded-borders"
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
          class="q-mb-md rounded-borders"
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
                    <q-tooltip>Add player</q-tooltip>
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
                    <q-tooltip>Add all</q-tooltip>
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
                    :sort-by="sortBy"
                    :show-actions="isCurrentUserAdmin"
                    :show-requeue-button="isCurrentUserAdmin"
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
                    :show-position="true"
                    :show-queue-time="true"
                    :is-in-queue="true"
                    :show-actions="isCurrentUserAdmin"
                    :show-requeue-button="false"
                    :empty-icon="'queue'"
                    :empty-title="'Queue is empty'"
                    :empty-subtitle="'Add players to start generating matches'"
                    @player-remove="removeFromQueue"
                  />
                </div>
              </q-card-section>
              <q-card-section v-if="isCurrentUserAdmin">
                <!-- Match Type Selector -->
                <div class="q-mb-md">
                  <div class="text-caption text-grey-7 q-mb-xs">Match Type</div>
                  <q-select
                    v-model="matchType"
                    :options="matchTypeOptions"
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
                    <q-tooltip v-if="!canGenerateMatches()">
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
                    <div class="q-pa-md q-pb-sm">
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
                          <q-tooltip>Add player</q-tooltip>
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
                          <q-tooltip>Add all</q-tooltip>
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
                      :sort-by="sortBy"
                      :show-actions="isCurrentUserAdmin"
                      :show-requeue-button="isCurrentUserAdmin"
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
                      :show-position="true"
                      :show-queue-time="true"
                      :is-in-queue="true"
                      :show-actions="isCurrentUserAdmin"
                      :show-requeue-button="false"
                      :empty-icon="'queue'"
                      :empty-title="'Queue is empty'"
                      :empty-subtitle="'Add players to start generating matches'"
                      @player-remove="removeFromQueue"
                    />
                  </div>
                </q-card-section>
                <q-card-section v-if="isCurrentUserAdmin">
                  <!-- Match Type Selector -->
                  <div class="q-mb-md">
                    <div class="text-caption text-grey-7 q-mb-xs">
                      Match Type
                    </div>
                    <q-select
                      v-model="matchType"
                      :options="matchTypeOptions"
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
                      <q-tooltip v-if="!canGenerateMatches()">
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
            <div class="q-mb-md q-pb-lg">
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
                      <q-avatar
                        :color="getLevelColor(player.level)"
                        text-color="white"
                        size="sm"
                      >
                        {{ player.username.charAt(0).toUpperCase() }}
                      </q-avatar>
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
              <!-- Search -->
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

              <!-- Selected count -->
              <div class="text-caption text-grey-7">
                {{ selectedClubMembers.length }} member(s) selected
              </div>

              <!-- Members list -->
              <q-list separator dense class="rounded-borders">
                <q-item
                  v-for="member in availableClubMembers"
                  :key="member.id"
                  clickable
                  @click="toggleClubMember(member.id)"
                  :class="{ 'bg-purple-1': isClubMemberSelected(member.id) }"
                >
                  <q-item-section avatar>
                    <q-avatar
                      v-if="!member.avatar"
                      color="orange-7"
                      text-color="white"
                      size="md"
                    >
                      {{
                        (
                          member.firstName ||
                          member.username ||
                          member.email?.split('@')[0] ||
                          'U'
                        )
                          .charAt(0)
                          .toUpperCase()
                      }}
                      <q-badge
                        floating
                        rounded
                        color="accent"
                        style="padding: 2px; min-height: 14px; min-width: 14px"
                      >
                        <q-icon name="verified" size="12px" />
                      </q-badge>
                    </q-avatar>
                    <q-avatar v-else size="md">
                      <img
                        :src="member.avatar"
                        :alt="member.username || 'Unknown'"
                        @error="
                          (e: Event) =>
                            ((e.target as HTMLImageElement).style.display =
                              'none')
                        "
                      />
                      <q-badge
                        floating
                        rounded
                        color="accent"
                        style="padding: 2px; min-height: 14px; min-width: 14px"
                      >
                        <q-icon name="verified" size="12px" />
                      </q-badge>
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-weight-medium">
                      {{
                        member.firstName ||
                        member.username ||
                        member.email?.split('@')[0] ||
                        'Unknown'
                      }}
                    </q-item-label>
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
                      <q-chip
                        :label="`R: ${member.rating || 1500}`"
                        color="accent"
                        text-color="white"
                        size="sm"
                        dense
                      />
                      <q-checkbox
                        :model-value="isClubMemberSelected(member.id)"
                        color="accent"
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
              <q-tooltip>Cancel</q-tooltip>
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
              <q-tooltip>Add</q-tooltip>
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
              <q-tooltip>Import all</q-tooltip>
            </q-btn>

            <!-- Club Members Mode Button -->
            <q-btn
              v-else-if="addPlayerMode === 'club'"
              color="accent"
              @click="addClubMembers"
              label="Add Selected Members"
              :disable="selectedClubMembers.length === 0"
              icon="groups"
            >
              <q-tooltip>Add members</q-tooltip>
            </q-btn>
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
                  <q-tooltip>Read-only</q-tooltip>
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
              <div class="text-subtitle1 text-center q-mb-md">
                Enter match scores
              </div>

              <!-- Match Layout: same structure as MatchCard -->
              <div class="row items-center q-pa-sm no-wrap">
                <!-- Left: Team A -->
                <div class="col text-center">
                  <div
                    v-for="player in currentMatch.teamA"
                    :key="player.username"
                    class="column items-center q-mb-xs"
                  >
                    <span
                      class="text-weight-medium text-center"
                      style="
                        max-width: 80px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        display: block;
                      "
                      >{{ player.firstName || player.username }}</span
                    >
                    <span
                      v-if="player.username && player.firstName"
                      class="text-grey-6"
                      style="
                        font-size: 10px;
                        max-width: 80px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        display: block;
                      "
                    >
                      @{{ player.username }}
                    </span>
                    <q-chip
                      :label="`L${player.level}`"
                      :color="getLevelColor(player.level)"
                      text-color="white"
                      size="xs"
                      dense
                    />
                  </div>
                  <q-input
                    v-model.number="teamAScore"
                    type="number"
                    label="Score"
                    outlined
                    class="q-mt-sm"
                    input-class="text-h4 text-center"
                    style="
                      max-width: 120px;
                      margin-left: auto;
                      margin-right: auto;
                    "
                  />
                </div>

                <!-- Center: Court + Win Probability + VS -->
                <div
                  class="col-auto q-mx-md text-center"
                  style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                  "
                >
                  <q-chip
                    v-if="currentMatch.court"
                    color="blue-grey-7"
                    text-color="white"
                    size="sm"
                    dense
                  >
                    Court
                    <q-avatar
                      color="blue-grey-9"
                      style="left: 10px"
                      dense
                      size="xs"
                      rounded
                      text-color="white"
                      >{{ currentMatch.court }}</q-avatar
                    >
                  </q-chip>
                  <span class="text-caption text-grey-6">
                    {{
                      currentMatch.winProbability !== undefined
                        ? (currentMatch.winProbability * 100).toFixed(0)
                        : ''
                    }}%
                    <q-icon name="sports_tennis" color="grey-6" size="sm" />
                    {{
                      currentMatch.winProbability !== undefined
                        ? ((1 - currentMatch.winProbability) * 100).toFixed(0)
                        : ''
                    }}%
                  </span>
                  <q-chip
                    :color="getMatchStatusColor(currentMatch.status)"
                    text-color="white"
                    size="sm"
                    dense
                  >
                    {{ getMatchStatusLabel(currentMatch.status) }}
                  </q-chip>
                  <div class="text-h6 text-weight-bold text-grey-8">VS</div>
                </div>

                <!-- Right: Team B -->
                <div class="col text-center">
                  <div
                    v-for="player in currentMatch.teamB"
                    :key="player.username"
                    class="column items-center q-mb-xs"
                  >
                    <span
                      class="text-weight-medium text-center"
                      style="
                        max-width: 80px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        display: block;
                      "
                      >{{ player.firstName || player.username }}</span
                    >
                    <span
                      v-if="player.username && player.firstName"
                      class="text-grey-6"
                      style="
                        font-size: 10px;
                        max-width: 80px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        display: block;
                      "
                    >
                      @{{ player.username }}
                    </span>
                    <q-chip
                      :label="`L${player.level}`"
                      :color="getLevelColor(player.level)"
                      text-color="white"
                      size="xs"
                      dense
                    />
                  </div>
                  <q-input
                    v-model.number="teamBScore"
                    type="number"
                    label="Score"
                    outlined
                    class="q-mt-sm"
                    input-class="text-h4 text-center"
                    style="
                      max-width: 120px;
                      margin-left: auto;
                      margin-right: auto;
                    "
                  />
                </div>
              </div>
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

          <!-- Content -->
          <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
            <div class="q-gutter-y-md">
              <div>
                <div class="text-subtitle2 q-mb-sm">Queue Management</div>
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

              <div>
                <q-toggle
                  v-model="autoSortQueue"
                  label="Automatically sort queue by fairness"
                  color="accent"
                />
              </div>

              <div>
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

              <q-separator />

              <div>
                <div class="text-subtitle2 q-mb-sm">Court Management</div>
                <q-select
                  v-model="availableCourts"
                  :options="courtOptions"
                  label="Number of available courts"
                  outlined
                  dense
                />
                <q-toggle
                  v-model="autoAdvanceMatches"
                  label="Automatically start next match when one completes"
                  color="accent"
                  class="q-mt-sm"
                />
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
          </q-card-section>

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
                <div class="text-h6 q-mb-md">
                  Step 1: Select
                  {{ matchType === 'singles' ? '2' : '4' }} Players
                </div>
                <div class="text-caption text-grey-7 q-mb-md">
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
                <div class="text-h6 q-mb-md">Step 2: Arrange Teams</div>

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
                <div class="text-h6 q-mb-md">Step 3: Select Court</div>
                <div class="text-caption text-grey-7 q-mb-md">
                  Choose how to assign a court for this match
                </div>

                <!-- Smart Auto-Assign (Primary Option) -->
                <q-card
                  flat
                  bordered
                  class="cursor-pointer q-mb-md primary-court-option"
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
                  class="q-mb-md"
                >
                  <q-icon name="sports_tennis" class="q-mr-xs" />
                  {{ showManualSelection ? 'Hide' : 'Choose' }} Specific Court
                </q-btn>

                <!-- Manual Court List (Collapsible) -->
                <q-slide-transition>
                  <div v-if="showManualSelection">
                    <q-separator class="q-mb-md" />
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
              <div class="text-h6 q-mb-md">
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
                      <q-avatar
                        :color="getLevelColor(player.level)"
                        text-color="white"
                        size="md"
                      >
                        {{
                          getPlayerInitials(player.firstName || player.username)
                        }}
                      </q-avatar>
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
                        <span class="q-ml-xs text-primary"
                          >R:{{ player.rating }}</span
                        >
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
                          <q-tooltip>Remove</q-tooltip>
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
                          <q-tooltip>Swap</q-tooltip>
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
                      <q-avatar
                        :color="getLevelColor(player.level)"
                        text-color="white"
                        size="md"
                      >
                        {{
                          getPlayerInitials(player.firstName || player.username)
                        }}
                      </q-avatar>
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
                        <span class="q-ml-xs text-primary"
                          >R:{{ player.rating }}</span
                        >
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
                        <q-tooltip>Add</q-tooltip>
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
              <div class="text-h6 q-mb-md">Step 2: Arrange Teams</div>

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
                <q-tooltip>Next</q-tooltip>
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
                <q-tooltip v-if="selectedPlayers.length < 2">
                  Need 2+ players
                </q-tooltip>
                <q-tooltip v-else>Save</q-tooltip>
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
                <q-tooltip v-if="selectedPlayers.length < 2">
                  Need 2+ players
                </q-tooltip>
                <q-tooltip v-else-if="selectedPlayers.length > 4">
                  Max 4 players
                </q-tooltip>
                <q-tooltip v-else>Save</q-tooltip>
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
            <div class="text-subtitle2 q-mb-md">
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
                  <q-avatar
                    :color="getLevelColor(player.level)"
                    text-color="white"
                    size="md"
                  >
                    {{ getPlayerInitials(player.firstName || player.username) }}
                  </q-avatar>
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
                    <span class="q-ml-xs text-primary"
                      >R:{{ player.rating }}</span
                    >
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-btn flat round color="accent" icon="swap_horiz" size="sm">
                    <q-tooltip>Swap</q-tooltip>
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
              <q-tooltip>Cancel</q-tooltip>
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
              <q-tooltip>Cancel</q-tooltip>
            </q-btn>
          </q-card-actions>
        </q-card>
      </q-dialog>
    </template>

    <q-page-sticky position="bottom-left" :offset="[18, 18]">
      <q-btn round icon="person" color="accent" @click="goHome">
        <q-tooltip>Profile</q-tooltip>
      </q-btn>
    </q-page-sticky>
  </q-page>
</template>

<script setup lang="ts">
import { MatchmakingApp, mergeAppState } from '../services/matchmaking';
import type { Player, AppState } from '../services/matchmaking';
import { readItems, updateItem, readMe } from '@likha-erp/likha-sdk';
import { likhaClient } from 'src/boot/likha';
import { joinClub as joinClubService } from 'src/services/clubMembership';

import logoUrl from 'src/assets/queue master logo.png';
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar, LocalStorage } from 'quasar';
import { useNotify } from 'src/composables/useNotify';
import TeamArrangement from '../components/TeamArrangement.vue';
import PlayerList from '../components/PlayerList.vue';
import PlayerCard from '../components/PlayerCard.vue';
import EmptyState from '../components/EmptyState.vue';
import DialogHeader from '../components/DialogHeader.vue';
import MatchCard from '../components/MatchCard.vue';
import {
  getLevelColor,
  getLevelIcon,
  getMatchStatusColor,
  getMatchStatusLabel,
} from '../utils/playerHelpers';
import { computeWinProbability } from '../services/matchmaking';

// Player type

// Quasar instance for notifications
const $q = useQuasar();
const { notify } = useNotify();

// Handle 401 Unauthorized errors by clearing token and redirecting to login
const handleAuthError = (
  err: unknown,
  router: ReturnType<typeof useRouter>,
) => {
  const error = err as { response?: { status?: number } };
  if (error?.response?.status === 401) {
    likhaToken.value = '';
    localStorage.removeItem('likhaToken');
    notify({
      type: 'warning',
      message: 'Session expired. Please log in again.',
      timeout: 3000,
    });
    router.push('/login');
    return true;
  }
  return false;
};

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
      // 1. Group visually by Queue Type (Winners -> Losers -> General)
      const typeOrder: Record<string, number> = {
        WINNERS: 0,
        LOSERS: 1,
        GENERAL: 2,
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
        queueSource: m.queueSource,
      };
    });
});
const teamAScore = ref<number>(0);
const teamBScore = ref<number>(0);

const newPlayerName = ref<string | null>(null);
const newPlayerLevel = ref<1 | 2 | 3 | null>(null);
// Add player dialog mode: 'single' | 'bulk' | 'club'
const addPlayerMode = ref<'single' | 'bulk' | 'club'>('single');
const selectedClubMembers = ref<string[]>([]);
const clubMemberSearch = ref('');
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
const clubErrorMessage = ref<string>('');
const paymentLink = ref<string>('');
const paymentLoading = ref<boolean>(false);
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
    email?: string;
    rating?: number;
    level?: 1 | 2 | 3;
    isAdmin?: boolean;
    avatar?: string;
  }>
>([]);

const availableClubMembers = computed(() => {
  const search = clubMemberSearch.value.trim();
  if (!search) {
    return clubMembers.value
      .filter(
        (m) =>
          m.id &&
          !Object.values(MatchmakingApp.state.players).some(
            (p) => p.userId === m.id && !p.deletedAt,
          ),
      )
      .sort((a, b) => (a.username || '').localeCompare(b.username || ''));
  }

  // Simple includes search across firstName, username, and email
  const searchTerm = search.toLowerCase();
  return clubMembers.value
    .filter(
      (m) =>
        m.id &&
        !Object.values(MatchmakingApp.state.players).some(
          (p) => p.userId === m.id && !p.deletedAt,
        ),
    )
    .filter((m) => {
      const searchString =
        `${m.firstName || ''} ${m.username || ''} ${m.email || ''}`.toLowerCase();
      return searchString.includes(searchTerm);
    })
    .sort((a, b) => (a.username || '').localeCompare(b.username || ''));
});

const toggleClubMember = (memberId: string) => {
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

const callForActivation = async () => {
  if (paymentLink.value && !paymentLoading.value) {
    paymentLoading.value = true;
    try {
      const url = new URL(paymentLink.value);
      const path = url.pathname + url.search;
      console.log('POST path:', path);

      const token = await likhaClient.getToken();
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          clubId: currentClubId.value,
        }),
      });
      const result = (await response.json()).data;
      console.log('POST result:', result);

      if (result && typeof result.invoice_url === 'string') {
        window.open(result.invoice_url, '_blank');
      }
    } catch (err) {
      console.error('POST request failed:', err);
    } finally {
      paymentLoading.value = false;
    }
  }
};

const fetchPaymentSettings = async () => {
  try {
    const result = await likhaClient.request(
      readItems('payment_settings', {
        fields: ['club_activation_payment_link'] as string[],
        limit: 1,
      }),
    );

    const settings = result as unknown as Record<string, unknown>;
    paymentLink.value =
      typeof settings.club_activation_payment_link === 'string'
        ? settings.club_activation_payment_link
        : '';
  } catch (err) {
    console.warn('Failed to fetch payment settings:', err);
  }
};

// Cloud sync state
const isOnline = ref(navigator.onLine);
const hasPendingCloudSync = ref(false);
// The server's matchmaking.lastModified that our local state was last PUSHED to.
// Used as an optimistic-concurrency token: set ONLY after a successful write.
const lastSyncedServerTimestamp = ref(0);
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
          'players.directus_users_id.id',
          'players.directus_users_id.username',
          'players.directus_users_id.first_name',
          'players.directus_users_id.last_name',
          'players.directus_users_id.rating',
          'players.directus_users_id.avatar',
          'admins.directus_users_id.id',
        ] as unknown as string[],
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
          directus_users_id?: {
            id: string;
            username?: string;
            email?: string;
            rating?: number;
            rating_updated_at?: number;
          };
        }>;
        admins?: Array<{
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

      // Check if club is unpublished and user is admin
      if (club.status !== 'published') {
        const isAdmin = (club.admins || []).some(
          (a) => a.directus_users_id?.id === currentUserId.value,
        );
        if (isAdmin) {
          clubLoadingState.value = 'unpublished';
          clubErrorMessage.value = `Club "${club.name || clubId}" is not yet activated. Please click the Pay button below to activate.`;
          return;
        }
      }

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
        // Detect remote reset: another admin cleared all data
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
          // Another admin performed a reset — adopt empty server state
          MatchmakingApp.state.players = {};
          MatchmakingApp.state.queues = [];
          MatchmakingApp.state.activeMatches = [];
          MatchmakingApp.state.lastModified = serverTime;
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
            } else {
              // Existing local state: smart-merge with server
              const merged = mergeAppState(
                MatchmakingApp.state,
                serverMatchmaking,
              );
              MatchmakingApp.state.players = merged.players;
              MatchmakingApp.state.queues = merged.queues;
              MatchmakingApp.state.activeMatches = merged.activeMatches;
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
      MatchmakingApp.persist();

      // Build admin set and clubMembers list
      clubAdminIds.value = new Set(
        (club.admins || [])
          .map((a) => a.directus_users_id?.id)
          .filter((id): id is string => !!id),
      );
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
              isAdmin: clubAdminIds.value.has(userId),
              avatar: avatarId
                ? `${likhaUrl.value}/assets/${avatarId}`
                : undefined,
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
                  userRating || existingPlayer.rating || 1500;
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
    if (handleAuthError(err, router)) return;

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

      // Restore club metadata for admin detection
      const meta = LocalStorage.getItem(`club_meta_${clubId}`) as {
        clubUUID?: string;
        adminIds?: string[];
        members?: typeof clubMembers.value;
      } | null;
      if (meta) {
        currentClubUUID.value = meta.clubUUID || '';
        clubAdminIds.value = new Set(meta.adminIds || []);
        clubMembers.value = meta.members || [];
        isCurrentUserMember.value =
          isOpenPlay.value ||
          clubMembers.value.some((m) => m.id === currentUserId.value);
      }

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
          'players.directus_users_id.avatar',
          'players.directus_users_id.first_name',
          'players.directus_users_id.last_name',
        ] as unknown as string[],
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
    if (handleAuthError(err, router)) return;
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
      notify({
        type: 'info',
        message: 'Merged concurrent changes from another admin.',
        timeout: 3000,
      });
    }

    // 5. Stamp, push to cloud, persist locally, and advance our base version.
    const stamp = Date.now();
    MatchmakingApp.state.lastModified = stamp;

    console.log(
      '[cloudSync] pushing — queues:',
      MatchmakingApp.state.queues.length,
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
    hasPendingCloudSync.value = false;
    syncRetryPending = false;
    console.log('Successfully synced to cloud');
  } catch (err) {
    // Handle 401 Unauthorized errors
    if (handleAuthError(err, router)) {
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
  MatchmakingApp.persistSilently();
  lastSyncedServerTimestamp.value = incomingTs;

  console.log(
    '[applyServer] merged — queues:',
    MatchmakingApp.state.queues.length,
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
    notify({ color: 'negative', message: 'Failed to join club' });
  }
};

const doResumeSync = () => {
  // Throttle: ignore if we synced < 3s ago
  if (Date.now() - lastResumeSyncAt < 3000) return;
  lastResumeSyncAt = Date.now();
  if (isOnline.value && currentClubId.value) {
    void loadClubData(currentClubId.value);
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
    } catch {
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
    bulkPlayerText.value = '';
    bulkPlayers.value = [];
    bulkDefaultLevel.value = 2;
  }
});
const showSettingsDialog = ref(false);
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
    MatchmakingApp.state.queues.map((q) => q.username),
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

// Helper function to get player initials
const getPlayerInitials = (name: string): string => {
  return name.charAt(0).toUpperCase();
};

const filteredMatches = computed(() => {
  let filtered =
    matchesFilterBy.value === 'all'
      ? matches.value
      : matches.value.filter((match) => match.court === matchesFilterBy.value);

  // Sort by status: in-progress first, then waiting, then explicitly by FIFO (oldest first)
  filtered = [...filtered].sort((a, b) => {
    const statusOrder = { 'in-progress': 0, waiting: 1, completed: 2 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;

    // Within same status, sort by FIFO (oldest first)
    return a.createdAt.getTime() - b.createdAt.getTime();
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

  // Sort players by level for better team balancing
  const sortedPlayers = [...players].sort((a, b) => a.level - b.level);

  // Generate all possible team combinations
  const combinations = generateTeamCombinations(sortedPlayers);

  // Calculate skill differences for all combinations
  const combinationsWithScores = combinations.map((combination) => {
    const team1 = combination.team1;
    const team2 = combination.team2;

    const team1Skill = team1.reduce((sum, p) => sum + p.level, 0);
    const team2Skill = team2.reduce((sum, p) => sum + p.level, 0);
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
    { rating: initialRating },
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

    const result = MatchmakingApp.checkInPlayer(
      trimmedName,
      bulkPlayer.level as 1 | 2 | 3,
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
  if (currentMatchIndex.value === -1) return;
  const match = matches.value[currentMatchIndex.value];

  const scoreA = Number(teamAScore.value) || 0;
  const scoreB = Number(teamBScore.value) || 0;

  if (scoreA === scoreB) {
    notify({
      type: 'warning',
      message: 'Ties are not allowed.',
    });
    return;
  }

  const freedCourt = match.court;

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

// Auto-advance next match for a specific court (FCFS based on creation time)
const autoAdvanceNextMatchForCourt = (courtNumber?: number) => {
  // Only auto-advance if the setting is enabled
  if (!autoAdvanceMatches.value) return;

  // Find the oldest waiting match (by creation time)
  const waitingMatches = matches.value
    .filter(
      (match) =>
        match.status === 'waiting' &&
        (!match.court || match.court === courtNumber),
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()); // Oldest first

  const nextMatch = waitingMatches[0];

  if (nextMatch && courtNumber) {
    // Check if the court is actually available (no in-progress match on it)
    if (isCourtAvailable(courtNumber)) {
      // Court is available, assign and start the match
      const actualMatch = MatchmakingApp.state.activeMatches.find(
        (am) => am.matchId === nextMatch.id,
      );
      if (actualMatch) {
        actualMatch.court = courtNumber;
        actualMatch.status = 'in-progress';
        actualMatch.createdAt = Date.now();
        actualMatch.updatedAt = Date.now();
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
    Object.values(MatchmakingApp.state.players).forEach((player) => {
      player.matchesPlayed = 0;
      player.wins = 0;
      player.losses = 0;
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
    // Clear the queue
    MatchmakingApp.state.queues = [];
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
  }).onOk(() => {
    // Reset player stats
    Object.values(MatchmakingApp.state.players).forEach((player) => {
      player.matchesPlayed = 0;
      player.wins = 0;
      player.losses = 0;
    });

    // Clear matches
    MatchmakingApp.state.activeMatches = [];

    // Clear queue
    MatchmakingApp.state.queues = [];

    MatchmakingApp.persist();

    notify({
      type: 'positive',
      message: 'Session reset complete',
    });
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

  const assignedCourt = selectedCourt.value || undefined;
  const isCourtEmpty =
    !assignedCourt ||
    !matches.value.some(
      (m) => m.court === assignedCourt && m.status === 'in-progress',
    );

  // Map original queue types
  const originalQueueTypes: Record<string, 'GENERAL' | 'WINNERS' | 'LOSERS'> =
    {};
  matchPlayers.forEach((p) => {
    const queueEntry = MatchmakingApp.state.queues.find(
      (q) => q.username === p.username,
    );
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
    status: isCourtEmpty ? 'in-progress' : 'waiting',
    court: isCourtEmpty ? assignedCourt : undefined,
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
        enteredAt = Date.now() - 3600000; // 1 hour old
      }

      // Return players to queue (prevent duplicates)
      const playerUsernames = [...actualMatch.teamA, ...actualMatch.teamB];
      for (const username of playerUsernames) {
        // Check if player is already in queue
        const alreadyInQueue = MatchmakingApp.state.queues.some(
          (q) => q.username === username,
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
            updatedAt: Date.now(),
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

  if (court > 0) {
    const actualMatch = MatchmakingApp.state.activeMatches.find(
      (am) => am.matchId === match.id,
    );
    if (actualMatch) {
      actualMatch.court = court;
      actualMatch.updatedAt = Date.now();
    }

    // Count matches for this court to show load balancing info
    const courtMatchCount = matches.value.filter(
      (m) => m.court === court,
    ).length;

    notify({
      type: 'positive',
      message: `Assigned to Court ${court} (${courtMatchCount} total matches)`,
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
  actualMatch.status = 'in-progress';
  actualMatch.createdAt = Date.now();
  actualMatch.updatedAt = Date.now();

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
        actualExisting.createdAt = Date.now();
        actualExisting.updatedAt = Date.now();
      }

      const actualMatch = MatchmakingApp.state.activeMatches.find(
        (am) => am.matchId === match.id,
      );
      if (actualMatch) {
        actualMatch.court = courtNumber;
        // Only start if it was already in-progress (shouldn't happen for waiting matches)
        if (actualMatch.status !== 'in-progress') {
          actualMatch.status = 'in-progress';
          actualMatch.createdAt = Date.now();
          actualMatch.updatedAt = Date.now();
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
    // Court is available - simple assignment
    const actualMatch = MatchmakingApp.state.activeMatches.find(
      (am) => am.matchId === match.id,
    );
    if (actualMatch) {
      actualMatch.court = courtNumber;
      actualMatch.updatedAt = Date.now();
    }

    // Don't auto-start the match; it will start via auto-advance or manual start button
    // Just assign the court and leave status as is
    MatchmakingApp.persist();

    notify({
      type: 'positive',
      message: `Assigned to Court ${courtNumber}`,
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
    if (!MatchmakingApp.state.queues.some((q) => q.username === p.username)) {
      MatchmakingApp.state.queues.push({
        username: p.username,
        queueType: 'GENERAL',
        enteredAt: Date.now(),
        updatedAt: Date.now(),
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
</style>
