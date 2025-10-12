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
            <q-btn color="white" icon="settings" label="Settings" @click="showSettingsDialog = true" flat size="sm" />
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
                  <q-btn color="white" @click="showAddPlayerDialog = true" icon="person_add" flat round dense />
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
                      <q-avatar color="accent" text-color="white" size="md">
                        {{ index + 1 }}
                        <q-tooltip>Position in queue: {{ index + 1 }}</q-tooltip>
                      </q-avatar>
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-weight-medium">{{ player.name }}</q-item-label>
                      <q-item-label caption class="q-pl-xs">
                        <q-chip :label="`Level ${player.level}`" :color="getLevelColor(player.level)" text-color="white"
                          size="xs" dense />
                        <span class="q-ml-sm">{{ player.gamesPlayed }} games</span>
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
                      <q-btn flat color="accent" @click="openMatchResultDialog(index)" icon="emoji_events" size="sm"
                        round />
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
    <q-dialog v-model="showAddPlayerDialog">
      <q-card style="min-width: 350px; max-width: 500px; width: 90vw">
        <q-card-section class="players-header text-white">
          <div class="text-h6">
            <q-icon name="person_add" class="q-mr-sm" />
            Add New Player
          </div>
        </q-card-section>
        <q-card-section>
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
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" color="grey" @click="showAddPlayerDialog = false" />
          <q-btn color="accent" @click="addNewPlayer" label="Add Player"
            :disable="!newPlayerName?.trim() || newPlayerLevel === null" icon="add" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Match Result Dialog -->
    <q-dialog v-model="showMatchResultDialog">
      <q-card style="min-width: 350px; max-width: 600px; width: 95vw">
        <q-card-section class="matches-header text-white">
          <div class="text-h6">
            <q-icon name="emoji_events" class="q-mr-sm" />
            Match Result
          </div>
        </q-card-section>
        <q-card-section>
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
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" color="grey" @click="showMatchResultDialog = false" />
          <q-btn color="accent" @click="completeMatch" label="Complete Match" :disable="selectedWinner === null"
            icon="check" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Settings Dialog -->
    <q-dialog v-model="showSettingsDialog">
      <q-card style="min-width: 350px; max-width: 500px; width: 90vw">
        <q-card-section class="queue-header text-white">
          <div class="text-h6">
            <q-icon name="settings" class="q-mr-sm" />
            Settings
          </div>
        </q-card-section>
        <q-card-section>
          <div class="q-gutter-y-md">
            <div>
              <q-btn color="accent" @click="resetGamesPlayed" icon="refresh" label="Reset Games Played"
                class="full-width" />
            </div>
            <div>
              <q-btn color="negative" @click="resetAllData" icon="delete_forever" label="Reset All Data"
                class="full-width" />
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Close" color="grey" @click="showSettingsDialog = false" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Manual Match Selection Dialog -->
    <q-dialog v-model="showManualSelectionDialog" maximized transition-show="slide-up" transition-hide="slide-down">
      <q-card>
        <q-card-section class="players-header text-white">
          <div class="row items-center justify-between">
            <div class="text-h6">
              <q-icon name="touch_app" class="q-mr-sm" />
              Manual {{ matchType === 'singles' ? 'Singles' : 'Doubles' }} Match Selection
            </div>
            <q-btn icon="close" flat round dense v-close-popup />
          </div>
        </q-card-section>

        <q-card-section>
          <div class="manual-selection-container">
            <!-- Step 1: Select Players -->
            <div v-if="manualSelectionStep === 1" class="selection-step">
              <div class="text-h6 q-mb-md">Step 1: Select {{ matchType === 'singles' ? '2' : '4' }} Players</div>
              <div class="text-caption text-grey-7 q-mb-md">
                Click on players to select them for the match ({{ selectedPlayers.length }}/{{ matchType === 'singles' ?
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

              <div class="q-mt-lg row justify-end q-gutter-sm">
                <q-btn flat label="Cancel" color="grey" @click="cancelManualSelection" />
                <q-btn v-if="matchType === 'doubles'" color="accent" label="Next: Arrange Teams"
                  icon-right="arrow_forward" @click="proceedToTeamArrangement"
                  :disable="selectedPlayers.length !== 4" />
                <q-btn v-else color="accent" label="Create Match" icon="check" @click="createSinglesManualMatch"
                  :disable="selectedPlayers.length !== 2" />
              </div>
            </div>

            <!-- Step 2: Arrange Teams -->
            <div v-if="manualSelectionStep === 2" class="arrangement-step">
              <div class="text-h6 q-mb-md">Step 2: Arrange Teams</div>

              <!-- Balance Indicator -->
              <div class="balance-indicator q-mb-lg">
                <div class="row items-center justify-between">
                  <div class="text-subtitle1">Team Balance</div>
                  <div class="row items-center q-gutter-sm">
                    <q-chip :color="getBalanceColor()" text-color="white" :icon="getBalanceIcon()" size="md">
                      {{ getBalanceText() }}
                    </q-chip>
                    <q-icon v-if="!isBalanced()" name="warning" color="orange" size="sm">
                      <q-tooltip>Teams are unbalanced. Consider using Balance Teams button.</q-tooltip>
                    </q-icon>
                  </div>
                </div>
                <div class="text-caption text-grey-7 q-mt-xs">
                  Skill difference: {{ getSkillDifference() }} point{{ getSkillDifference() !== 1 ? 's' : '' }}
                  (Team 1: {{ getTeamSkill(manualTeam1) }} vs Team 2: {{ getTeamSkill(manualTeam2) }})
                </div>
              </div>

              <!-- Team Arrangement Actions -->
              <div class="row q-mb-lg q-gutter-sm">
                <q-btn color="accent" label="Balance Teams" icon="balance" @click="balanceTeams" outline>
                  <q-tooltip>Use smart algorithm to create balanced teams</q-tooltip>
                </q-btn>
                <q-btn color="accent" label="Shuffle" icon="shuffle" @click="shuffleTeams" outline>
                  <q-tooltip>Randomly assign players to teams</q-tooltip>
                </q-btn>
              </div>

              <!-- Teams Display -->
              <div class="row q-col-gutter-lg">
                <!-- Team 1 -->
                <div class="col-12 col-md-6">
                  <q-card flat bordered>
                    <q-card-section class="bg-blue-6 text-white">
                      <div class="text-h6">
                        Team 1
                        <q-chip :label="`Skill: ${getTeamSkill(manualTeam1)}`" color="white" text-color="blue-6"
                          size="sm" class="q-ml-sm" />
                      </div>
                    </q-card-section>
                    <q-card-section class="team-drop-area">
                      <div class="text-caption text-grey-6 q-mb-sm text-center">
                        <q-icon name="touch_app" size="xs" /> Click to select, click another to swap
                      </div>
                      <q-list v-if="manualTeam1.length > 0">
                        <q-item v-for="(player, index) in manualTeam1" :key="player.name" clickable
                          class="team-player-item swappable-player" :class="{
                            'selected-for-swap': selectedForSwap?.name === player.name,
                            'can-swap-with': selectedForSwap && selectedForSwap.name !== player.name
                          }" @click="selectPlayerForSwap(player, 'team1')">
                          <q-item-section avatar>
                            <q-avatar :color="getLevelColor(player.level)" text-color="white"
                              :class="{ 'swap-pulse': selectedForSwap?.name === player.name }">
                              {{ index + 1 }}
                              <q-tooltip>{{ player.name }} - Level {{ player.level }} - Position {{ index + 1
                              }}</q-tooltip>
                            </q-avatar>
                          </q-item-section>
                          <q-item-section>
                            <q-item-label class="text-weight-medium">
                              {{ player.name }}
                              <q-icon v-if="selectedForSwap?.name === player.name" name="check_circle" color="green"
                                size="sm" class="q-ml-xs swap-icon-pulse" />
                            </q-item-label>
                            <q-item-label caption>Level {{ player.level }}</q-item-label>
                          </q-item-section>
                          <q-item-section side>
                            <q-icon name="swap_horiz" color="grey-5" size="sm" />
                          </q-item-section>
                        </q-item>
                      </q-list>
                      <div v-else class="text-center text-grey-6 q-pa-md empty-team-drop">
                        <q-icon name="group_add" size="lg" color="grey-4" />
                        <p class="q-mt-sm">Click to assign</p>
                      </div>
                    </q-card-section>
                  </q-card>
                </div>

                <!-- Team 2 -->
                <div class="col-12 col-md-6">
                  <q-card flat bordered>
                    <q-card-section class="bg-orange-6 text-white">
                      <div class="text-h6">
                        Team 2
                        <q-chip :label="`Skill: ${getTeamSkill(manualTeam2)}`" color="white" text-color="orange-6"
                          size="sm" class="q-ml-sm" />
                      </div>
                    </q-card-section>
                    <q-card-section class="team-drop-area">
                      <div class="text-caption text-grey-6 q-mb-sm text-center">
                        <q-icon name="touch_app" size="xs" /> Click to select, click another to swap
                      </div>
                      <q-list v-if="manualTeam2.length > 0">
                        <q-item v-for="(player, index) in manualTeam2" :key="player.name" clickable
                          class="team-player-item swappable-player" :class="{
                            'selected-for-swap': selectedForSwap?.name === player.name,
                            'can-swap-with': selectedForSwap && selectedForSwap.name !== player.name
                          }" @click="selectPlayerForSwap(player, 'team2')">
                          <q-item-section avatar>
                            <q-avatar :color="getLevelColor(player.level)" text-color="white"
                              :class="{ 'swap-pulse': selectedForSwap?.name === player.name }">
                              {{ index + 1 }}
                              <q-tooltip>{{ player.name }} - Level {{ player.level }} - Position {{ index + 1
                              }}</q-tooltip>
                            </q-avatar>
                          </q-item-section>
                          <q-item-section>
                            <q-item-label class="text-weight-medium">
                              {{ player.name }}
                              <q-icon v-if="selectedForSwap?.name === player.name" name="check_circle" color="green"
                                size="sm" class="q-ml-xs swap-icon-pulse" />
                            </q-item-label>
                            <q-item-label caption>Level {{ player.level }}</q-item-label>
                          </q-item-section>
                          <q-item-section side>
                            <q-icon name="swap_horiz" color="grey-5" size="sm" />
                          </q-item-section>
                        </q-item>
                      </q-list>
                      <div v-else class="text-center text-grey-6 q-pa-md empty-team-drop">
                        <q-icon name="group_add" size="lg" color="grey-4" />
                        <p class="q-mt-sm">Click to assign</p>
                      </div>
                    </q-card-section>
                  </q-card>
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="q-mt-lg row justify-between">
                <q-btn flat label="Back" icon="arrow_back" color="grey"
                  @click="() => { manualSelectionStep = 1; selectedForSwap = null; selectedForSwapTeam = null; }" />
                <div class="row q-gutter-sm">
                  <q-btn flat label="Cancel" color="grey" @click="cancelManualSelection" />
                  <q-btn color="accent" label="Create Match" icon="check" @click="createManualMatch"
                    :disable="manualTeam1.length !== 2 || manualTeam2.length !== 2" />
                </div>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useQuasar } from 'quasar';

// Player type
interface Player {
  name: string;
  level: 1 | 2 | 3;
  gamesPlayed: number;
  wins: number;
  losses: number;
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

    queue.value.push(player);
    saveQueueToStorage(queue.value);

    $q.notify({
      type: 'positive',
      message: `Player "${name}" added to queue`,
      position: 'top'
    });
  }
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
  if (selectedPlayers.value.length !== 4) {
    $q.notify({
      type: 'warning',
      message: 'Please select exactly 4 players',
      position: 'top'
    });
    return;
  }

  // Automatically balance teams initially
  const balanced = createBalancedMatch([...selectedPlayers.value]);
  manualTeam1.value = [balanced[0], balanced[1]];
  manualTeam2.value = [balanced[2], balanced[3]];
  manualSelectionStep.value = 2;
};

const getTeamSkill = (team: Player[]): number => {
  return team.reduce((sum, p) => sum + p.level, 0);
};

const getSkillDifference = (): number => {
  return Math.abs(getTeamSkill(manualTeam1.value) - getTeamSkill(manualTeam2.value));
};

const isBalanced = (): boolean => {
  // Consider balanced if difference is 1 or less
  return getSkillDifference() <= 1;
};

const getBalanceColor = (): string => {
  const diff = getSkillDifference();
  if (diff === 0) return 'green';
  if (diff === 1) return 'light-green';
  if (diff === 2) return 'orange';
  return 'red';
};

const getBalanceIcon = (): string => {
  const diff = getSkillDifference();
  if (diff === 0) return 'verified';
  if (diff === 1) return 'check_circle';
  if (diff === 2) return 'warning';
  return 'error';
};

const getBalanceText = (): string => {
  const diff = getSkillDifference();
  if (diff === 0) return 'Perfect Balance';
  if (diff === 1) return 'Well Balanced';
  if (diff === 2) return 'Slightly Unbalanced';
  return 'Very Unbalanced';
};

const balanceTeams = () => {
  // Use the existing smart algorithm
  const allPlayers = [...manualTeam1.value, ...manualTeam2.value];
  const balanced = createBalancedMatch(allPlayers);
  manualTeam1.value = [balanced[0], balanced[1]];
  manualTeam2.value = [balanced[2], balanced[3]];

  $q.notify({
    type: 'positive',
    message: 'Teams have been balanced using smart algorithm',
    position: 'top'
  });
};

const shuffleTeams = () => {
  // Randomly shuffle players between teams
  const allPlayers = [...manualTeam1.value, ...manualTeam2.value];

  // Fisher-Yates shuffle
  for (let i = allPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPlayers[i], allPlayers[j]] = [allPlayers[j], allPlayers[i]];
  }

  manualTeam1.value = [allPlayers[0], allPlayers[1]];
  manualTeam2.value = [allPlayers[2], allPlayers[3]];

  $q.notify({
    type: 'info',
    message: 'Teams have been shuffled randomly',
    position: 'top'
  });
};

// Tap-to-Swap Functions (Works on both Desktop and Mobile)
const selectPlayerForSwap = (player: Player, team: 'team1' | 'team2') => {
  // If no player selected yet, select this one
  if (!selectedForSwap.value) {
    selectedForSwap.value = player;
    selectedForSwapTeam.value = team;
    return;
  }

  // If clicking the same player, deselect
  if (selectedForSwap.value.name === player.name) {
    selectedForSwap.value = null;
    selectedForSwapTeam.value = null;
    return;
  }

  // If clicking another player, swap them
  const team1Array = manualTeam1.value;
  const team2Array = manualTeam2.value;

  // Remove both players from their current teams
  manualTeam1.value = team1Array.filter(p => p.name !== selectedForSwap.value!.name && p.name !== player.name);
  manualTeam2.value = team2Array.filter(p => p.name !== selectedForSwap.value!.name && p.name !== player.name);

  // Add them to their new teams
  if (selectedForSwapTeam.value === 'team1') {
    manualTeam2.value.push(selectedForSwap.value);
  } else {
    manualTeam1.value.push(selectedForSwap.value);
  }

  if (team === 'team1') {
    manualTeam2.value.push(player);
  } else {
    manualTeam1.value.push(player);
  }

  $q.notify({
    type: 'positive',
    message: `Swapped ${selectedForSwap.value.name} with ${player.name}`,
    position: 'top'
  });

  // Reset selection
  selectedForSwap.value = null;
  selectedForSwapTeam.value = null;
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
    background: #f1f1f1;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 3px;

    &:hover {
      background: #a8a8a8;
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
</style>
