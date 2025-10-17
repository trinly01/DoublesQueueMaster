<template>
  <q-page class="doubles-queue-page">
    <!-- Header Section -->
    <div class="header-section">
      <div class="container">
        <div class="row items-center justify-between">
          <div class="col">
            <h1 class="text-h5 text-weight-bold text-white q-mb-xs">
              🏓 Queue Master
            </h1>
            <p class="text-caption text-grey-1 q-ma-none">
              Smart matchmaking for singles & doubles
            </p>
          </div>
          <div class="col-auto">
            <q-btn color="white" icon="settings" label="Settings" @click="showSettingsDialog = true" flat size="sm">
              <q-tooltip>Open settings and preferences</q-tooltip>
            </q-btn>
          </div>
        </div>
      </div>
    </div>

    <div class="container q-pa-md">
      <div class="row q-col-gutter-lg">
        <!-- Left Column: Players List -->
        <div class="col-12 col-md-4">
          <q-card class="players-card" flat bordered>
            <q-card-section class="players-header text-white">
              <div class="row items-center justify-between">
                <div class="text-h6">
                  <q-icon name="people" class="q-mr-sm" />
                  Players ({{ players.length }})
                </div>
                <div class="row items-center q-gutter-xs">
                  <q-select v-model="sortBy" :options="sortOptions" dense outlined dark color="white"
                    class="sort-select" style="min-width: 120px;" emit-value map-options>
                    <template v-slot:prepend>
                      <q-icon name="sort" />
                    </template>
                  </q-select>
                  <q-btn color="white" @click="showAddPlayerDialog = true" icon="person_add" flat round dense>
                    <q-tooltip>Add new player to the system</q-tooltip>
                  </q-btn>
                </div>
              </div>
            </q-card-section>
            <q-card-section class="q-pa-none">
              <div class="card-content">
                <q-list separator v-if="players.length > 0">
                  <q-item v-for="player in sortedPlayers" :key="player.name" class="player-item">
                    <q-item-section>
                      <q-item-label class="text-weight-medium">{{ player.name }}</q-item-label>
                      <q-item-label caption class="q-pl-xs">
                        <q-chip :label="`Level ${player.level}`" :color="getLevelColor(player.level)" text-color="white"
                          size="sm" dense />
                        <span class="q-ml-sm text-grey-7">Games: {{ player.gamesPlayed }}</span>
                        <span class="q-ml-sm text-positive">W: {{ player.wins }}</span>
                        <span class="q-ml-sm text-negative">L: {{ player.losses }}</span>
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <div class="row items-center q-gutter-xs">
                        <q-btn flat round color="negative" @click="removePlayer(player.name)" icon="delete" size="sm" />
                        <q-btn flat color="accent" @click="requeuePlayer(player.name)" icon="input" size="sm"
                          :disable="queue.some(p => p.name === player.name)" />
                      </div>
                    </q-item-section>
                  </q-item>
                </q-list>
                <div v-else class="empty-state">
                  <q-icon name="people" size="48px" color="grey-4" />
                  <p class="text-grey-6 q-mt-sm">No players added yet</p>
                  <p class="text-caption text-grey-5">Click the + button to add your first player</p>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Center Column: Queue -->
        <div class="col-12 col-md-4">
          <q-card class="queue-card" flat bordered>
            <q-card-section class="queue-header text-white">
              <div class="row items-center justify-between">
                <div class="text-h6">
                  <q-icon name="queue" class="q-mr-sm" />
                  Players Queue ({{ queue.length }})
                </div>
                <div class="queue-stats">
                  <q-chip :label="`L1: ${queueStats.level1}`" color="green-6" text-color="white" size="sm" />
                  <q-chip :label="`L2: ${queueStats.level2}`" color="orange-7" text-color="white" size="sm" />
                  <q-chip :label="`L3: ${queueStats.level3}`" color="red-8" text-color="white" size="sm" />
                </div>
              </div>
            </q-card-section>
            <q-card-section class="q-pa-none">
              <div class="card-content">
                <q-list separator v-if="queue.length > 0">
                  <q-item v-for="(player, index) in queue" :key="player.name" class="queue-item">
                    <q-item-section avatar>
                      <q-avatar :color="getQueuePositionColor(player)" text-color="white" size="md">
                        {{ index + 1 }}
                        <q-tooltip>
                          Position: {{ index + 1 }}
                          <br>Games: {{ player.gamesPlayed }}
                          <br>Priority: {{ player.priority || 'normal' }}
                        </q-tooltip>
                      </q-avatar>
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-weight-medium">
                        {{ player.name }}
                        <q-chip v-if="player.priority === 'high' || player.priority === 'returned'" label="Returned"
                          color="orange" text-color="white" size="xs" dense />
                      </q-item-label>
                      <q-item-label caption class="q-pl-xs">
                        <q-chip :label="`Level ${player.level}`" :color="getLevelColor(player.level)" text-color="white"
                          size="xs" dense />
                        <span class="q-ml-sm">{{ player.gamesPlayed }} games</span>
                        <span class="q-ml-sm text-grey-6">
                          {{ getQueueTimeInfo(player) }}
                        </span>
                        <q-chip v-if="player.priority === 'returned'" label="Returned from match" color="orange"
                          text-color="white" size="xs" dense class="q-ml-sm" />
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <q-btn flat round color="negative" @click="removeFromQueue(player.name)" icon="remove_circle"
                        size="sm" />
                    </q-item-section>
                  </q-item>
                </q-list>
                <div v-else class="empty-state">
                  <q-icon name="queue" size="48px" color="grey-4" />
                  <p class="text-grey-6 q-mt-sm">Queue is empty</p>
                  <p class="text-caption text-grey-5">Add players to start generating matches</p>
                </div>
              </div>
            </q-card-section>
            <q-card-section>
              <!-- Match Type Selector -->
              <div class="q-mb-md">
                <div class="text-caption text-grey-7 q-mb-xs">Match Type</div>
                <q-select v-model="matchType" :options="matchTypeOptions" dense outlined emit-value map-options
                  color="accent">
                  <template v-slot:prepend>
                    <q-icon :name="matchType === 'singles' ? 'person' : 'people'" />
                  </template>
                </q-select>
              </div>

              <div class="row q-gutter-sm">
                <q-btn class="col" color="accent" @click="generateNewMatches" size="md" icon="auto_awesome"
                  :disable="!canGenerateMatches()">
                  <span class="gt-xs">Auto Generate</span>
                  <span class="lt-sm">Auto</span>
                  <q-tooltip v-if="!canGenerateMatches()">
                    {{ matchType === 'singles' ? 'Need at least 2 players' : 'Need at least 4 players' }}
                  </q-tooltip>
                </q-btn>
                <q-btn class="col" color="accent" @click="startManualSelection" size="md" icon="touch_app"
                  :disable="queue.length < (matchType === 'singles' ? 2 : 4)" outline>
                  <span class="gt-xs">Manual Selection</span>
                  <span class="lt-sm">Manual</span>
                  <q-tooltip v-if="queue.length < (matchType === 'singles' ? 2 : 4)">
                    {{
                      matchType === 'singles' ?
                        'Need at least 2 players for manual singles selection' :
                        'Need at least 4 players for manual doubles selection'
                    }}
                  </q-tooltip>
                </q-btn>
              </div>
              <div class="text-caption text-grey-6 q-mt-sm text-center">
                {{ getMatchGenerationHint() }}
              </div>

              <!-- Waiting Players Info -->
              <div v-if="queue.length > 0 && queue.length % (matchType === 'singles' ? 2 : 4) !== 0" class="q-mt-md">
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
            <q-card-section class="matches-header text-white">
              <div class="text-h6">
                <q-icon name="sports_tennis" class="q-mr-sm" />
                Matches ({{ matches.length }})
              </div>
            </q-card-section>
            <q-card-section class="q-pa-none">
              <div class="card-content">
                <q-list separator v-if="matches.length > 0">
                  <q-item v-for="(match, index) in matches" :key="index" class="match-item">
                    <q-item-section>
                      <!-- Singles Match (2 players) -->
                      <div v-if="match.length === 2" class="match-teams">
                        <div class="team team-1">
                          <q-chip :color="getLevelColor(match[0].level)" text-color="white" size="sm" dense
                            class="match-player-chip">
                            {{ match[0].name }}
                            <q-tooltip>Level {{ match[0].level }}</q-tooltip>
                          </q-chip>
                        </div>

                        <!-- VS -->
                        <div class="vs-divider">
                          <q-icon name="sports_tennis" color="grey-6" size="sm" />
                        </div>

                        <div class="team team-2">
                          <q-chip :color="getLevelColor(match[1].level)" text-color="white" size="sm" dense
                            class="match-player-chip">
                            {{ match[1].name }}
                            <q-tooltip>Level {{ match[1].level }}</q-tooltip>
                          </q-chip>
                        </div>
                      </div>

                      <!-- Doubles Match (4 players) -->
                      <div v-else class="match-teams">
                        <!-- Team 1 -->
                        <div class="team team-1">
                          <q-chip :color="getLevelColor(match[0].level)" text-color="white" size="sm" dense
                            class="match-player-chip">
                            {{ match[0].name }}
                            <q-tooltip>Level {{ match[0].level }}</q-tooltip>
                          </q-chip>
                          <q-chip :color="getLevelColor(match[1].level)" text-color="white" size="sm" dense
                            class="match-player-chip">
                            {{ match[1].name }}
                            <q-tooltip>Level {{ match[1].level }}</q-tooltip>
                          </q-chip>
                        </div>

                        <!-- VS -->
                        <div class="vs-divider">
                          <q-icon name="sports_tennis" color="grey-6" size="sm" />
                        </div>

                        <!-- Team 2 -->
                        <div class="team team-2">
                          <q-chip :color="getLevelColor(match[2].level)" text-color="white" size="sm" dense
                            class="match-player-chip">
                            {{ match[2].name }}
                            <q-tooltip>Level {{ match[2].level }}</q-tooltip>
                          </q-chip>
                          <q-chip :color="getLevelColor(match[3].level)" text-color="white" size="sm" dense
                            class="match-player-chip">
                            {{ match[3].name }}
                            <q-tooltip>Level {{ match[3].level }}</q-tooltip>
                          </q-chip>
                        </div>
                      </div>
                    </q-item-section>
                    <q-item-section side>
                      <q-btn color="grey-7" icon="more_vert" flat round size="sm">
                        <q-menu>
                          <q-list style="min-width: 150px">
                            <q-item clickable @click="openMatchResultDialog(index)">
                              <q-item-section avatar>
                                <q-icon name="emoji_events" />
                              </q-item-section>
                              <q-item-section>Complete Match</q-item-section>
                            </q-item>

                            <q-item clickable @click="editMatch(index)">
                              <q-item-section avatar>
                                <q-icon name="edit" />
                              </q-item-section>
                              <q-item-section>Edit Match</q-item-section>
                            </q-item>

                            <q-separator />

                            <q-item clickable @click="cancelMatch(index)" class="text-negative">
                              <q-item-section avatar>
                                <q-icon name="cancel" />
                              </q-item-section>
                              <q-item-section>Cancel Match</q-item-section>
                            </q-item>
                          </q-list>
                        </q-menu>
                      </q-btn>
                    </q-item-section>
                  </q-item>
                </q-list>
                <div v-else class="empty-state">
                  <q-icon name="sports_tennis" size="48px" color="grey-4" />
                  <p class="text-grey-6 q-mt-sm">No active matches</p>
                  <p class="text-caption text-grey-5">Generate matches from the queue to get started</p>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </div>

    <!-- Add Player Dialog -->
    <q-dialog v-model="showAddPlayerDialog" :maximized="$q.screen.lt.md">
      <q-layout view="Lhh lpR fff" container class="bg-white" style="max-width: 800px; width: 95vw; max-height: 90vh;">
        <q-header class="players-header text-white" reveal>
          <q-toolbar>
            <q-toolbar-title>
              <q-icon name="person_add" class="q-mr-sm" />
              Add New Player
            </q-toolbar-title>
            <q-btn icon="close" flat round dense v-close-popup />
          </q-toolbar>
        </q-header>

        <q-page-container>
          <q-page padding>
            <div class="q-gutter-y-md">
              <q-input v-model="newPlayerName" label="Player Name" type="text" @keyup.enter="addNewPlayer"
                :rules="[val => !!val?.trim() || 'Player name is required']" outlined dense autofocus>
                <template v-slot:prepend>
                  <q-icon name="person" />
                </template>
              </q-input>

              <q-select v-model="newPlayerLevel" :options="levelOptions" label="Player Level"
                :rules="[val => val !== null || 'Player level is required']" outlined dense emit-value map-options>
                <template v-slot:prepend>
                  <q-icon name="star" />
                </template>
                <template v-slot:option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section avatar>
                      <q-icon :name="getLevelIcon(scope.opt.value)" :color="getLevelColor(scope.opt.value)" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ scope.opt.label }}</q-item-label>
                      <q-item-label caption>{{ scope.opt.description }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>
          </q-page>
        </q-page-container>

        <q-footer class="bg-grey-1">
          <q-toolbar>
            <q-toolbar-title></q-toolbar-title>
            <div class="q-gutter-sm">
              <q-btn flat label="Cancel" color="grey" @click="showAddPlayerDialog = false">
                <q-tooltip>Cancel adding new player</q-tooltip>
              </q-btn>
              <q-btn color="accent" @click="addNewPlayer" label="Add Player"
                :disable="!newPlayerName?.trim() || newPlayerLevel === null" icon="add">
                <q-tooltip>Add this player to the system</q-tooltip>
              </q-btn>
            </div>
          </q-toolbar>
        </q-footer>
      </q-layout>
    </q-dialog>

    <!-- Match Result Dialog -->
    <q-dialog v-model="showMatchResultDialog" :maximized="$q.screen.lt.md">
      <q-layout view="Lhh lpR fff" container class="bg-white" style="max-width: 800px; width: 95vw; max-height: 90vh;">
        <q-header class="matches-header text-white" reveal>
          <q-toolbar>
            <q-toolbar-title>
              <q-icon name="emoji_events" class="q-mr-sm" />
              Match Result
            </q-toolbar-title>
            <q-btn icon="close" flat round dense v-close-popup />
          </q-toolbar>
        </q-header>

        <q-page-container>
          <q-page padding>
            <div class="q-gutter-y-md">
              <div class="text-subtitle1 text-center q-mb-md">Who won this match?</div>

              <!-- Singles Match Result -->
              <div v-if="currentMatch.length === 2" class="row q-col-gutter-md">
                <div class="col-6">
                  <q-card :class="selectedWinner === 'team1' ? 'winner-selected' : ''" @click="selectedWinner = 'team1'"
                    class="team-card cursor-pointer" flat bordered>
                    <q-card-section class="text-center">
                      <q-chip :label="currentMatch[0].name" :color="getLevelColor(currentMatch[0].level)"
                        text-color="white" size="md" />
                      <div class="text-caption q-mt-sm">Level {{ currentMatch[0].level }}</div>
                    </q-card-section>
                  </q-card>
                </div>

                <div class="col-6">
                  <q-card :class="selectedWinner === 'team2' ? 'winner-selected' : ''" @click="selectedWinner = 'team2'"
                    class="team-card cursor-pointer" flat bordered>
                    <q-card-section class="text-center">
                      <q-chip :label="currentMatch[1].name" :color="getLevelColor(currentMatch[1].level)"
                        text-color="white" size="md" />
                      <div class="text-caption q-mt-sm">Level {{ currentMatch[1].level }}</div>
                    </q-card-section>
                  </q-card>
                </div>
              </div>

              <!-- Doubles Match Result -->
              <div v-else class="row q-col-gutter-md">
                <!-- Team 1 -->
                <div class="col-6">
                  <q-card :class="selectedWinner === 'team1' ? 'winner-selected' : ''" @click="selectedWinner = 'team1'"
                    class="team-card cursor-pointer" flat bordered>
                    <q-card-section class="text-center">
                      <div class="text-weight-medium q-mb-sm">Team 1</div>
                      <q-chip :label="currentMatch[0].name" :color="getLevelColor(currentMatch[0].level)"
                        text-color="white" size="sm" dense />
                      <q-chip :label="currentMatch[1].name" :color="getLevelColor(currentMatch[1].level)"
                        text-color="white" size="sm" dense />
                    </q-card-section>
                  </q-card>
                </div>

                <!-- Team 2 -->
                <div class="col-6">
                  <q-card :class="selectedWinner === 'team2' ? 'winner-selected' : ''" @click="selectedWinner = 'team2'"
                    class="team-card cursor-pointer" flat bordered>
                    <q-card-section class="text-center">
                      <div class="text-weight-medium q-mb-sm">Team 2</div>
                      <q-chip :label="currentMatch[2].name" :color="getLevelColor(currentMatch[2].level)"
                        text-color="white" size="sm" dense />
                      <q-chip :label="currentMatch[3].name" :color="getLevelColor(currentMatch[3].level)"
                        text-color="white" size="sm" dense />
                    </q-card-section>
                  </q-card>
                </div>
              </div>
            </div>
          </q-page>
        </q-page-container>

        <q-footer class="bg-grey-1">
          <q-toolbar>
            <q-toolbar-title></q-toolbar-title>
            <div class="q-gutter-sm">
              <q-btn flat label="Cancel" color="grey" @click="showMatchResultDialog = false" />
              <q-btn color="accent" @click="completeMatch" label="Complete Match" :disable="selectedWinner === null"
                icon="check" />
            </div>
          </q-toolbar>
        </q-footer>
      </q-layout>
    </q-dialog>

    <!-- Settings Dialog -->
    <q-dialog v-model="showSettingsDialog" :maximized="$q.screen.lt.md">
      <q-layout view="Lhh lpR fff" container class="bg-white" style="max-width: 800px; width: 95vw; max-height: 90vh;">
        <q-header class="queue-header text-white" reveal>
          <q-toolbar>
            <q-toolbar-title>
              <q-icon name="settings" class="q-mr-sm" />
              Settings
            </q-toolbar-title>
            <q-btn icon="close" flat round dense v-close-popup />
          </q-toolbar>
        </q-header>

        <q-page-container>
          <q-page padding>
            <div class="q-gutter-y-md">
              <div>
                <div class="text-subtitle2 q-mb-sm">Queue Management</div>
                <q-select v-model="queueReturnMethod" :options="queueReturnOptions"
                  label="Default method for returning players to queue" outlined dense />
              </div>

              <div>
                <q-toggle v-model="autoSortQueue" label="Automatically sort queue by fairness" color="accent" />
              </div>

              <q-separator />

              <div>
                <q-btn color="accent" @click="resetGamesPlayed" icon="refresh" label="Reset Games Played"
                  class="full-width" />
              </div>
              <div>
                <q-btn color="negative" @click="resetAllData" icon="delete_forever" label="Reset All Data"
                  class="full-width" />
              </div>
            </div>
          </q-page>
        </q-page-container>

        <q-footer class="bg-grey-1">
          <q-toolbar>
            <q-toolbar-title></q-toolbar-title>
            <div class="q-gutter-sm">
              <q-btn flat label="Close" color="grey" @click="showSettingsDialog = false" />
            </div>
          </q-toolbar>
        </q-footer>
      </q-layout>
    </q-dialog>

    <!-- Manual Match Selection Dialog -->
    <q-dialog v-model="showManualSelectionDialog" :maximized="$q.screen.lt.md" transition-show="slide-up"
      transition-hide="slide-down">
      <q-layout view="Lhh lpR fff" container class="bg-white" style="max-width: 700px; width: 95vw;">
        <q-header class="players-header text-white" reveal>
          <q-toolbar>
            <q-toolbar-title>
              <q-icon name="touch_app" class="q-mr-sm" />
              {{ matchType === 'singles' ? 'Singles' : 'Doubles' }} Match Selection
            </q-toolbar-title>
            <q-btn icon="close" flat round dense v-close-popup />
          </q-toolbar>
        </q-header>

        <q-page-container>
          <q-page padding>
            <div class="manual-selection-container">
              <!-- Step 1: Select Players -->
              <div v-if="manualSelectionStep === 1" class="selection-step">
                <div class="text-h6 q-mb-md">Step 1: Select {{ matchType === 'singles' ? '2' : '4' }} Players</div>
                <div class="text-caption text-grey-7 q-mb-md">
                  Click on players to select them for the match ({{ selectedPlayers.length }}/{{ matchType === 'singles'
                    ?
                    2 :
                    4 }} selected)
                </div>

                <q-list separator bordered class="rounded-borders">
                  <q-item v-for="player in queue" :key="player.name" clickable @click="togglePlayerSelection(player)"
                    :class="{ 'selected-player': isPlayerSelected(player) }" class="player-selection-item">
                    <q-item-section avatar>
                      <q-checkbox :model-value="isPlayerSelected(player)" color="accent"
                        @click.stop="togglePlayerSelection(player)" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-weight-medium">{{ player.name }}</q-item-label>
                      <q-item-label caption class="q-pl-xs">
                        <q-chip :label="`Level ${player.level}`" :color="getLevelColor(player.level)" text-color="white"
                          size="sm" dense />
                        <span class="q-ml-sm text-grey-7">Games: {{ player.gamesPlayed }}</span>
                        <span class="q-ml-sm text-positive">W: {{ player.wins }}</span>
                        <span class="q-ml-sm text-negative">L: {{ player.losses }}</span>
                      </q-item-label>
                    </q-item-section>
                  </q-item>
                </q-list>

              </div>

              <!-- Step 2: Arrange Teams -->
              <div v-if="manualSelectionStep === 2" class="arrangement-step">
                <div class="text-h6 q-mb-md">Step 2: Arrange Teams</div>

                <TeamArrangement v-model:team1="manualTeam1" v-model:team2="manualTeam2"
                  :create-balanced-match="createBalancedMatch" />

              </div>
            </div>
          </q-page>
        </q-page-container>

        <!-- Footer Actions -->
        <q-footer class="bg-grey-1">
          <q-toolbar>
            <q-toolbar-title></q-toolbar-title>
            <div class="q-gutter-sm">
              <!-- Step 1 Actions -->
              <template v-if="manualSelectionStep === 1">
                <q-btn flat label="Cancel" color="grey" @click="cancelManualSelection" />
                <q-btn v-if="matchType === 'doubles'" color="accent" label="Next: Arrange Teams"
                  icon-right="arrow_forward" @click="proceedToTeamArrangement"
                  :disable="selectedPlayers.length !== 4" />
                <q-btn v-else color="accent" label="Create Match" icon="check" @click="createSinglesManualMatch"
                  :disable="selectedPlayers.length !== 2" />
              </template>

              <!-- Step 2 Actions (Team Arrangement) -->
              <template v-else-if="manualSelectionStep === 2">
                <q-btn flat label="Back" icon="arrow_back" color="grey"
                  @click="() => { manualSelectionStep = 1; selectedForSwap = null; selectedForSwapTeam = null; }" />
                <q-btn flat label="Cancel" color="grey" @click="cancelManualSelection" />
                <q-btn color="accent" label="Create Match" icon="check" @click="createManualMatch"
                  :disable="manualTeam1.length !== 2 || manualTeam2.length !== 2" />
              </template>
            </div>
          </q-toolbar>
        </q-footer>
      </q-layout>
    </q-dialog>

    <!-- Match Edit Dialog -->
    <q-dialog v-model="showMatchEditDialog" :maximized="$q.screen.lt.md">
      <q-layout view="Lhh lpR fff" container class="bg-white" style="max-width: 800px; width: 95vw; max-height: 90vh;">
        <q-header class="matches-header text-white" reveal>
          <q-toolbar>
            <q-toolbar-title>
              <q-icon name="edit" class="q-mr-sm" />
              Edit Match
            </q-toolbar-title>
            <q-btn icon="close" flat round dense v-close-popup />
          </q-toolbar>
        </q-header>

        <q-page-container>
          <q-page padding>
            <!-- Step 1: Player Management -->
            <div v-if="manualSelectionStep === 1">
              <div class="text-h6 q-mb-md">
                Step 1: Manage Players
                <q-chip :label="currentMatchType === 'singles' ? 'Singles Match' : 'Doubles Match'"
                  :color="currentMatchType === 'singles' ? 'blue' : 'green'" text-color="white" size="sm"
                  class="q-ml-sm" />
              </div>

              <!-- Current Players -->
              <div class="q-mb-lg">
                <div class="text-subtitle2 q-mb-sm">
                  Current Players ({{ selectedPlayers.length }})
                  <q-chip v-if="selectedPlayers.length < 2" color="orange" text-color="white" size="sm" class="q-ml-sm">
                    Need at least 2 players
                  </q-chip>
                </div>
                <q-list bordered separator>
                  <q-item v-for="player in selectedPlayers" :key="player.name" class="player-edit-item">
                    <q-item-section>
                      <q-item-label class="text-weight-medium">{{ player.name }}</q-item-label>
                      <q-item-label caption class="q-pl-xs">
                        <q-chip :label="`Level ${player.level}`" :color="getLevelColor(player.level)" text-color="white"
                          size="xs" dense />
                        <span class="q-ml-sm text-grey-7">Games: {{ player.gamesPlayed }}</span>
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <div class="row items-center q-gutter-xs">
                        <q-btn flat round color="negative" icon="remove_circle" size="sm"
                          @click="removePlayerFromEdit(player)" :disable="selectedPlayers.length <= 1">
                          <q-tooltip>Remove from match</q-tooltip>
                        </q-btn>
                        <q-btn flat round color="accent" icon="swap_horiz" size="sm"
                          @click="replacePlayerInEdit(player)" :disable="availableQueuePlayers.length === 0">
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
                  <q-chip :label="`${availableQueuePlayers.length} available`" color="grey-5" text-color="white"
                    size="sm" class="q-ml-sm" />
                </div>
                <q-list bordered separator>
                  <q-item v-for="player in availableQueuePlayers" :key="player.name" clickable class="player-edit-item"
                    @click="addPlayerToEdit(player)" :disable="selectedPlayers.length >= 4">
                    <q-item-section>
                      <q-item-label class="text-weight-medium">{{ player.name }}</q-item-label>
                      <q-item-label caption class="q-pl-xs">
                        <q-chip :label="`Level ${player.level}`" :color="getLevelColor(player.level)" text-color="white"
                          size="xs" dense />
                        <span class="q-ml-sm text-grey-7">Games: {{ player.gamesPlayed }}</span>
                        <span v-if="player.priority === 'returned'" class="q-ml-sm text-orange">(Returned)</span>
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <q-btn flat round color="accent" icon="add_circle" size="sm"
                        :disable="selectedPlayers.length >= 4">
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
            <div v-if="manualSelectionStep === 2 && currentMatchType === 'doubles'">
              <div class="text-h6 q-mb-md">Step 2: Arrange Teams</div>

              <TeamArrangement v-model:team1="manualTeam1" v-model:team2="manualTeam2"
                :create-balanced-match="createBalancedMatch" />
            </div>
          </q-page>
        </q-page-container>

        <!-- Footer Actions -->
        <q-footer class="bg-grey-1">
          <q-toolbar>
            <q-toolbar-title></q-toolbar-title>
            <div class="q-gutter-sm">
              <!-- Step 1 Actions -->
              <template v-if="manualSelectionStep === 1">
                <!-- For doubles (4 players), show team arrangement button -->
                <q-btn v-if="selectedPlayers.length === 4" color="accent" label="Next: Arrange Teams"
                  icon-right="arrow_forward" @click="proceedToTeamArrangement">
                  <q-tooltip>Proceed to team arrangement</q-tooltip>
                </q-btn>

                <!-- For singles and other matches, show save button -->
                <q-btn v-else color="accent" label="Save Changes" icon="save" @click="saveMatchEdit"
                  :disable="selectedPlayers.length < 2">
                  <q-tooltip v-if="selectedPlayers.length < 2">
                    Need at least 2 players to save match
                  </q-tooltip>
                  <q-tooltip v-else>
                    Save match changes
                  </q-tooltip>
                </q-btn>
              </template>

              <!-- Step 2 Actions (Team Arrangement) -->
              <template v-else-if="manualSelectionStep === 2">
                <q-btn flat label="Back" icon="arrow_back" color="grey"
                  @click="() => { manualSelectionStep = 1; selectedForSwap = null; selectedForSwapTeam = null; }" />
                <q-btn flat label="Cancel" color="grey" @click="showMatchEditDialog = false" />
                <q-btn color="accent" label="Save Changes" icon="check" @click="saveMatchEdit"
                  :disable="selectedPlayers.length < 2 || selectedPlayers.length > 4">
                  <q-tooltip v-if="selectedPlayers.length < 2">
                    Need at least 2 players to save match
                  </q-tooltip>
                  <q-tooltip v-else-if="selectedPlayers.length > 4">
                    Maximum 4 players allowed for tennis matches
                  </q-tooltip>
                  <q-tooltip v-else>
                    Save match changes
                  </q-tooltip>
                </q-btn>
              </template>
            </div>
          </q-toolbar>
        </q-footer>
      </q-layout>
    </q-dialog>

    <!-- Replace Player Dialog -->
    <q-dialog v-model="showReplacePlayerDialog" :maximized="$q.screen.lt.md">
      <q-layout view="Lhh lpR fff" container class="bg-white" style="max-width: 800px; width: 95vw; max-height: 90vh;">
        <q-header class="players-header text-white" reveal>
          <q-toolbar>
            <q-toolbar-title>
              <q-icon name="swap_horiz" class="q-mr-sm" />
              Replace Player
            </q-toolbar-title>
            <q-btn icon="close" flat round dense v-close-popup />
          </q-toolbar>
        </q-header>

        <q-page-container>
          <q-page padding>
            <div class="text-subtitle2 q-mb-md">
              Choose a player to replace <strong>{{ playerToReplaceInEdit?.name }}</strong> with:
            </div>

            <q-list bordered separator>
              <q-item v-for="player in availableQueuePlayers" :key="player.name" clickable class="player-edit-item"
                @click="selectReplacementPlayer(player)">
                <q-item-section>
                  <q-item-label class="text-weight-medium">{{ player.name }}</q-item-label>
                  <q-item-label caption class="q-pl-xs">
                    <q-chip :label="`Level ${player.level}`" :color="getLevelColor(player.level)" text-color="white"
                      size="xs" dense />
                    <span class="q-ml-sm text-grey-7">Games: {{ player.gamesPlayed }}</span>
                    <span v-if="player.priority === 'returned'" class="q-ml-sm text-orange">(Returned)</span>
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-btn flat round color="accent" icon="swap_horiz" size="sm">
                    <q-tooltip>Click to replace {{ playerToReplaceInEdit?.name }} with {{ player.name }}</q-tooltip>
                  </q-btn>
                </q-item-section>
              </q-item>
            </q-list>
          </q-page>
        </q-page-container>

        <q-footer class="bg-grey-1">
          <q-toolbar>
            <q-toolbar-title></q-toolbar-title>
            <div class="q-gutter-sm">
              <q-btn flat label="Cancel" color="grey" @click="showReplacePlayerDialog = false">
                <q-tooltip>Cancel player replacement</q-tooltip>
              </q-btn>
            </div>
          </q-toolbar>
        </q-footer>
      </q-layout>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useQuasar } from 'quasar';
import TeamArrangement from '../components/TeamArrangement.vue';

// Player type
interface Player {
  name: string;
  level: 1 | 2 | 3;
  gamesPlayed: number;
  wins: number;
  losses: number;
  queuePosition?: number;
  originalQueueTime?: Date;
  lastMatchTime?: Date;
  priority?: 'normal' | 'high' | 'returned';
}

// Quasar instance for notifications
const $q = useQuasar();

// State: Players, Queue, and Matches
const players = ref<Player[]>(getPlayersFromStorage());
const queue = ref<Player[]>(getQueueFromStorage());
const matches = ref<Player[][]>(getMatchesFromStorage());
const newPlayerName = ref<string | null>(null);
const newPlayerLevel = ref<1 | 2 | 3 | null>(null);

// Dialog states
const showAddPlayerDialog = ref(false);
const showSettingsDialog = ref(false);
const showMatchResultDialog = ref(false);
const showMatchEditDialog = ref(false);
const showReplacePlayerDialog = ref(false);
const playerToReplaceInEdit = ref<Player | null>(null);
const selectedWinner = ref<'team1' | 'team2' | null>(null);
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

// Sort state
const sortBy = ref<'gamesPlayed' | 'wins' | 'losses' | 'name'>('gamesPlayed');

// Match type state
const matchType = ref<'singles' | 'doubles'>('doubles');

// Queue management state
const queueReturnMethod = ref<'fairness_first' | 'end_of_queue' | 'smart_position'>('fairness_first');
const autoSortQueue = ref(true);
const currentMatchIndexForActions = ref<number>(-1);

// Level options for select
const levelOptions = [
  { label: 'Beginner', value: 1, description: 'New to the game' },
  { label: 'Intermediate', value: 2, description: 'Some experience' },
  { label: 'Advanced', value: 3, description: 'Experienced player' }
];

// Match type options
const matchTypeOptions = [
  { label: 'Singles (1v1)', value: 'singles' },
  { label: 'Doubles (2v2)', value: 'doubles' }
];

// Sort options
const sortOptions = [
  { label: 'Games Played', value: 'gamesPlayed' },
  { label: 'Wins', value: 'wins' },
  { label: 'Losses', value: 'losses' },
  { label: 'Name', value: 'name' }
];

// Queue return options
const queueReturnOptions = [
  {
    label: 'Fairness First (Recommended)',
    value: 'fairness_first',
    description: 'Players return to front, maintaining fairness'
  },
  {
    label: 'End of Queue',
    value: 'end_of_queue',
    description: 'Players added to end of queue'
  },
  {
    label: 'Smart Position',
    value: 'smart_position',
    description: 'Calculate position based on games played'
  }
];

// Computed properties
const queueStats = computed(() => {
  const total = queue.value.length;
  const level1 = queue.value.filter(p => p.level === 1).length;
  const level2 = queue.value.filter(p => p.level === 2).length;
  const level3 = queue.value.filter(p => p.level === 3).length;

  return { total, level1, level2, level3 };
});

const sortedPlayers = computed(() => {
  return [...players.value].sort((a, b) => {
    // Sort by selected criteria
    if (sortBy.value === 'gamesPlayed') {
      if (a.gamesPlayed !== b.gamesPlayed) {
        return b.gamesPlayed - a.gamesPlayed; // Descending (most games first)
      }
    } else if (sortBy.value === 'wins') {
      if (a.wins !== b.wins) {
        return b.wins - a.wins; // Descending (most wins first)
      }
    } else if (sortBy.value === 'losses') {
      if (a.losses !== b.losses) {
        return b.losses - a.losses; // Descending (most losses first)
      }
    } else if (sortBy.value === 'name') {
      return a.name.localeCompare(b.name);
    }

    // Secondary sort by name for consistency
    return a.name.localeCompare(b.name);
  });
});

const currentMatch = computed(() => {
  if (currentMatchIndex.value >= 0 && currentMatchIndex.value < matches.value.length) {
    return matches.value[currentMatchIndex.value];
  }
  return [];
});

// Helper functions
const getLevelColor = (level: 1 | 2 | 3): string => {
  switch (level) {
    case 1: return 'green-6';      // Beginner - Green shade 6
    case 2: return 'orange-7';     // Intermediate - Orange shade 7
    case 3: return 'red-8';        // Advanced - Red shade 8
    default: return 'grey-5';
  }
};

const getLevelIcon = (level: 1 | 2 | 3): string => {
  switch (level) {
    case 1: return 'star_border';
    case 2: return 'star_half';
    case 3: return 'star';
    default: return 'star_outline';
  }
};

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
    3: 'Practice singles or wait for 1 more player'
  };

  return `${remainingPlayers} player${remainingPlayers > 1 ? 's' : ''} waiting - ${suggestions[remainingPlayers as keyof typeof suggestions]}`;
};

// Queue management helper functions
const getQueuePositionColor = (player: Player): string => {
  if (player.priority === 'high' || player.priority === 'returned') {
    return 'orange-6';
  }
  return 'accent';
};

const getQueueTimeInfo = (player: Player): string => {
  if (player.priority === 'returned') {
    return 'Returned';
  }
  if (player.originalQueueTime) {
    const now = new Date();
    const diff = now.getTime() - new Date(player.originalQueueTime).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just joined';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }
  return '';
};

const sortQueueByFairness = () => {
  if (autoSortQueue.value) {
    // Sort by games played (fewer games = higher priority)
    queue.value.sort((a, b) => a.gamesPlayed - b.gamesPlayed);
    saveQueueToStorage(queue.value);
  }
};

const calculateSmartPosition = (player: Player): number => {
  // Find position based on games played (fairness)
  const sortedQueue = [...queue.value].sort((a, b) => a.gamesPlayed - b.gamesPlayed);
  const playerGames = player.gamesPlayed;

  // Find where this player should be inserted
  for (let i = 0; i < sortedQueue.length; i++) {
    if (sortedQueue[i].gamesPlayed > playerGames) {
      return i;
    }
  }

  return queue.value.length; // End of queue
};

// Storage functions
function getPlayersFromStorage(): Player[] {
  const players = localStorage.getItem('playerList');
  const parsed = players ? JSON.parse(players) : [];
  // Migrate old data to include wins/losses
  return parsed.map((player: Partial<Player>) => ({
    ...player,
    wins: player.wins || 0,
    losses: player.losses || 0
  }));
}

function getQueueFromStorage(): Player[] {
  const queue = localStorage.getItem('playerQueue');
  const parsed = queue ? JSON.parse(queue) : [];
  // Migrate old data to include wins/losses
  return parsed.map((player: Partial<Player>) => ({
    ...player,
    wins: player.wins || 0,
    losses: player.losses || 0
  }));
}

function getMatchesFromStorage(): Player[][] {
  const matches = localStorage.getItem('matches');
  const parsed = matches ? JSON.parse(matches) : [];
  // Migrate old data to include wins/losses
  return parsed.map((match: Partial<Player>[]) =>
    match.map((player: Partial<Player>) => ({
      ...player,
      wins: player.wins || 0,
      losses: player.losses || 0
    }))
  );
}

function savePlayersToStorage(players: Player[]): void {
  localStorage.setItem('playerList', JSON.stringify(players));
}

function saveQueueToStorage(queue: Player[]): void {
  localStorage.setItem('playerQueue', JSON.stringify(queue));
}

function saveMatchesToStorage(matches: Player[][]): void {
  localStorage.setItem('matches', JSON.stringify(matches));
}

// Ultra-flexible match generation that handles ANY combination
const generateMatches = (): Player[][] => {
  const matches: Player[][] = [];
  const queueCopy = [...queue.value].sort((a, b) => a.gamesPlayed - b.gamesPlayed); // Prioritize fair play
  const playersPerMatch = matchType.value === 'singles' ? 2 : 4;

  // Calculate how many complete matches we can make
  const maxMatches = Math.floor(queueCopy.length / playersPerMatch);

  for (let i = 0; i < maxMatches; i++) {
    const matchPlayers = queueCopy.splice(0, playersPerMatch);

    if (matchType.value === 'singles') {
      // For singles, just pair the two players (already sorted by fairness)
      matches.push(matchPlayers);
    } else {
      // For doubles, create balanced teams
      const match = createBalancedMatch(matchPlayers);
      matches.push(match);
    }
  }

  // Update queue by removing matched players
  const matchedPlayerNames = matches.flat().map(p => p.name);
  queue.value = queue.value.filter(p => !matchedPlayerNames.includes(p.name));

  return matches;
};

// Helper function to create balanced teams from 4 players with randomness
const createBalancedMatch = (players: Player[]): Player[] => {
  // Sort players by level for better team balancing
  const sortedPlayers = [...players].sort((a, b) => a.level - b.level);

  // Generate all possible team combinations
  const combinations = generateTeamCombinations(sortedPlayers);

  // Calculate skill differences for all combinations
  const combinationsWithScores = combinations.map(combination => {
    const team1 = combination.team1;
    const team2 = combination.team2;

    const team1Skill = team1.reduce((sum, p) => sum + p.level, 0);
    const team2Skill = team2.reduce((sum, p) => sum + p.level, 0);
    const difference = Math.abs(team1Skill - team2Skill);

    return {
      ...combination,
      difference,
      team1Skill,
      team2Skill
    };
  });

  // Sort by skill difference (most balanced first)
  combinationsWithScores.sort((a, b) => a.difference - b.difference);

  // Get the best combinations (within 1 skill point difference)
  const bestDifference = combinationsWithScores[0].difference;
  const acceptableCombinations = combinationsWithScores.filter(
    combo => combo.difference <= bestDifference + 1
  );

  // Randomly select from acceptable combinations
  const randomIndex = Math.floor(Math.random() * acceptableCombinations.length);
  const selectedCombination = acceptableCombinations[randomIndex];

  return [...selectedCombination.team1, ...selectedCombination.team2];
};

// Helper function to generate all possible team combinations
const generateTeamCombinations = (players: Player[]): Array<{ team1: Player[], team2: Player[] }> => {
  const combinations: Array<{ team1: Player[], team2: Player[] }> = [];

  // Generate all possible ways to split 4 players into 2 teams of 2
  const indices = [0, 1, 2, 3];

  // Team 1 will have players at indices 0 and 1, Team 2 will have 2 and 3
  // But we need to try different combinations
  const team1Combinations = [
    [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]
  ];

  for (const team1Indices of team1Combinations) {
    const team2Indices = indices.filter(i => !team1Indices.includes(i));
    const team1 = team1Indices.map(i => players[i]);
    const team2 = team2Indices.map(i => players[i]);

    combinations.push({ team1, team2 });
  }

  return combinations;
};

// Action functions
const addNewPlayer = () => {
  if (!newPlayerName.value?.trim()) {
    $q.notify({
      type: 'negative',
      message: 'Please enter a player name',
      position: 'top'
    });
    return;
  }

  if (newPlayerLevel.value === null) {
    $q.notify({
      type: 'negative',
      message: 'Please select a player level',
      position: 'top'
    });
    return;
  }

  const trimmedName = newPlayerName.value.trim();

  if (players.value.some(player => player.name.toLowerCase() === trimmedName.toLowerCase())) {
    $q.notify({
      type: 'negative',
      message: `Player "${trimmedName}" already exists`,
      position: 'top'
    });
    return;
  }

  const newPlayer: Player = {
    name: trimmedName,
    level: newPlayerLevel.value,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
  };

  players.value.push(newPlayer);
  queue.value.push(newPlayer);

  savePlayersToStorage(players.value);
  saveQueueToStorage(queue.value);

  $q.notify({
    type: 'positive',
    message: `Player "${trimmedName}" added successfully`,
    position: 'top'
  });

  // Reset form and close dialog
  newPlayerName.value = null;
  newPlayerLevel.value = null;
  showAddPlayerDialog.value = false;
};

const generateNewMatches = () => {
  const matchCount = Math.floor(queue.value.length / (matchType.value === 'singles' ? 2 : 4));

  $q.dialog({
    title: 'Confirm Match Generation',
    message: `Generate ${matchCount} ${matchType.value} match${matchCount > 1 ? 'es' : ''} from the queue?`,
    cancel: {
      label: 'Cancel',
      color: 'grey',
      flat: true
    },
    persistent: false,
    ok: {
      label: 'Generate',
      color: 'accent',
      icon: 'auto_awesome'
    }
  }).onOk(() => {
    executeMatchGeneration();
  });
};

const executeMatchGeneration = () => {
  const newMatches = generateMatches();
  matches.value = [...matches.value, ...newMatches];
  saveQueueToStorage(queue.value);
  saveMatchesToStorage(matches.value);

  if (newMatches.length > 0) {
    const waitingCount = queue.value.length;
    let message = `Generated ${newMatches.length} new match(es)`;

    if (waitingCount > 0) {
      message += `. ${waitingCount} player${waitingCount > 1 ? 's' : ''} waiting for more players`;

      // Suggest activities for waiting players
      if (waitingCount === 1) {
        message += ' (suggest: practice serves or warm up)';
      } else if (waitingCount === 2) {
        message += ' (suggest: practice doubles positioning)';
      } else if (waitingCount === 3) {
        message += ' (suggest: practice singles or wait for 1 more player)';
      }
    }

    $q.notify({
      type: 'positive',
      message,
      position: 'top',
      timeout: 5000
    });
  } else {
    $q.notify({
      type: 'warning',
      message: 'Not enough players in queue to generate matches',
      position: 'top'
    });
  }
};

const openMatchResultDialog = (index: number) => {
  currentMatchIndex.value = index;
  selectedWinner.value = null;
  showMatchResultDialog.value = true;
};

const completeMatch = () => {
  if (selectedWinner.value === null || currentMatchIndex.value === -1) return;

  const winnerTeam = selectedWinner.value === 'team1' ? 'Team 1' : 'Team 2';

  $q.dialog({
    title: 'Complete Match',
    message: `Confirm ${winnerTeam} as the winner? This will update player stats and remove the match.`,
    cancel: {
      label: 'Cancel',
      color: 'grey',
      flat: true
    },
    persistent: false,
    ok: {
      label: 'Complete',
      color: 'accent',
      icon: 'check'
    }
  }).onOk(() => {
    const match = matches.value[currentMatchIndex.value];

    // Update games played for all players
    match.forEach(player => {
      const foundPlayer = players.value.find(p => p.name === player.name);
      if (foundPlayer) {
        foundPlayer.gamesPlayed++;

        // Update wins/losses based on team
        const playerIndex = match.findIndex(p => p.name === player.name);
        const isSingles = match.length === 2;
        const isTeam1 = isSingles ? playerIndex === 0 : playerIndex < 2;
        const isWinner = (selectedWinner.value === 'team1' && isTeam1) ||
          (selectedWinner.value === 'team2' && !isTeam1);

        if (isWinner) {
          foundPlayer.wins++;
        } else {
          foundPlayer.losses++;
        }
      }
    });

    // Remove match from list
    matches.value.splice(currentMatchIndex.value, 1);

    // Save data
    saveMatchesToStorage(matches.value);
    savePlayersToStorage(players.value);

    // Close dialog and reset
    showMatchResultDialog.value = false;
    selectedWinner.value = null;
    currentMatchIndex.value = -1;

    $q.notify({
      type: 'positive',
      message: 'Match completed! Stats updated.',
      position: 'top'
    });
  });
};

const removePlayer = (name: string) => {
  $q.dialog({
    title: 'Confirm Removal',
    message: `Are you sure you want to remove "${name}" from all lists?`,
    cancel: {
      label: 'Cancel',
      color: 'grey',
      flat: true
    },
    ok: {
      label: 'Remove',
      color: 'negative',
      icon: 'delete'
    },
    persistent: true
  }).onOk(() => {
    players.value = players.value.filter(player => player.name !== name);
    queue.value = queue.value.filter(player => player.name !== name);
    savePlayersToStorage(players.value);
    saveQueueToStorage(queue.value);

    $q.notify({
      type: 'positive',
      message: `Player "${name}" removed successfully`,
      position: 'top'
    });
  });
};

const removeFromQueue = (name: string) => {
  $q.dialog({
    title: 'Remove from Queue',
    message: `Remove "${name}" from the queue?`,
    cancel: {
      label: 'Cancel',
      color: 'grey',
      flat: true
    },
    persistent: false,
    ok: {
      label: 'Remove',
      color: 'negative',
      icon: 'remove_circle'
    }
  }).onOk(() => {
    queue.value = queue.value.filter(player => player.name !== name);
    saveQueueToStorage(queue.value);

    $q.notify({
      type: 'info',
      message: `Player "${name}" removed from queue`,
      position: 'top'
    });
  });
};

const resetGamesPlayed = () => {
  $q.dialog({
    title: 'Confirm Reset',
    message: 'Are you sure you want to reset all games played counters to zero?',
    cancel: {
      label: 'Cancel',
      color: 'grey',
      flat: true
    },
    ok: {
      label: 'Reset',
      color: 'negative',
      icon: 'refresh'
    },
    persistent: true
  }).onOk(() => {
    players.value.forEach(player => {
      player.gamesPlayed = 0;
      player.wins = 0;
      player.losses = 0;
    });
    savePlayersToStorage(players.value);

    $q.notify({
      type: 'positive',
      message: 'All games played counters have been reset',
      position: 'top'
    });
  });
};

const requeuePlayer = (name: string) => {
  const player = players.value.find(p => p.name === name);
  if (player) {
    if (queue.value.some(p => p.name === name)) {
      $q.notify({
        type: 'warning',
        message: `Player "${name}" is already in the queue`,
        position: 'top'
      });
      return;
    }

    // Add queue metadata
    const queuePlayer: Player = {
      ...player,
      originalQueueTime: new Date(),
      priority: 'normal'
    };

    queue.value.push(queuePlayer);
    sortQueueByFairness();

    $q.notify({
      type: 'positive',
      message: `Player "${name}" added to queue`,
      position: 'top'
    });
  }
};

// Enhanced queue return functions
const returnPlayersToQueue = (players: Player[], reason: 'cancelled' | 'edited') => {
  $q.dialog({
    title: 'Return Players to Queue',
    message: `How should ${players.length} player(s) be returned to the queue?`,
    options: {
      type: 'radio',
      model: queueReturnMethod.value,
      items: queueReturnOptions
    },
    cancel: { label: 'Cancel', color: 'grey', flat: true },
    ok: { label: 'Return to Queue', color: 'accent', icon: 'queue' }
  }).onOk((returnMethod) => {
    executeQueueReturn(players, returnMethod, reason);
  });
};

const executeQueueReturn = (players: Player[], method: string, reason: string) => {
  const now = new Date();

  // Add queue metadata to players
  const queuePlayers = players.map(player => ({
    ...player,
    originalQueueTime: now,
    priority: (reason === 'cancelled' ? 'high' : 'returned') as 'normal' | 'high' | 'returned'
  }));

  switch (method) {
    case 'fairness_first':
      // Add to front of queue
      queue.value.unshift(...queuePlayers);
      break;

    case 'end_of_queue':
      // Add to end of queue
      queue.value.push(...queuePlayers);
      break;

    case 'smart_position':
      // Calculate smart positions
      queuePlayers.forEach(player => {
        const position = calculateSmartPosition(player);
        queue.value.splice(position, 0, player);
      });
      break;
  }

  // Re-sort queue to maintain fairness
  sortQueueByFairness();

  // Save and notify
  saveQueueToStorage(queue.value);

  $q.notify({
    type: 'positive',
    message: `${players.length} player(s) returned to queue using ${method} method`,
    position: 'top'
  });
};

const resetAllData = () => {
  $q.dialog({
    title: 'Confirm Reset All',
    message: 'This will clear all players, queue, and matches. Are you sure?',
    cancel: {
      label: 'Cancel',
      color: 'grey',
      flat: true
    },
    ok: {
      label: 'Reset All',
      color: 'negative',
      icon: 'delete_forever'
    },
    persistent: true
  }).onOk(() => {
    players.value = [];
    queue.value = [];
    matches.value = [];
    savePlayersToStorage(players.value);
    saveQueueToStorage(queue.value);
    saveMatchesToStorage(matches.value);

    $q.notify({
      type: 'positive',
      message: 'All data has been reset',
      position: 'top'
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
  showManualSelectionDialog.value = false;
};

const togglePlayerSelection = (player: Player) => {
  const index = selectedPlayers.value.findIndex(p => p.name === player.name);
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
        position: 'top'
      });
    }
  }
};

const isPlayerSelected = (player: Player): boolean => {
  return selectedPlayers.value.some(p => p.name === player.name);
};

const proceedToTeamArrangement = () => {
  const playerCount = selectedPlayers.value.length;

  if (playerCount < 2) {
    $q.notify({
      type: 'warning',
      message: 'Please select at least 2 players',
      position: 'top'
    });
    return;
  }

  if (playerCount > 4) {
    $q.notify({
      type: 'warning',
      message: 'Maximum 4 players allowed for tennis matches',
      position: 'top'
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

const getTeamSkill = (team: Player[]): number => {
  return team.reduce((sum, p) => sum + p.level, 0);
};

const getSkillDifference = (): number => {
  return Math.abs(getTeamSkill(manualTeam1.value) - getTeamSkill(manualTeam2.value));
};

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
  const newMatch = [...manualTeam1.value, ...manualTeam2.value];
  matches.value.push(newMatch);

  // Remove players from queue
  const matchedPlayerNames = newMatch.map(p => p.name);
  queue.value = queue.value.filter(p => !matchedPlayerNames.includes(p.name));

  // Save data
  saveMatchesToStorage(matches.value);
  saveQueueToStorage(queue.value);

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
  const newMatch = [...selectedPlayers.value];
  matches.value.push(newMatch);

  // Remove players from queue
  const matchedPlayerNames = newMatch.map(p => p.name);
  queue.value = queue.value.filter(p => !matchedPlayerNames.includes(p.name));

  // Save data
  saveMatchesToStorage(matches.value);
  saveQueueToStorage(queue.value);

  // Close dialog and reset
  showManualSelectionDialog.value = false;
  selectedPlayers.value = [];

  $q.notify({
    type: 'positive',
    message: 'Singles match created successfully!',
    position: 'top'
  });
};

// Match management functions
const cancelMatch = (matchIndex: number) => {
  $q.dialog({
    title: 'Cancel Match',
    message: 'Are you sure you want to cancel this match? All players will return to the queue.',
    cancel: { label: 'Keep Match', color: 'grey', flat: true },
    ok: {
      label: 'Cancel Match',
      color: 'negative',
      icon: 'cancel'
    },
    persistent: true
  }).onOk(() => {
    const match = matches.value[matchIndex];

    // Return all players to queue
    returnPlayersToQueue(match, 'cancelled');

    // Remove match
    matches.value.splice(matchIndex, 1);

    // Save data
    saveMatchesToStorage(matches.value);

    $q.notify({
      type: 'info',
      message: 'Match cancelled. Players returned to queue.',
      position: 'top'
    });
  });
};

const editMatch = (matchIndex: number) => {
  currentMatchIndexForActions.value = matchIndex;
  showMatchEditDialog.value = true;
  manualSelectionStep.value = 1;

  // Pre-populate with current players
  selectedPlayers.value = [...matches.value[matchIndex]];

  // Determine match type based on number of players
  const currentMatch = matches.value[matchIndex];
  const isDoublesMatch = currentMatch.length === 4;

  // For doubles matches, initialize teams
  if (isDoublesMatch) {
    manualTeam1.value = [currentMatch[0], currentMatch[1]];
    manualTeam2.value = [currentMatch[2], currentMatch[3]];
  } else {
    // For singles or if not 4 players, clear teams
    manualTeam1.value = [];
    manualTeam2.value = [];
  }
};

const saveMatchEdit = () => {
  // Store original match before updating
  const originalMatch = [...matches.value[currentMatchIndexForActions.value]];

  // Create the updated match
  let updatedMatch: Player[];

  if (currentMatchType.value === 'doubles' && selectedPlayers.value.length === 4 && manualTeam1.value.length === 2 && manualTeam2.value.length === 2) {
    // For doubles with proper teams, use the arranged teams
    updatedMatch = [...manualTeam1.value, ...manualTeam2.value];
  } else {
    // For singles or any other configuration, use selected players directly
    updatedMatch = [...selectedPlayers.value];
  }

  // Update the match
  matches.value[currentMatchIndexForActions.value] = updatedMatch;

  // Update queue (remove added players, add removed players)
  const queueChanges = updateQueueAfterEdit(originalMatch, updatedMatch);

  // Save data
  saveMatchesToStorage(matches.value);
  saveQueueToStorage(queue.value);

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
  if (queueChanges.removed.length > 0 || queueChanges.added.length > 0) {
    const changes = [];
    if (queueChanges.removed.length > 0) {
      changes.push(`${queueChanges.removed.length} player(s) returned to queue`);
    }
    if (queueChanges.added.length > 0) {
      changes.push(`${queueChanges.added.length} player(s) removed from queue`);
    }
    message += ` (${changes.join(', ')})`;
  }

  $q.notify({
    type: 'positive',
    message: message,
    position: 'top',
    timeout: 4000
  });
};

const updateQueueAfterEdit = (originalMatch: Player[], updatedMatch: Player[]) => {
  const originalPlayerNames = originalMatch.map(p => p.name);
  const updatedPlayerNames = updatedMatch.map(p => p.name);

  // Find players that were removed from the match
  const removedPlayers = originalMatch.filter(p => !updatedPlayerNames.includes(p.name));

  // Find players that were added to the match
  const addedPlayers = updatedMatch.filter(p => !originalPlayerNames.includes(p.name));

  console.log('Queue Update Analysis:', {
    original: originalPlayerNames,
    updated: updatedPlayerNames,
    removed: removedPlayers.map(p => p.name),
    added: addedPlayers.map(p => p.name)
  });

  // Remove added players from queue (they're now in the match)
  addedPlayers.forEach(player => {
    const queueIndex = queue.value.findIndex(p => p.name === player.name);
    if (queueIndex >= 0) {
      queue.value.splice(queueIndex, 1);
      console.log(`Removed ${player.name} from queue (now in match)`);
    }
  });

  // Add removed players back to queue (they're no longer in the match)
  removedPlayers.forEach(player => {
    // Check if player is not already in queue
    const alreadyInQueue = queue.value.some(p => p.name === player.name);
    if (!alreadyInQueue) {
      // Add player back to queue with appropriate priority
      const playerWithPriority = {
        ...player,
        priority: 'returned' as const,
        originalQueueTime: new Date(),
        lastMatchTime: new Date()
      };

      console.log(`Adding ${player.name} back to queue with priority: returned`);

      // Use the configured queue return method
      executeQueueReturn([playerWithPriority], queueReturnMethod.value, 'edited');
    } else {
      console.log(`${player.name} is already in queue, skipping`);
    }
  });

  // Sort queue if auto-sort is enabled
  if (autoSortQueue.value) {
    sortQueueByFairness();
  }

  // Save updated data
  saveQueueToStorage(queue.value);

  // Return information about the changes
  return {
    removed: removedPlayers,
    added: addedPlayers
  };
};

// Match edit helper functions
const availableQueuePlayers = computed(() => {
  const matchPlayerNames = selectedPlayers.value.map(p => p.name);
  return queue.value.filter(p => !matchPlayerNames.includes(p.name));
});

const currentMatchType = computed(() => {
  return selectedPlayers.value.length === 4 ? 'doubles' : 'singles';
});

const removePlayerFromEdit = (player: Player) => {
  // Allow removing players freely - user can add more if needed
  const index = selectedPlayers.value.findIndex(p => p.name === player.name);
  if (index >= 0) {
    selectedPlayers.value.splice(index, 1);

    $q.notify({
      type: 'info',
      message: `Removed ${player.name} from match`,
      position: 'top',
      timeout: 2000
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
      message: `Added ${player.name} to match`,
      position: 'top',
      timeout: 2000
    });
  }
};

const replacePlayerInEdit = (playerToReplace: Player) => {
  if (availableQueuePlayers.value.length === 0) {
    $q.notify({
      type: 'warning',
      message: 'No players available in queue to replace with',
      position: 'top'
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
  const index = selectedPlayers.value.findIndex(p => p.name === playerToReplaceInEdit.value!.name);
  if (index >= 0) {
    selectedPlayers.value[index] = replacementPlayer;

    $q.notify({
      type: 'positive',
      message: `Replaced ${playerToReplaceInEdit.value.name} with ${replacementPlayer.name}`,
      position: 'top'
    });
  }

  // Close dialog and reset
  showReplacePlayerDialog.value = false;
  playerToReplaceInEdit.value = null;
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
.players-header {
  background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%) !important;
}

.queue-header {
  background: linear-gradient(135deg, #764ba2 0%, #9f7aea 100%) !important;
}

.matches-header {
  background: linear-gradient(135deg, #5a67d8 0%, #667eea 100%) !important;
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
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 15px rgba(0, 0, 0, 0.15);
  }
}

// Queue card removed flexible height - buttons sit naturally below

.card-content {
  height: 400px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 0.5rem; // Add spacing at bottom
}

// For queue card, shorter to accommodate buttons section
.queue-card .card-content {
  height: 304px; // 96px shorter than other lists

  @media (max-width: 768px) {
    height: 204px;
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
  gap: 0.25rem;
  flex: 1;
  align-items: center;
}

.match-player-chip {
  font-weight: 500;
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

.sort-select {
  .q-field__control {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .q-field__native {
    color: white;
  }

  .q-field__label {
    color: rgba(255, 255, 255, 0.8);
  }
}

// Responsive design
@media (max-width: 768px) {
  .container {
    padding: 0 0.5rem;
  }

  .header-section {
    padding: 0.75rem 0;
  }

  .match-player-chip {
    font-size: 12px !important;
  }

  .match-item {
    padding: 0.75rem 0.5rem !important;
  }

  .card-content {
    height: 300px;
  }

  .sort-select {
    min-width: 100px !important;
  }
}

// Custom scrollbar
.q-list {
  flex: 1;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 3px;
    transition: background 0.2s ease;

    &:hover {
      background: #c1c1c1;
    }
  }

  // Show scrollbar only on hover
  &:hover {
    &::-webkit-scrollbar-thumb {
      background: #e0e0e0;
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
  transition: transform 0.3s ease, box-shadow 0.3s ease;

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
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    }
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
    }

    .q-page {
      padding: 12px;
    }
  }
}

@media (max-width: 480px) {
  .q-dialog {
    .q-layout {
      width: 98vw !important;
      margin: 4px;
    }
  }
}
</style>
