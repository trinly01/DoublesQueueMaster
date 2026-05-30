<template>
  <q-page class="doubles-queue-page">
    <!-- Header Section -->
    <div class="header-section">
      <div class="container">
        <div class="row items-center justify-between">
          <div class="col">
            <h1 class="text-h5 text-weight-bold text-white q-mb-xs">
              🏓 Dink It
            </h1>
            <p class="text-caption text-grey-1 q-ma-none">
              Smart matchmaking for singles & doubles
            </p>
          </div>
          <div class="col-auto">
            <q-btn
              color="white"
              icon="settings"
              label="Settings"
              @click="showSettingsDialog = true"
              flat
              size="sm"
            >
              <q-tooltip>Open settings and preferences</q-tooltip>
            </q-btn>
          </div>
        </div>
      </div>
    </div>

    <div class="container q-pa-md">
      <q-banner
        v-if="!isOnline"
        :class="$q.dark.isActive ? 'bg-grey-9' : 'bg-grey-3'"
        class="q-mb-md rounded-borders"
      >
        <template v-slot:avatar>
          <q-icon name="signal_wifi_off" color="primary" />
        </template>
        You have lost connection to the internet. This app is offline. Any
        changes made will be saved locally and synced automatically when you
        reconnect.
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
                  v-if="!isReadOnlyMode"
                  color="white"
                  @click="showAddPlayerDialog = true"
                  icon="person_add"
                  flat
                  round
                  dense
                >
                  <q-tooltip>Add new player to the system</q-tooltip>
                </q-btn>
                <q-btn
                  v-if="!isReadOnlyMode"
                  color="white"
                  @click="addAllPlayersToQueue"
                  :disable="allPlayersInQueue"
                  icon="group_add"
                  flat
                  round
                  dense
                >
                  <q-tooltip>Add all players to queue</q-tooltip>
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
                  :show-actions="true"
                  :show-requeue-button="true"
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
                  :show-requeue-button="false"
                  :empty-icon="'queue'"
                  :empty-title="'Queue is empty'"
                  :empty-subtitle="'Add players to start generating matches'"
                  @player-remove="removeFromQueue"
                />
              </div>
            </q-card-section>
            <q-card-section>
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

              <div class="row q-gutter-sm">
                <q-btn
                  v-if="!isReadOnlyMode"
                  class="col"
                  color="accent"
                  @click="generateNewMatches"
                  size="md"
                  icon="auto_awesome"
                  :disable="!canGenerateMatches()"
                >
                  <span class="gt-xs">Auto Generate</span>
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
                  v-if="!isReadOnlyMode"
                  class="col"
                  color="accent"
                  @click="startManualSelection"
                  size="md"
                  icon="touch_app"
                  :disable="queue.length < (matchType === 'singles' ? 2 : 4)"
                  outline
                >
                  <span class="gt-xs">Manual Selection</span>
                  <span class="lt-sm">Manual</span>
                  <q-tooltip
                    v-if="queue.length < (matchType === 'singles' ? 2 : 4)"
                  >
                    {{
                      matchType === 'singles'
                        ? 'Need at least 2 players for manual singles selection'
                        : 'Need at least 4 players for manual doubles selection'
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
                        v-if="!isReadOnlyMode"
                        color="accent"
                        @click="showAddPlayerDialog = true"
                        icon="person_add"
                        flat
                        round
                        dense
                      >
                        <q-tooltip>Add new player</q-tooltip>
                      </q-btn>
                      <q-btn
                        v-if="!isReadOnlyMode"
                        color="accent"
                        @click="addAllPlayersToQueue"
                        :disable="allPlayersInQueue"
                        icon="group_add"
                        flat
                        round
                        dense
                      >
                        <q-tooltip>Add all players to queue</q-tooltip>
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
                    :show-actions="true"
                    :show-requeue-button="true"
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
                    :show-requeue-button="false"
                    :empty-icon="'queue'"
                    :empty-title="'Queue is empty'"
                    :empty-subtitle="'Add players to start generating matches'"
                    @player-remove="removeFromQueue"
                  />
                </div>
              </q-card-section>
              <q-card-section>
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

                <div class="row q-gutter-sm">
                  <q-btn
                    v-if="!isReadOnlyMode"
                    class="col"
                    color="accent"
                    @click="generateNewMatches"
                    size="md"
                    icon="auto_awesome"
                    :disable="!canGenerateMatches()"
                  >
                    <span class="gt-xs">Auto Generate</span>
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
                    v-if="!isReadOnlyMode"
                    class="col"
                    color="accent"
                    @click="startManualSelection"
                    size="md"
                    icon="touch_app"
                    :disable="queue.length < (matchType === 'singles' ? 2 : 4)"
                    outline
                  >
                    <span class="gt-xs">Manual Selection</span>
                    <span class="lt-sm">Manual</span>
                    <q-tooltip
                      v-if="queue.length < (matchType === 'singles' ? 2 : 4)"
                    >
                      {{
                        matchType === 'singles'
                          ? 'Need at least 2 players for manual singles selection'
                          : 'Need at least 4 players for manual doubles selection'
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
          <div class="q-mb-md q-pb-lg" v-if="!isReadOnlyMode">
            <q-btn-toggle
              v-model="bulkImportMode"
              :options="[
                { label: 'Single Player', value: false, icon: 'person' },
                { label: 'Bulk Import', value: true, icon: 'group_add' },
              ]"
              color="grey-5"
              toggle-color="accent"
              spread
              class="full-width"
            />
          </div>

          <!-- Single Player Mode -->
          <div v-if="!bulkImportMode" class="q-gutter-y-md">
            <q-input
              v-model="newPlayerName"
              label="Player Name"
              type="text"
              @keyup.enter="addNewPlayer"
              :rules="[(val) => !!val?.trim() || 'Player name is required']"
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
          <div v-else class="q-gutter-y-md">
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
            <q-tooltip>Cancel adding new player</q-tooltip>
          </q-btn>

          <!-- Single Player Mode Button -->
          <q-btn
            v-if="!bulkImportMode"
            color="accent"
            @click="addNewPlayer"
            label="Add Player"
            :disable="!newPlayerName?.trim() || newPlayerLevel === null"
            icon="add"
          >
            <q-tooltip>Add this player to the system</q-tooltip>
          </q-btn>

          <!-- Bulk Import Mode Button -->
          <q-btn
            v-else
            color="accent"
            @click="addBulkPlayers"
            label="Import All Players"
            :disable="bulkPlayers.length === 0"
            icon="group_add"
          >
            <q-tooltip
              >Import all {{ bulkPlayers.length }} players to the
              system</q-tooltip
            >
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
            </div>

            <q-input
              v-model="editPlayerName"
              label="Player Name"
              type="text"
              :rules="[(val) => !!val?.trim() || 'Player name is required']"
              outlined
              dense
              autofocus
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

            <div class="row q-col-gutter-md">
              <!-- Team A -->
              <div class="col-6">
                <q-card class="team-card" flat bordered>
                  <q-card-section class="text-center">
                    <div class="text-weight-medium q-mb-sm">Team 1</div>
                    <q-chip
                      v-for="p in currentMatch.teamA"
                      :key="p.username"
                      :label="p.username"
                      :color="getLevelColor(p.level)"
                      text-color="white"
                      size="sm"
                      dense
                    />
                  </q-card-section>
                  <q-card-section>
                    <q-input
                      v-model.number="teamAScore"
                      type="number"
                      label="Score"
                      outlined
                      dense
                    />
                  </q-card-section>
                </q-card>
              </div>

              <!-- Team B -->
              <div class="col-6">
                <q-card class="team-card" flat bordered>
                  <q-card-section class="text-center">
                    <div class="text-weight-medium q-mb-sm">Team 2</div>
                    <q-chip
                      v-for="p in currentMatch.teamB"
                      :key="p.username"
                      :label="p.username"
                      :color="getLevelColor(p.level)"
                      text-color="white"
                      size="sm"
                      dense
                    />
                  </q-card-section>
                  <q-card-section>
                    <q-input
                      v-model.number="teamBScore"
                      type="number"
                      label="Score"
                      outlined
                      dense
                    />
                  </q-card-section>
                </q-card>
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
            <template v-if="!isReadOnlyMode">
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
            </template>

            <div class="text-subtitle2 q-mb-sm">Cloud Integration</div>

            <q-banner
              v-if="isReadOnlyMode"
              class="bg-warning text-dark q-mb-md rounded-borders"
            >
              <template v-slot:avatar>
                <q-icon name="visibility" />
              </template>
              <span class="text-weight-bold">Watch Mode Active:</span>
              Viewing live data from Club ID "{{ likhaClubId }}". Changes are
              disabled without a Token.
            </q-banner>

            <div class="q-gutter-y-sm q-mb-md">
              <q-input
                v-model="likhaUrl"
                label="Likha URL"
                outlined
                dense
                placeholder="https://dink-it.zyberlab.com"
              />
              <q-input
                v-model="likhaToken"
                label="Likha Token (Write Access)"
                outlined
                dense
                type="password"
              />
              <q-input
                v-model="likhaClubId"
                label="Club ID (Read Access without Token)"
                outlined
                dense
              />
              <div class="row items-center q-gutter-x-sm">
                <q-btn
                  color="primary"
                  label="Fetch Clubs"
                  @click="fetchClubs"
                  :disable="!likhaUrl || !likhaToken"
                  outline
                  dense
                />
                <q-spinner v-if="isFetchingClubs" color="primary" size="2em" />
              </div>
              <q-select
                v-if="clubOptions.length > 0"
                v-model="likhaClubUUID"
                :options="clubOptions"
                label="Select Club"
                outlined
                dense
                clearable
                emit-value
                map-options
              />
            </div>

            <q-separator />

            <template v-if="!isReadOnlyMode">
              <div class="text-subtitle2 q-mb-sm">Data Management</div>

              <div class="row q-gutter-sm">
                <div class="col">
                  <q-btn
                    color="accent"
                    @click="resetGamesPlayed"
                    icon="refresh"
                    label="Reset Stats"
                    class="full-width"
                  />
                </div>
                <div class="col">
                  <q-btn
                    color="warning"
                    @click="clearMatches"
                    icon="delete"
                    label="Clear Matches"
                    class="full-width"
                  />
                </div>
                <div class="col">
                  <q-btn
                    color="warning"
                    @click="clearQueue"
                    icon="delete_outline"
                    label="Clear Queue"
                    class="full-width"
                  />
                </div>
              </div>

              <div class="q-mt-sm">
                <q-btn
                  color="negative"
                  @click="resetAllData"
                  icon="delete_forever"
                  label="Reset Everything (Incl. Players)"
                  class="full-width"
                />
              </div>
            </template>
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
                Step 1: Select {{ matchType === 'singles' ? '2' : '4' }} Players
              </div>
              <div class="text-caption text-grey-7 q-mb-md">
                Click on players to select them for the match ({{
                  selectedPlayers.length
                }}/{{ matchType === 'singles' ? 2 : 4 }} selected)
              </div>

              <q-list separator bordered class="rounded-borders">
                <q-item
                  v-for="player in queue"
                  :key="player.username"
                  clickable
                  @click="togglePlayerSelection(player)"
                  :class="{ 'selected-player': isPlayerSelected(player) }"
                  class="player-selection-item"
                >
                  <q-item-section avatar>
                    <q-checkbox
                      :model-value="isPlayerSelected(player)"
                      color="accent"
                      @click.stop="togglePlayerSelection(player)"
                    />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-weight-medium">{{
                      player.username
                    }}</q-item-label>
                    <q-item-label caption class="q-pl-xs">
                      <q-chip
                        :label="`Level ${player.level}`"
                        :color="getLevelColor(player.level)"
                        text-color="white"
                        size="sm"
                        dense
                      />
                      <span class="q-ml-sm text-grey-7"
                        >G: {{ player.matchesPlayed }}</span
                      >
                      <span class="q-ml-xs text-positive"
                        >W:{{ player.wins || 0 }}</span
                      >
                      <span class="q-ml-xs text-negative"
                        >L:{{ player.losses || 0 }}</span
                      >
                      <span class="q-ml-xs text-info"
                        >WR:{{
                          player.matchesPlayed
                            ? Math.round(
                                ((player.wins || 0) / player.matchesPlayed) *
                                  100,
                              )
                            : 0
                        }}%</span
                      >
                      <span class="q-ml-sm text-primary"
                        >Rating: {{ (player.matchesPlayed || 0) < 3 ? 'NR' : player.rating }}</span
                      >
                    </q-item-label>
                  </q-item-section>
                </q-item>
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
            <div v-if="manualSelectionStep === 3" class="court-selection-step">
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
                  <q-icon v-else name="radio_button_unchecked" color="grey-6" />
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
                            selectedCourt === court.value ? 'accent' : 'blue-6'
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
                      <q-item-section side v-if="selectedCourt === court.value">
                        <q-icon name="check_circle" color="accent" />
                      </q-item-section>
                      <q-item-section side v-else>
                        <q-icon name="radio_button_unchecked" color="grey-6" />
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
                  <q-item-section>
                    <q-item-label class="text-weight-medium">{{
                      player.username
                    }}</q-item-label>
                    <q-item-label caption class="q-pl-xs">
                      <q-chip
                        :label="`Level ${player.level}`"
                        :color="getLevelColor(player.level)"
                        text-color="white"
                        size="xs"
                        dense
                      />
                      <span class="q-ml-xs text-grey-7"
                        >G:{{ player.matchesPlayed }}</span
                      >
                      <span class="q-ml-xs text-positive"
                        >W:{{ player.wins || 0 }}</span
                      >
                      <span class="q-ml-xs text-negative"
                        >L:{{ player.losses || 0 }}</span
                      >
                      <span class="q-ml-xs text-info"
                        >WR:{{
                          player.matchesPlayed
                            ? Math.round(
                                ((player.wins || 0) / player.matchesPlayed) *
                                  100,
                              )
                            : 0
                        }}%</span
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
                        <q-tooltip>Remove from match</q-tooltip>
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
                        <q-tooltip>Replace with another player</q-tooltip>
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
                  <q-item-section>
                    <q-item-label class="text-weight-medium">{{
                      player.username
                    }}</q-item-label>
                    <q-item-label caption class="q-pl-xs">
                      <q-chip
                        :label="`Level ${player.level}`"
                        :color="getLevelColor(player.level)"
                        text-color="white"
                        size="xs"
                        dense
                      />
                      <span class="q-ml-sm text-grey-7"
                        >G: {{ player.matchesPlayed }}</span
                      >
                      <span class="q-ml-xs text-positive"
                        >W:{{ player.wins || 0 }}</span
                      >
                      <span class="q-ml-xs text-negative"
                        >L:{{ player.losses || 0 }}</span
                      >
                      <span class="q-ml-xs text-info"
                        >WR:{{
                          player.matchesPlayed
                            ? Math.round(
                                ((player.wins || 0) / player.matchesPlayed) *
                                  100,
                              )
                            : 0
                        }}%</span
                      >
                      <span
                        v-if="player.priority === 'returned'"
                        class="q-ml-sm text-orange"
                        >(Returned)</span
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
                      <q-tooltip>Add to match</q-tooltip>
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
              <q-tooltip>Proceed to team arrangement</q-tooltip>
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
                Need at least 2 players to save match
              </q-tooltip>
              <q-tooltip v-else> Save match changes </q-tooltip>
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
                Need at least 2 players to save match
              </q-tooltip>
              <q-tooltip v-else-if="selectedPlayers.length > 4">
                Maximum 4 players allowed for tennis matches
              </q-tooltip>
              <q-tooltip v-else> Save match changes </q-tooltip>
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
            <strong>{{ playerToReplaceInEdit?.username }}</strong> with:
          </div>

          <q-list bordered separator>
            <q-item
              v-for="player in availableQueuePlayers"
              :key="player.username"
              clickable
              class="player-edit-item"
              @click="selectReplacementPlayer(player)"
            >
              <q-item-section>
                <q-item-label class="text-weight-medium">{{
                  player.username
                }}</q-item-label>
                <q-item-label caption class="q-pl-xs">
                  <q-chip
                    :label="`Level ${player.level}`"
                    :color="getLevelColor(player.level)"
                    text-color="white"
                    size="xs"
                    dense
                  />
                  <span class="q-ml-sm text-grey-7"
                    >Games: {{ player.matchesPlayed }}</span
                  >
                  <span
                    v-if="player.priority === 'returned'"
                    class="q-ml-sm text-orange"
                    >(Returned)</span
                  >
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn flat round color="accent" icon="swap_horiz" size="sm">
                  <q-tooltip
                    >Click to replace {{ playerToReplaceInEdit?.username }} with
                    {{ player.username }}</q-tooltip
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
            <q-tooltip>Cancel player replacement</q-tooltip>
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
            <q-tooltip>Cancel court assignment</q-tooltip>
          </q-btn>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { MatchmakingApp } from '../services/matchmaking';
import type { Player } from '../services/matchmaking';

import { ref, computed, watch, onMounted, onUnmounted, provide } from 'vue';
import { useQuasar, debounce } from 'quasar';
import TeamArrangement from '../components/TeamArrangement.vue';
import PlayerList from '../components/PlayerList.vue';
import EmptyState from '../components/EmptyState.vue';
import DialogHeader from '../components/DialogHeader.vue';
import MatchCard from '../components/MatchCard.vue';
import { getLevelColor, getLevelIcon } from '../utils/playerHelpers';

// Player type

// Quasar instance for notifications
const $q = useQuasar();

// State: Players, Queue, and Matches
const players = computed(() =>
  Object.values(MatchmakingApp.state.players).map((p) => ({
    ...p,
    name: p.username,
  })),
);
const queue = computed(() => {
  const mapped = MatchmakingApp.state.queues.map((q) => {
    const p = MatchmakingApp.state.players[q.username];
    return {
      ...p,
      username: p.username,
      enteredAt: q.enteredAt,
      queueType: q.queueType,
    };
  });

  if (autoSortQueue.value) {
    const sortFn = (
      a: { matchesPlayed: number; enteredAt: number },
      b: { matchesPlayed: number; enteredAt: number },
    ) => {
      if (queuePriorityMode.value === 'gamesPlayed') {
        if (a.matchesPlayed !== b.matchesPlayed) {
          return a.matchesPlayed - b.matchesPlayed;
        }
      }
      return a.enteredAt - b.enteredAt;
    };

    return [...mapped].sort(sortFn);
  }

  return mapped;
});
const matches = computed(() => {
  return MatchmakingApp.state.activeMatches.map((m, index) => {
    return {
      id: m.matchId,
      teamA: m.teamA.map((u) => ({
        ...MatchmakingApp.state.players[u],
        username: u,
      })),
      teamB: m.teamB.map((u) => ({
        ...MatchmakingApp.state.players[u],
        username: u,
      })),
      players: [...m.teamA, ...m.teamB].map((u) => ({
        ...MatchmakingApp.state.players[u],
        username: u,
      })),
      expectedDifference: m.expectedDifference,
      status: m.status || 'in-progress',
      court: m.court,
      order: index + 1,
      createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
      queueSource: m.queueSource,
    };
  });
});
const teamAScore = ref<number>(0);
const teamBScore = ref<number>(0);

const newPlayerName = ref<string | null>(null);
const newPlayerLevel = ref<1 | 2 | 3 | null>(null);
// Bulk import state
const bulkImportMode = ref<boolean>(false);
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

const availableCourts = ref<number | CourtOption>(
  getCourtSettingsFromStorage().availableCourts,
);
const autoAdvanceMatches = ref<boolean>(
  getCourtSettingsFromStorage().autoAdvanceMatches,
);
const maxCourts = ref<number>(8);

// Likha Integration State
const likhaUrl = ref<string>(getLikhaSettingsFromStorage().likhaUrl);
const likhaToken = ref<string>(getLikhaSettingsFromStorage().likhaToken);
const likhaClubId = ref<string | null>(
  getLikhaSettingsFromStorage().likhaClubId,
);
const likhaClubUUID = ref<string | null>(
  getLikhaSettingsFromStorage().likhaClubUUID || null,
);
const clubOptions = ref<
  { label: string; value: string; clubIdString?: string }[]
>([]);
const isFetchingClubs = ref<boolean>(false);

const isReadOnlyMode = computed(() => {
  return !!likhaClubId.value && !likhaToken.value;
});
provide('isReadOnlyMode', isReadOnlyMode);

const fetchClubs = async () => {
  if (!likhaUrl.value || !likhaToken.value) return;
  isFetchingClubs.value = true;
  try {
    const url = likhaUrl.value.endsWith('/')
      ? likhaUrl.value.slice(0, -1)
      : likhaUrl.value;
    const response = await fetch(`${url}/items/club`, {
      headers: {
        Authorization: `Bearer ${likhaToken.value}`,
      },
    });
    const data = await response.json();
    console.log('Data from fetch clubs', data);
    if (data.data) {
      clubOptions.value = data.data.map(
        (c: {
          name?: string;
          title?: string;
          id: string;
          clubId?: string;
        }) => ({
          label: c.name || c.title || c.id,
          value: c.id,
          clubIdString: c.clubId || c.id,
        }),
      );
      $q.notify({
        type: 'positive',
        message: `Fetched ${clubOptions.value.length} clubs`,
        position: 'top',
      });
    } else if (data.errors) {
      throw new Error(data.errors[0].message);
    }
  } catch (err: unknown) {
    console.error('Failed to fetch clubs', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    $q.notify({
      type: 'negative',
      message: `Failed to fetch clubs: ${errorMessage}`,
      position: 'top',
    });
  } finally {
    isFetchingClubs.value = false;
  }
};

let pollInterval: ReturnType<typeof setInterval> | null = null;

const fetchLikhaAppState = async () => {
  if (!likhaClubId.value || !likhaUrl.value) return;
  try {
    const url = likhaUrl.value.endsWith('/')
      ? likhaUrl.value.slice(0, -1)
      : likhaUrl.value;

    const isId = likhaClubUUID.value
      ? true
      : /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
          likhaClubId.value,
        );
    const targetId = likhaClubUUID.value || likhaClubId.value;
    const endpoint = isId
      ? `${url}/items/club/${targetId}?fields=appState`
      : `${url}/items/club?filter[clubId][_eq]=${likhaClubId.value}&fields=appState`;

    const res = await fetch(endpoint);
    if (!res.ok) return;
    const data = await res.json();
    console.log('Data from fetch appState', data);

    const appState = isId
      ? data.data?.appState
      : data.data && data.data.length > 0
        ? data.data[0].appState
        : null;

    if (appState) {
      if (appState.matchmaking) {
        Object.assign(MatchmakingApp.state, appState.matchmaking);
      }
      if (appState.courtSettings) {
        autoAdvanceMatches.value = appState.courtSettings.autoAdvanceMatches;
      }
      if (appState.queueSettings) {
        queueReturnMethod.value = appState.queueSettings.queueReturnMethod;
        autoSortQueue.value = appState.queueSettings.autoSortQueue;
        queuePriorityMode.value = appState.queueSettings.queuePriorityMode;
      }
      if (appState.uiSettings) {
        sortBy.value = appState.uiSettings.sortBy;
        matchType.value = appState.uiSettings.matchType;
      }
    }
  } catch (err) {
    // Silent catch for polling
  }
};

const startWatchModePolling = () => {
  if (pollInterval) clearInterval(pollInterval);
  if (likhaClubId.value && likhaUrl.value) {
    if (!likhaToken.value) {
      // Always fetch state once when the club is loaded or changes
      fetchLikhaAppState();
      pollInterval = setInterval(fetchLikhaAppState, 5000);
    }
  }
};

const isOnline = ref(navigator.onLine);

const updateOnlineStatus = () => {
  const wasOffline = !isOnline.value;
  isOnline.value = navigator.onLine;

  if (isOnline.value && wasOffline && likhaToken.value) {
    // We just came back online and we are an admin! Sync offline changes to cloud.
    syncStateToLikha();
    $q.notify({
      type: 'positive',
      message: 'Connection restored. Syncing offline changes...',
      position: 'top',
      timeout: 3000,
    });
  }
};

onMounted(() => {
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  if (likhaUrl.value && likhaToken.value) {
    fetchClubs();
  }
  startWatchModePolling();
});

onUnmounted(() => {
  window.removeEventListener('online', updateOnlineStatus);
  window.removeEventListener('offline', updateOnlineStatus);
});

watch([likhaToken, likhaClubId, likhaUrl], () => {
  startWatchModePolling();
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

// Sort state
const sortBy = ref<
  'matchesPlayed' | 'rating' | 'winRate' | 'wins' | 'losses' | 'name'
>(getUISettingsFromStorage().sortBy);

// Search state for players
const searchPlayers = ref<string>('');

// Matches filter state
const matchesFilterBy = ref<'all' | number>(
  getUISettingsFromStorage().matchesFilterBy,
);

// Match type state
const matchType = ref<'singles' | 'doubles'>(
  getUISettingsFromStorage().matchType,
);

// Queue management state
const queueReturnMethod = ref<
  'fairness_first' | 'end_of_queue' | 'smart_position'
>(getQueueSettingsFromStorage().queueReturnMethod);

// Edit player state
const showEditPlayerDialog = ref(false);
const editingPlayer = ref<Player | null>(null);
const editPlayerName = ref<string | null>(null);
const editPlayerLevel = ref<1 | 2 | 3 | null>(null);
const autoSortQueue = ref<boolean>(getQueueSettingsFromStorage().autoSortQueue);
const queuePriorityMode = ref<'timestamp' | 'gamesPlayed'>(
  getQueueSettingsFromStorage().queuePriorityMode,
);

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
  if (!searchPlayers.value?.trim()) {
    return players.value;
  }
  const query = searchPlayers.value.toLowerCase().trim();
  return players.value.filter((p) => p.username.toLowerCase().includes(query));
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

const filteredMatches = computed(() => {
  let filtered =
    matchesFilterBy.value === 'all'
      ? matches.value
      : matches.value.filter((match) => match.court === matchesFilterBy.value);

  // Sort by status: in-progress first, then waiting
  filtered = [...filtered].sort((a, b) => {
    const statusOrder = { 'in-progress': 0, waiting: 1, completed: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
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

// Storage functions

function getLikhaSettingsFromStorage(): {
  likhaUrl: string;
  likhaToken: string;
  likhaClubId: string | null;
  likhaClubUUID?: string | null;
} {
  const settings = localStorage.getItem('likhaSettings');
  if (settings) {
    const parsed = JSON.parse(settings);
    // Ensure existing storage gets the new default if empty
    if (!parsed.likhaUrl) {
      parsed.likhaUrl = 'https://dink-it.zyberlab.com';
    }
    return parsed;
  }
  return {
    likhaUrl: 'https://dink-it.zyberlab.com',
    likhaToken: '',
    likhaClubId: null,
    likhaClubUUID: null,
  };
}

function saveLikhaSettingsToStorage(): void {
  localStorage.setItem(
    'likhaSettings',
    JSON.stringify({
      likhaUrl: likhaUrl.value,
      likhaToken: likhaToken.value,
      likhaClubId: likhaClubId.value,
      likhaClubUUID: likhaClubUUID.value,
    }),
  );
}

function getCourtSettingsFromStorage(): {
  availableCourts: number;
  autoAdvanceMatches: boolean;
} {
  const settings = localStorage.getItem('courtSettings');
  if (settings) {
    const parsed = JSON.parse(settings);
    return {
      availableCourts: parsed.availableCourts || 2,
      autoAdvanceMatches:
        parsed.autoAdvanceMatches !== undefined
          ? parsed.autoAdvanceMatches
          : true,
    };
  }
  return {
    availableCourts: 2,
    autoAdvanceMatches: true,
  };
}

function saveCourtSettingsToStorage(): void {
  localStorage.setItem(
    'courtSettings',
    JSON.stringify({
      availableCourts: availableCourts.value,
      autoAdvanceMatches: autoAdvanceMatches.value,
    }),
  );
}

function getQueueSettingsFromStorage(): {
  queueReturnMethod: 'fairness_first' | 'end_of_queue' | 'smart_position';
  autoSortQueue: boolean;
  queuePriorityMode: 'timestamp' | 'gamesPlayed';
} {
  const settings = localStorage.getItem('queueSettings');
  if (settings) {
    const parsed = JSON.parse(settings);
    // Migrate: if stored value is an object (old format), extract the value property
    const queueReturnMethod =
      typeof parsed.queueReturnMethod === 'string'
        ? parsed.queueReturnMethod
        : parsed.queueReturnMethod?.value || 'fairness_first';
    const queuePriorityMode =
      typeof parsed.queuePriorityMode === 'string'
        ? parsed.queuePriorityMode
        : parsed.queuePriorityMode?.value || 'gamesPlayed';
    return {
      queueReturnMethod,
      autoSortQueue:
        parsed.autoSortQueue !== undefined ? parsed.autoSortQueue : true,
      queuePriorityMode,
    };
  }
  return {
    queueReturnMethod: 'end_of_queue',
    autoSortQueue: true,
    queuePriorityMode: 'timestamp',
  };
}

function saveQueueSettingsToStorage(): void {
  localStorage.setItem(
    'queueSettings',
    JSON.stringify({
      queueReturnMethod: queueReturnMethod.value,
      autoSortQueue: autoSortQueue.value,
      queuePriorityMode: queuePriorityMode.value,
    }),
  );
}

function getUISettingsFromStorage(): {
  sortBy: 'matchesPlayed' | 'rating' | 'winRate' | 'wins' | 'losses' | 'name';
  matchType: 'singles' | 'doubles';
  matchesFilterBy: 'all' | number;
} {
  const settings = localStorage.getItem('uiSettings');
  if (settings) {
    const parsed = JSON.parse(settings);
    return {
      sortBy:
        (parsed.sortBy === 'gamesPlayed' ? 'matchesPlayed' : parsed.sortBy) ||
        'matchesPlayed',
      matchType: parsed.matchType || 'doubles',
      matchesFilterBy: parsed.matchesFilterBy || 'all',
    };
  }
  return {
    sortBy: 'matchesPlayed',
    matchType: 'doubles',
    matchesFilterBy: 'all',
  };
}

function saveUISettingsToStorage(): void {
  localStorage.setItem(
    'uiSettings',
    JSON.stringify({
      sortBy: sortBy.value,
      matchType: matchType.value,
      matchesFilterBy: matchesFilterBy.value,
    }),
  );
}

// Watch for changes in court settings and save to storage
watch(availableCourts, () => {
  saveCourtSettingsToStorage();
  syncStateToLikha();
});

watch(autoAdvanceMatches, () => {
  saveCourtSettingsToStorage();
  syncStateToLikha();
});

// Watch for changes in queue settings and save to storage
watch(queueReturnMethod, () => {
  saveQueueSettingsToStorage();
  syncStateToLikha();
});

watch(autoSortQueue, () => {
  saveQueueSettingsToStorage();
  syncStateToLikha();
});

watch(queuePriorityMode, () => {
  saveQueueSettingsToStorage();
  syncStateToLikha();
});

watch([likhaUrl, likhaToken, likhaClubId, likhaClubUUID], () => {
  saveLikhaSettingsToStorage();
});

watch(likhaClubUUID, (newVal) => {
  if (newVal) {
    const selected = clubOptions.value.find((c) => c.value === newVal);
    if (selected && selected.clubIdString) {
      likhaClubId.value = selected.clubIdString;
    }
    fetchLikhaAppState();
  } else {
    likhaClubId.value = '';
  }
});

// Watch for changes in UI settings and save to storage
watch(sortBy, () => {
  saveUISettingsToStorage();
  syncStateToLikha();
});

watch(matchType, () => {
  saveUISettingsToStorage();
  syncStateToLikha();
});

watch(matchesFilterBy, () => {
  saveUISettingsToStorage();
  syncStateToLikha();
});

const syncStateToLikha = debounce(async () => {
  if (!likhaUrl.value || !likhaToken.value || !likhaClubId.value) return;

  const payload = {
    matchmaking: MatchmakingApp.state,
    courtSettings: {
      availableCourts: getCourtCount(),
      autoAdvanceMatches: autoAdvanceMatches.value,
    },
    queueSettings: {
      queueReturnMethod: queueReturnMethod.value,
      autoSortQueue: autoSortQueue.value,
      queuePriorityMode: queuePriorityMode.value,
    },
    uiSettings: {
      sortBy: sortBy.value,
      matchType: matchType.value,
    },
  };

  const url = likhaUrl.value.endsWith('/')
    ? likhaUrl.value.slice(0, -1)
    : likhaUrl.value;
  try {
    const isId = likhaClubUUID.value
      ? true
      : /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
          likhaClubId.value,
        );
    const targetId = likhaClubUUID.value || likhaClubId.value;
    const endpoint = isId
      ? `${url}/items/club/${targetId}`
      : `${url}/items/club?filter[clubId][_eq]=${likhaClubId.value}`;

    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${likhaToken.value}`,
      },
      body: JSON.stringify({ appState: payload }),
    });
    if (!response.ok) {
      const data = await response.json();
      console.error('Likha sync failed', data);
    } else {
      console.log('Successfully synced state to Likha club');
    }
  } catch (err) {
    console.error('Failed to sync state to Likha', err);
  }
}, 2000);

MatchmakingApp.onStateChange = syncStateToLikha;

watch(
  () => [
    MatchmakingApp.state,
    availableCourts.value,
    autoAdvanceMatches.value,
    queueReturnMethod.value,
    autoSortQueue.value,
    queuePriorityMode.value,
    sortBy.value,
    matchType.value,
    likhaClubId.value,
  ],
  () => {
    syncStateToLikha();
  },
  { deep: true },
);

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
const addNewPlayer = () => {
  if (!newPlayerName.value?.trim() || newPlayerLevel.value === null) return;
  const trimmedName = newPlayerName.value.trim();
  MatchmakingApp.checkInPlayer(trimmedName, newPlayerLevel.value);
  newPlayerName.value = null;
  newPlayerLevel.value = null;
  showAddPlayerDialog.value = false;
  $q.notify({
    type: 'positive',
    message: `Player "${trimmedName}" added successfully`,
    position: 'top',
  });
};
const addBulkPlayers = () => {
  const newPlayers: Player[] = [];
  const duplicateNames: string[] = [];
  const invalidNames: string[] = [];

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

    MatchmakingApp.checkInPlayer(trimmedName, bulkPlayer.level as 1 | 2 | 3);
  }

  // Add valid players
  if (bulkPlayers.value.length > 0) {
    $q.notify({
      type: 'positive',
      message: `Successfully imported ${newPlayers.length} player${newPlayers.length > 1 ? 's' : ''}`,
      position: 'top',
    });
  }

  // Show warnings for duplicates and invalid names
  if (duplicateNames.length > 0) {
    $q.notify({
      type: 'warning',
      message: `Skipped ${duplicateNames.length} duplicate player${duplicateNames.length > 1 ? 's' : ''}: ${duplicateNames.join(', ')}`,
      position: 'top',
      timeout: 5000,
    });
  }

  if (invalidNames.length > 0) {
    $q.notify({
      type: 'warning',
      message: `Skipped ${invalidNames.length} invalid name${invalidNames.length > 1 ? 's' : ''}: ${invalidNames.join(', ')}`,
      position: 'top',
      timeout: 5000,
    });
  }

  // Reset form and close dialog
  bulkImportMode.value = false;
  bulkPlayerText.value = '';
  bulkPlayers.value = [];
  bulkDefaultLevel.value = 2;
  showAddPlayerDialog.value = false;
};

const generateNewMatches = () => {
  MatchmakingApp.state.teamSize = matchType.value === 'singles' ? 1 : 2;
  MatchmakingApp.draftNextMatches(queuePriorityMode.value);

  if (autoAdvanceMatches.value) {
    const courtCount = getCourtCount();
    for (let c = 1; c <= courtCount; c++) {
      if (isCourtAvailable(c)) {
        autoAdvanceNextMatchForCourt(c);
      }
    }
  }

  MatchmakingApp.persist();

  $q.notify({
    type: 'positive',
    message: 'Matches generated!',
    position: 'top',
  });
};

const openMatchResultDialog = (index: number) => {
  currentMatchIndex.value = index;
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
    $q.notify({
      type: 'warning',
      message: 'Ties are not allowed.',
      position: 'top',
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

  MatchmakingApp.persist();

  showMatchResultDialog.value = false;
  currentMatchIndex.value = -1;
  teamAScore.value = 0;
  teamBScore.value = 0;

  $q.notify({
    type: 'positive',
    message: 'Match completed! Stats updated.',
    position: 'top',
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
      }

      // Save the changes
      MatchmakingApp.persist();

      // Notify user about auto-advance
      $q.notify({
        type: 'info',
        message: `Match started on Court ${courtNumber}`,
        position: 'top',
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
  delete MatchmakingApp.state.players[username];
  MatchmakingApp.removeFromQueue(username);
  MatchmakingApp.persist();
  $q.notify({
    type: 'info',
    message: `Player "${username}" removed`,
    position: 'top',
  });
};

const removeFromQueue = (username: string) => {
  MatchmakingApp.removeFromQueue(username);
  $q.notify({
    type: 'info',
    message: `Player "${username}" removed from queue`,
    position: 'top',
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
    // Reset player stats
    Object.values(MatchmakingApp.state.players).forEach((player) => {
      player.matchesPlayed = 0;
      player.wins = 0;
      player.losses = 0;
      player.rating = 1500;
    });

    // Save data
    MatchmakingApp.persist();

    $q.notify({
      type: 'positive',
      message: 'All player stats have been reset',
      position: 'top',
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
    // Clear all matches
    MatchmakingApp.state.activeMatches = [];
    MatchmakingApp.persist();

    // Save data

    $q.notify({
      type: 'positive',
      message: 'All matches have been cleared',
      position: 'top',
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

    // Save data

    $q.notify({
      type: 'positive',
      message: 'Queue has been cleared',
      position: 'top',
    });
  });
};

const requeuePlayer = (username: string) => {
  const p = players.value.find((p) => p.username === username);
  if (p) MatchmakingApp.checkInPlayer(p.username, p.level);
  $q.notify({
    type: 'positive',
    message: `Player "${name}" added to queue`,
    position: 'top',
  });
};

const addAllPlayersToQueue = () => {
  players.value.forEach((p) =>
    MatchmakingApp.checkInPlayer(p.username, p.level),
  );
  $q.notify({
    type: 'positive',
    message: 'Added all players to queue',
    position: 'top',
  });
};

// Enhanced queue return functions

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
    $q.notify({
      type: 'warning',
      message: 'All data has been reset',
      position: 'top',
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
      $q.notify({
        type: 'warning',
        message: `You can only select ${maxPlayers} players`,
        position: 'top',
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
    $q.notify({
      type: 'warning',
      message: 'Please select at least 2 players',
      position: 'top',
    });
    return;
  }

  if (playerCount > 4) {
    $q.notify({
      type: 'warning',
      message: 'Maximum 4 players allowed for tennis matches',
      position: 'top',
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
    $q.notify({
      type: 'warning',
      message: 'Each team must have exactly 2 players',
      position: 'top'
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

  $q.notify({
    type: 'positive',
    message: 'Manual match created successfully!',
    position: 'top'
  });
};
*/

const proceedToCourtSelection = () => {
  if (selectedPlayers.value.length !== 2) {
    $q.notify({
      type: 'warning',
      message: 'Please select exactly 2 players',
      position: 'top',
    });
    return;
  }
  manualSelectionStep.value = 3;
};

const proceedToCourtSelectionFromTeams = () => {
  if (manualTeam1.value.length !== 2 || manualTeam2.value.length !== 2) {
    $q.notify({
      type: 'warning',
      message: 'Please arrange both teams properly',
      position: 'top',
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

  const assignedCourt = selectedCourt.value || undefined;
  const isCourtEmpty =
    !assignedCourt ||
    !matches.value.some(
      (m) => m.court === assignedCourt && m.status === 'in-progress',
    );

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
  });

  matchPlayers.forEach((p) => MatchmakingApp.removeFromQueue(p.username));
  MatchmakingApp.persist();

  showManualSelectionDialog.value = false;
  selectedPlayers.value = [];
  manualTeam1.value = [];
  manualTeam2.value = [];
  selectedCourt.value = null;
  manualSelectionStep.value = 1;

  $q.notify({
    type: 'positive',
    message: `Manual match created successfully${isCourtEmpty && assignedCourt ? ` on Court ${assignedCourt}` : ''}!`,
    position: 'top',
  });
};

/*
const createSinglesManualMatch = () => {
  if (selectedPlayers.value.length !== 2) {
    $q.notify({
      type: 'warning',
      message: 'Please select exactly 2 players',
      position: 'top'
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

  $q.notify({
    type: 'positive',
    message: 'Singles match created successfully!',
    position: 'top'
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
    $q.notify({
      type: 'negative',
      message: 'Match not found',
      position: 'top',
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
        saveQueueSettingsToStorage();
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

      // Return players to queue
      const playerUsernames = [...actualMatch.teamA, ...actualMatch.teamB];
      for (const username of playerUsernames) {
        MatchmakingApp.state.queues.push({
          username,
          queueType:
            (actualMatch.queueSource === 'MANUAL'
              ? 'GENERAL'
              : actualMatch.queueSource) || 'GENERAL',
          enteredAt: enteredAt,
        });
      }

      // Store court number before removing match
      const courtNumber = actualMatch.court;

      // Remove match FROM REAL STATE
      MatchmakingApp.state.activeMatches =
        MatchmakingApp.state.activeMatches.filter(
          (am) => am.matchId !== actualMatch.matchId,
        );

      // Auto-advance next match for this specific court
      if (courtNumber) {
        autoAdvanceNextMatchForCourt(courtNumber);
      }

      MatchmakingApp.persist();

      $q.notify({
        type: 'positive',
        message: 'Match cancelled and players returned to queue',
        position: 'top',
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
    }

    // Count matches for this court to show load balancing info
    const courtMatchCount = matches.value.filter(
      (m) => m.court === court,
    ).length;

    $q.notify({
      type: 'positive',
      message: `Assigned to Court ${court} (${courtMatchCount} total matches)`,
      position: 'top',
    });
  } else {
    $q.notify({
      type: 'negative',
      message: 'No available courts',
      position: 'top',
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
    $q.notify({
      type: 'negative',
      message: 'Cannot start this match',
      position: 'top',
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
  }

  // Check if court is available
  if (!isCourtAvailable(actualMatch.court)) {
    $q.notify({
      type: 'negative',
      message: `Court ${actualMatch.court} is currently in use`,
      position: 'top',
    });
    return;
  }

  // Start the match
  actualMatch.status = 'in-progress';
  actualMatch.createdAt = Date.now();

  // Save data
  MatchmakingApp.persist();

  $q.notify({
    type: 'positive',
    message: `Match started on Court ${match.court}`,
    position: 'top',
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
        }
      }

      $q.notify({
        type: 'positive',
        message: `Matches swapped! Match moved to Court ${courtNumber}`,
        position: 'top',
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
    }

    // Don't auto-start the match; it will start via auto-advance or manual start button
    // Just assign the court and leave status as is
    MatchmakingApp.persist();

    $q.notify({
      type: 'positive',
      message: `Assigned to Court ${courtNumber}`,
      position: 'top',
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
    $q.notify({
      type: 'negative',
      message: 'Match not found',
      position: 'top',
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
      });
    }
  });

  // Update the match teams in MatchmakingApp state
  actualMatch.teamA = newTeamA;
  actualMatch.teamB = newTeamB;

  // Save data
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

  $q.notify({
    type: 'positive',
    message: message,
    position: 'top',
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

    $q.notify({
      type: 'info',
      message: `Removed ${player.username} from match`,
      position: 'top',
      timeout: 2000,
    });
  }
};

const addPlayerToEdit = (player: Player) => {
  // Allow adding players up to 4 (maximum for doubles)
  const maxPlayers = 4;
  if (selectedPlayers.value.length < maxPlayers) {
    selectedPlayers.value.push(player);

    $q.notify({
      type: 'positive',
      message: `Added ${player.username} to match`,
      position: 'top',
      timeout: 2000,
    });
  }
};

const replacePlayerInEdit = (playerToReplace: Player) => {
  if (availableQueuePlayers.value.length === 0) {
    $q.notify({
      type: 'warning',
      message: 'No players available in queue to replace with',
      position: 'top',
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

    $q.notify({
      type: 'positive',
      message: `Replaced ${playerToReplaceInEdit.value.username} with ${replacementPlayer.username}`,
      position: 'top',
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
    $q.notify({
      type: 'negative',
      message: `Player "${trimmedName}" already exists`,
      position: 'top',
    });
    return;
  }

  // Update in MatchmakingApp state directly
  const playerState = MatchmakingApp.state.players[originalName];
  if (!playerState) {
    $q.notify({
      type: 'negative',
      message: 'Player not found',
      position: 'top',
    });
    return;
  }

  if (originalName !== trimmedName) {
    MatchmakingApp.state.players[trimmedName] = {
      ...playerState,
      username: trimmedName,
      level: newLevel,
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
  } else {
    playerState.level = newLevel;
  }

  MatchmakingApp.persist();

  $q.notify({
    type: 'positive',
    message: `Player updated to "${trimmedName}" (Level ${newLevel})`,
    position: 'top',
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

  // Players card: q-list with viewport-based fixed height
  .players-card .q-list {
    flex: 0 0 auto; // Don't grow, use fixed height
    max-height: calc(100vh - 380px); // Fixed height based on viewport
    overflow-y: auto; // Scroll when content exceeds height

    // Always visible scrollbar
    scrollbar-width: auto;
    -ms-overflow-style: auto;

    &::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }

    &::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.05);
      border-radius: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      transition: background 0.2s ease;

      &:hover {
        background: rgba(0, 0, 0, 0.5);
      }
    }
  }

  // Queue card: PlayerList with viewport-based fixed height (accounting for bottom controls)
  .queue-card .player-list {
    flex: 0 0 auto; // Don't grow, use fixed height
    max-height: calc(
      100vh - 480px
    ); // Fixed height leaving space for header + bottom controls
    overflow-y: auto; // Scroll when content exceeds height

    // Always visible scrollbar
    scrollbar-width: auto;
    -ms-overflow-style: auto;

    &::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }

    &::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.05);
      border-radius: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      transition: background 0.2s ease;

      &:hover {
        background: rgba(0, 0, 0, 0.5);
      }
    }
  }

  // Matches card: q-list with viewport-based fixed height
  .matches-card .q-list {
    flex: 0 0 auto; // Don't grow, use fixed height
    max-height: calc(100vh - 280px); // Fixed height based on viewport
    overflow-y: auto; // Scroll when content exceeds height

    // Always visible scrollbar
    scrollbar-width: auto;
    -ms-overflow-style: auto;

    &::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }

    &::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.05);
      border-radius: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      transition: background 0.2s ease;

      &:hover {
        background: rgba(0, 0, 0, 0.5);
      }
    }
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

  &::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    transition: background 0.2s ease;

    &:hover {
      background: rgba(0, 0, 0, 0.5);
    }
  }
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

  // Queue tab specific: reduce player list height to show bottom buttons
  .queue-card .mobile-card-content {
    // Leave more space for bottom controls (~240px) plus some padding
    max-height: calc(100vh - 396px);
  }

  // Players and Matches tabs can use full height (no bottom controls)
  .players-card .mobile-card-content,
  .matches-card .mobile-card-content {
    max-height: calc(100vh - 220px);
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

  // Queue tab: even smaller height for very small screens
  .queue-card .mobile-card-content {
    max-height: calc(100vh - 340px);
    min-height: 280px;
  }

  // Players and Matches tabs
  .players-card .mobile-card-content,
  .matches-card .mobile-card-content {
    max-height: calc(100vh - 220px);
    min-height: 320px;
  }
}
</style>
