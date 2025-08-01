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
                <q-btn 
                  color="white" 
                  @click="showAddPlayerDialog = true" 
                  icon="person_add" 
                  flat
                  round
                  dense
                />
              </div>
            </q-card-section>
            <q-card-section class="q-pa-none">
              <q-list separator>
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
                      <span class="q-ml-sm">{{ player.gamesPlayed }} games</span>
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
              <q-list separator>
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

        <!-- Right Column: Current Matches -->
        <div class="col-12 col-md-4">
          <q-card class="matches-card" flat bordered>
            <q-card-section class="bg-positive text-white">
              <div class="text-h6">
                <q-icon name="sports_tennis" class="q-mr-sm" />
                Current Matches ({{ matches.length }})
              </div>
            </q-card-section>
            <q-card-section class="q-pa-none">
              <q-list separator>
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
                      @click="markMatchAsDone(index)" 
                      icon="check_circle" 
                      size="sm"
                      round
                    />
                  </q-item-section>
                </q-item>
              </q-list>
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

  // Level options for select
  const levelOptions = [
    { label: 'Beginner', value: 1, description: 'New to the game' },
    { label: 'Intermediate', value: 2, description: 'Some experience' },
    { label: 'Advanced', value: 3, description: 'Experienced player' }
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
      // Sort by games played (ascending) then by name
      if (a.gamesPlayed !== b.gamesPlayed) {
        return a.gamesPlayed - b.gamesPlayed;
      }
      return a.name.localeCompare(b.name);
    });
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
    return players ? JSON.parse(players) : [];
  }

  function getQueueFromStorage(): Player[] {
    const queue = localStorage.getItem('playerQueue');
    return queue ? JSON.parse(queue) : [];
  }

  function getMatchesFromStorage(): Player[][] {
    const matches = localStorage.getItem('matches');
    return matches ? JSON.parse(matches) : [];
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

  // Helper function to create balanced teams from 4 players
  const createBalancedMatch = (players: Player[]): Player[] => {
    // Sort players by level for better team balancing
    const sortedPlayers = [...players].sort((a, b) => a.level - b.level);
    
    // Create teams with intelligent balancing
    const team1: Player[] = [];
    const team2: Player[] = [];
    
    // Strategy: Distribute players to balance team skill levels
    // Take players from both ends to create balanced teams
    while (sortedPlayers.length > 0) {
      if (team1.length < 2) {
        team1.push(sortedPlayers.shift()!); // Take lowest level player
      } else if (team2.length < 2) {
        team2.push(sortedPlayers.shift()!); // Take next player
      }
    }
    
    // Calculate team skill levels for final balancing
    const team1Skill = team1.reduce((sum, p) => sum + p.level, 0);
    const team2Skill = team2.reduce((sum, p) => sum + p.level, 0);
    
    // If teams are too unbalanced, try to swap players
    if (Math.abs(team1Skill - team2Skill) > 2) {
      // Try swapping players to balance teams
      for (let i = 0; i < team1.length; i++) {
        for (let j = 0; j < team2.length; j++) {
          const newTeam1Skill = team1Skill - team1[i].level + team2[j].level;
          const newTeam2Skill = team2Skill - team2[j].level + team1[i].level;
          
          if (Math.abs(newTeam1Skill - newTeam2Skill) < Math.abs(team1Skill - team2Skill)) {
            // Swap players
            [team1[i], team2[j]] = [team2[j], team1[i]];
            return [...team1, ...team2];
          }
        }
      }
    }
    
    return [...team1, ...team2];
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

  const markMatchAsDone = (index: number) => {
    const match = matches.value[index];
    match.forEach(player => {
      const foundPlayer = players.value.find(p => p.name === player.name);
      if (foundPlayer) {
        foundPlayer.gamesPlayed++;
      }
    });

    matches.value.splice(index, 1);
    saveMatchesToStorage(matches.value);
    savePlayersToStorage(players.value);

    $q.notify({
      type: 'positive',
      message: 'Match completed! Games played updated.',
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
  }

  // Custom scrollbar
  .q-list {
    max-height: 400px;
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
