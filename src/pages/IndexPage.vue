<template>
  <q-page class="doubles-queue-page">
    <!-- Header Section -->
    <div class="header-section">
      <div class="container">
        <div class="row items-center justify-between">
          <div class="col">
            <h1 class="text-h4 text-weight-bold text-white q-mb-xs">
              🏓 Doubles Queue Master
            </h1>
            <p class="text-subtitle1 text-grey-1 q-ma-none">
              Smart matchmaking system
            </p>
          </div>
          <div class="col-auto">
            <q-btn 
              color="white" 
              icon="settings" 
              label="Settings" 
              @click="showSettingsDialog = true"
              flat
            />
          </div>
        </div>
      </div>
    </div>

    <div class="container q-pa-md">
      <div class="row q-col-gutter-lg">
        <!-- Left Column: Players List -->
        <div class="col-12 col-md-4">
          <q-card class="players-card" flat bordered>
            <q-card-section class="bg-secondary text-white">
              <div class="row items-center justify-between">
                <div class="text-h6">
                  <q-icon name="people" class="q-mr-sm" />
                  Players ({{ players.length }})
                </div>
                <div class="row items-center q-gutter-xs">
                                     <q-select
                     v-model="sortBy"
                     :options="sortOptions"
                     dense
                     outlined
                     dark
                     color="white"
                     class="sort-select"
                     style="min-width: 120px;"
                     emit-value
                     map-options
                   >
                     <template v-slot:prepend>
                       <q-icon name="sort" />
                     </template>
                   </q-select>
                  <q-btn 
                    color="white" 
                    @click="showAddPlayerDialog = true" 
                    icon="person_add" 
                    flat
                    round
                    dense
                  />
                </div>
              </div>
            </q-card-section>
            <q-card-section class="q-pa-none">
              <div class="card-content">
                <q-list separator v-if="players.length > 0">
                  <q-item v-for="player in sortedPlayers" :key="player.name" class="player-item">
                    <q-item-section avatar>
                      <q-avatar :color="getLevelColor(player.level)" text-color="white" size="md">
                        {{ player.gamesPlayed }}
                      </q-avatar>
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-weight-medium">{{ player.name }}</q-item-label>
                      <q-item-label caption>
                        <q-chip 
                          :label="`Level ${player.level}`" 
                          :color="getLevelColor(player.level)" 
                          text-color="white"
                          size="sm"
                          dense
                        />
                        <!-- <span class="q-ml-sm">{{ player.gamesPlayed }} game{{ player.gamesPlayed > 1 ? 's' : '' }}</span> -->
                        <span class="q-ml-sm text-positive">W: {{ player.wins }}</span>
                        <span class="q-ml-sm text-negative">L: {{ player.losses }}</span>
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <div class="row items-center q-gutter-xs">
                        <q-btn 
                          flat 
                          round 
                          color="negative" 
                          @click="removePlayer(player.name)" 
                          icon="delete" 
                          size="sm"
                        />
                        <q-btn 
                          flat 
                          color="secondary" 
                          @click="requeuePlayer(player.name)" 
                          icon="add_to_queue"
                          size="sm"
                          :disable="queue.some(p => p.name === player.name)"
                        />
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
            <q-card-section class="bg-accent text-white">
              <div class="row items-center justify-between">
                <div class="text-h6">
                  <q-icon name="queue" class="q-mr-sm" />
                  Players Queue ({{ queue.length }})
                </div>
                <div class="queue-stats">
                  <q-chip 
                    :label="`L1: ${queueStats.level1}`" 
                    color="green" 
                    text-color="white"
                    size="sm"
                  />
                  <q-chip 
                    :label="`L2: ${queueStats.level2}`" 
                    color="orange" 
                    text-color="white"
                    size="sm"
                  />
                  <q-chip 
                    :label="`L3: ${queueStats.level3}`" 
                    color="red" 
                    text-color="white"
                    size="sm"
                  />
                </div>
              </div>
            </q-card-section>
            <q-card-section class="q-pa-none">
              <div class="card-content">
                <q-list separator v-if="queue.length > 0">
                  <q-item v-for="(player, index) in queue" :key="player.name" class="queue-item">
                    <q-item-section avatar>
                      <q-avatar :color="getLevelColor(player.level)" text-color="white" size="sm">
                        {{ index + 1 }}
                      </q-avatar>
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-weight-medium">{{ player.name }}</q-item-label>
                      <q-item-label caption>
                        <q-chip 
                          :label="`Level ${player.level}`" 
                          :color="getLevelColor(player.level)" 
                          text-color="white"
                          size="xs"
                          dense
                        />
                        <span class="q-ml-sm">{{ player.gamesPlayed }} games</span>
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <q-btn 
                        flat 
                        round 
                        color="negative" 
                        @click="removeFromQueue(player.name)" 
                        icon="remove_circle" 
                        size="sm"
                      />
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
              <q-btn 
                class="full-width" 
                color="primary" 
                @click="generateNewMatches" 
                label="Generate Matches" 
                size="lg"
                icon="shuffle"
                :disable="!canGenerateMatches()"
              />
              <div class="text-caption text-grey-6 q-mt-sm text-center">
                {{ getMatchGenerationHint() }}
              </div>
              
              <!-- Waiting Players Info -->
              <div v-if="queue.length > 0 && queue.length % 4 !== 0" class="q-mt-md">
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
            <q-card-section class="bg-positive text-white">
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
                      <div class="match-teams">
                        <!-- Team 1 -->
                        <div class="team team-1">
                          <q-chip 
                            :label="match[0].name" 
                            :color="getLevelColor(match[0].level)" 
                            text-color="white"
                            size="sm"
                            dense
                          />
                          <q-chip 
                            :label="match[1].name" 
                            :color="getLevelColor(match[1].level)" 
                            text-color="white"
                            size="sm"
                            dense
                          />
                        </div>
                        
                        <!-- VS -->
                        <div class="vs-divider">
                          <q-icon name="sports_tennis" color="grey-6" size="sm" />
                        </div>
                        
                        <!-- Team 2 -->
                        <div class="team team-2">
                          <q-chip 
                            :label="match[2].name" 
                            :color="getLevelColor(match[2].level)" 
                            text-color="white"
                            size="sm"
                            dense
                          />
                          <q-chip 
                            :label="match[3].name" 
                            :color="getLevelColor(match[3].level)" 
                            text-color="white"
                            size="sm"
                            dense
                          />
                        </div>
                      </div>
                    </q-item-section>
                    <q-item-section side>
                                             <q-btn 
                          flat 
                          color="positive" 
                          @click="openMatchResultDialog(index)" 
                          icon="emoji_events" 
                          size="sm"
                          round
                        />
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
      <q-card style="min-width: 400px">
        <q-card-section class="bg-primary text-white">
          <div class="text-h6">
            <q-icon name="person_add" class="q-mr-sm" />
            Add New Player
          </div>
        </q-card-section>
        <q-card-section>
          <div class="q-gutter-y-md">
            <q-input 
              v-model="newPlayerName" 
              label="Player Name" 
              type="text" 
              @keyup.enter="addNewPlayer"
              :rules="[val => !!val?.trim() || 'Player name is required']"
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
              :rules="[val => val !== null || 'Player level is required']"
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
          <q-btn 
            flat 
            label="Cancel" 
            @click="showAddPlayerDialog = false"
          />
          <q-btn 
            color="primary" 
            @click="addNewPlayer" 
            label="Add Player"
            :disable="!newPlayerName?.trim() || newPlayerLevel === null"
            icon="add"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Match Result Dialog -->
    <q-dialog v-model="showMatchResultDialog">
      <q-card style="min-width: 500px">
        <q-card-section class="bg-positive text-white">
          <div class="text-h6">
            <q-icon name="emoji_events" class="q-mr-sm" />
            Match Result
          </div>
        </q-card-section>
        <q-card-section>
          <div class="q-gutter-y-md">
            <div class="text-subtitle1 text-center q-mb-md">Who won this match?</div>
            
            <div class="row q-col-gutter-md">
              <!-- Team 1 -->
              <div class="col-6">
                <q-card 
                  :class="selectedWinner === 'team1' ? 'winner-selected' : ''"
                  @click="selectedWinner = 'team1'"
                  class="team-card cursor-pointer"
                  flat
                  bordered
                >
                  <q-card-section class="text-center">
                    <div class="text-weight-medium q-mb-sm">Team 1</div>
                    <q-chip 
                      :label="currentMatch[0].name" 
                      :color="getLevelColor(currentMatch[0].level)" 
                      text-color="white"
                      size="sm"
                      dense
                    />
                    <q-chip 
                      :label="currentMatch[1].name" 
                      :color="getLevelColor(currentMatch[1].level)" 
                      text-color="white"
                      size="sm"
                      dense
                    />
                  </q-card-section>
                </q-card>
              </div>
              
              <!-- Team 2 -->
              <div class="col-6">
                <q-card 
                  :class="selectedWinner === 'team2' ? 'winner-selected' : ''"
                  @click="selectedWinner = 'team2'"
                  class="team-card cursor-pointer"
                  flat
                  bordered
                >
                  <q-card-section class="text-center">
                    <div class="text-weight-medium q-mb-sm">Team 2</div>
                    <q-chip 
                      :label="currentMatch[2].name" 
                      :color="getLevelColor(currentMatch[2].level)" 
                      text-color="white"
                      size="sm"
                      dense
                    />
                    <q-chip 
                      :label="currentMatch[3].name" 
                      :color="getLevelColor(currentMatch[3].level)" 
                      text-color="white"
                      size="sm"
                      dense
                    />
                  </q-card-section>
                </q-card>
              </div>
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn 
            flat 
            label="Cancel" 
            @click="showMatchResultDialog = false"
          />
          <q-btn 
            color="positive" 
            @click="completeMatch" 
            label="Complete Match"
            :disable="selectedWinner === null"
            icon="check"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Settings Dialog -->
    <q-dialog v-model="showSettingsDialog">
      <q-card style="min-width: 400px">
        <q-card-section class="bg-primary text-white">
          <div class="text-h6">
            <q-icon name="settings" class="q-mr-sm" />
            Settings
          </div>
        </q-card-section>
        <q-card-section>
          <div class="q-gutter-y-md">
            <div>
              <q-btn 
                color="secondary" 
                @click="resetGamesPlayed" 
                icon="refresh" 
                label="Reset Games Played"
                class="full-width"
              />
            </div>
            <div>
              <q-btn 
                color="negative" 
                @click="resetAllData" 
                icon="delete_forever" 
                label="Reset All Data"
                class="full-width"
              />
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn 
            flat 
            label="Close" 
            @click="showSettingsDialog = false"
          />
        </q-card-actions>
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

  // Sort state
  const sortBy = ref<'gamesPlayed' | 'wins' | 'losses' | 'name'>('gamesPlayed');

  // Level options for select
  const levelOptions = [
    { label: 'Beginner', value: 1, description: 'New to the game' },
    { label: 'Intermediate', value: 2, description: 'Some experience' },
    { label: 'Advanced', value: 3, description: 'Experienced player' }
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
      case 1: return 'green';
      case 2: return 'orange';
      case 3: return 'red';
      default: return 'grey';
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
    
    // We can always generate matches if we have 4+ players
    // The algorithm will handle any combination intelligently
    return total >= 4;
  };

  const getMatchGenerationHint = (): string => {
    const total = queue.value.length;
    
    if (total < 4) return `Need ${4 - total} more players to generate matches`;
    
    const maxMatches = Math.floor(total / 4);
    const remainingPlayers = total % 4;
    
    if (remainingPlayers === 0) {
      return `Can generate ${maxMatches} match${maxMatches > 1 ? 'es' : ''}`;
    } else if (remainingPlayers === 1) {
      return `Can generate ${maxMatches} match${maxMatches > 1 ? 'es' : ''} (1 player will wait)`;
    } else if (remainingPlayers === 2) {
      return `Can generate ${maxMatches} match${maxMatches > 1 ? 'es' : ''} (2 players will wait)`;
    } else {
      return `Can generate ${maxMatches} match${maxMatches > 1 ? 'es' : ''} (3 players will wait)`;
    }
  };

  const getWaitingPlayersInfo = (): string => {
    const total = queue.value.length;
    const remainingPlayers = total % 4;
    
    if (remainingPlayers === 0) return '';
    
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
    
    // Calculate how many complete matches we can make
    const maxMatches = Math.floor(queueCopy.length / 4);
    
    for (let i = 0; i < maxMatches; i++) {
      const matchPlayers = queueCopy.splice(0, 4); // Take 4 players
      const match = createBalancedMatch(matchPlayers);
      matches.push(match);
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
  const generateTeamCombinations = (players: Player[]): Array<{team1: Player[], team2: Player[]}> => {
    const combinations: Array<{team1: Player[], team2: Player[]}> = [];
    
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

    const match = matches.value[currentMatchIndex.value];
    
    // Update games played for all players
    match.forEach(player => {
      const foundPlayer = players.value.find(p => p.name === player.name);
      if (foundPlayer) {
        foundPlayer.gamesPlayed++;
        
        // Update wins/losses based on team
        const playerIndex = match.findIndex(p => p.name === player.name);
        const isTeam1 = playerIndex < 2;
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
  };

  const removePlayer = (name: string) => {
    $q.dialog({
      title: 'Confirm Removal',
      message: `Are you sure you want to remove "${name}" from all lists?`,
      cancel: true,
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
    queue.value = queue.value.filter(player => player.name !== name);
    saveQueueToStorage(queue.value);
    
    $q.notify({
      type: 'info',
      message: `Player "${name}" removed from queue`,
      position: 'top'
    });
  };

  const resetGamesPlayed = () => {
    $q.dialog({
      title: 'Confirm Reset',
      message: 'Are you sure you want to reset all games played counters to zero?',
      ok: {
        label: 'Reset',
        color: 'negative'
      },
      cancel: {
        label: 'Cancel',
        color: 'grey'
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
      ok: {
        label: 'Reset All',
        color: 'negative'
      },
      cancel: {
        label: 'Cancel',
        color: 'grey'
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
</script>

<style lang="scss">
  .doubles-queue-page {
    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    min-height: 100vh;
  }

  .header-section {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 2rem 0;
    margin-bottom: 2rem;
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

  .card-content {
    height: 400px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
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
    gap: 1rem;
    flex-wrap: wrap;
  }

  .team {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
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
      padding: 1rem 0;
    }

    .match-teams {
      flex-direction: column;
      gap: 0.5rem;
    }

    .team {
      justify-content: center !important;
    }

    .vs-divider {
      transform: rotate(90deg);
    }

    .card-content {
      height: 300px;
    }

    .sort-select {
      min-width: 100px !important;
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
</style>
