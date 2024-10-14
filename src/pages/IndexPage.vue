<template>
  <q-page class="q-pa-md">
    <div class="q-gutter-md">
      <!-- Title and Button to Generate Matches -->
      <div class="row items-center justify-between q-mb-md">
        <h3>Matchmaking System (Doubles)</h3>
      </div>

      <!-- Add Player Form -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-h6">Add New Player</div>
        </q-card-section>
        <q-card-section>
          <q-input v-model="newPlayerName" label="Player Name" type="text" class="q-mb-md" />
          <q-select v-model="newPlayerLevel" :options="[1, 2, 3]" label="Player Level" class="q-mb-md" />
          <q-btn color="positive" @click="addNewPlayer" label="Add Player" />
        </q-card-section>
      </q-card>

      <!-- Players Section -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section class="row">
          <div class="text-h6">Players Added </div>
          <q-space />
          <q-btn color="secondary" @click="resetGamesPlayed" icon="refresh" />
        </q-card-section>
        <q-card-section>
          <q-list bordered>
            <q-item v-for="player in players" :key="player.name" class="q-pa-xs">
              <q-item-section>
                <q-chip class="q-mr-sm">
                  <q-avatar :color="getLevelColor(player.level)" text-color="white">{{ player.gamesPlayed }}</q-avatar>
                  {{ player.name }}
                </q-chip>
              </q-item-section>
              <q-item-section side class="row">
                <div>
                  <q-btn flat round color="negative" @click="removePlayer(player.name)" icon="delete" />
                  <q-btn flat color="secondary" @click="requeuePlayer(player.name)" icon="add_to_queue"
                    label="Requeue" />
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>

      <!-- Queue Section -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-h6">Players Queue</div>
        </q-card-section>

        <q-card-section>
          <q-list bordered>
            <q-item v-for="player in queue" :key="player.name" class="q-pa-xs">
              <q-item-section>
                <q-chip class="q-mr-sm" removable @remove="removeFromQueue(player.name)">
                  <q-avatar :color="getLevelColor(player.level)" text-color="white">{{ player.gamesPlayed }}</q-avatar>
                  {{ player.name }}
                </q-chip>
              </q-item-section>
            </q-item>
          </q-list>
          <q-btn class="q-mt-md" color="primary" @click="generateNewMatches" label="Generate Matches" />
        </q-card-section>
      </q-card>

      <!-- Matches Section -->
      <q-card flat bordered>
        <q-card-section>
          <div class="text-h6">Current Matches</div>
        </q-card-section>

        <q-card-section>
          <q-list bordered>
            <q-item v-for="(match, index) in matches" :key="index" class="q-pa-xs">
              <q-item-section>
                <div>
                  <!-- Team 1 -->
                  <q-chip :label="match[0].name" :color="getLevelColor(match[0].level)" text-color="white"
                    class="q-mr-sm" />
                  <q-chip :label="match[1].name" :color="getLevelColor(match[1].level)" text-color="white"
                    class="q-mr-sm" />
                  vs
                  <!-- Team 2 -->
                  <q-chip :label="match[2].name" :color="getLevelColor(match[2].level)" text-color="white"
                    class="q-ml-sm" />
                  <q-chip :label="match[3].name" :color="getLevelColor(match[3].level)" text-color="white"
                    class="q-ml-sm" />
                </div>
              </q-item-section>

              <q-item-section side>
                <q-btn flat color="negative" @click="markMatchAsDone(index)" icon="done" label="Done" />
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup lang="ts">
  import { ref } from 'vue';

  // Player type
  interface Player {
    name: string;
    level: 1 | 2 | 3;
    gamesPlayed: number;
  }

  // State: Players, Queue, and Matches
  const players = ref<Player[]>(getPlayersFromStorage());
  const queue = ref<Player[]>(getQueueFromStorage()); // Initialize queue from localStorage
  const matches = ref<Player[][]>(getMatchesFromStorage());
  const newPlayerName = ref<string | null>(null);
  const newPlayerLevel = ref<1 | 2 | 3 | null>(null);

  // Function to determine the color of the chip based on player level
  const getLevelColor = (level: 1 | 2 | 3): string => {
    switch (level) {
      case 1:
        return 'green';
      case 2:
        return 'orange';
      case 3:
        return 'red';
      default:
        return 'gray';
    }
  };

  // Load players from localStorage
  function getPlayersFromStorage(): Player[] {
    const players = localStorage.getItem('playerList');
    return players ? JSON.parse(players) : [];
  }

  // Load queue from localStorage
  function getQueueFromStorage(): Player[] {
    const queue = localStorage.getItem('playerQueue');
    return queue ? JSON.parse(queue) : [];
  }

  // Load matches from localStorage
  function getMatchesFromStorage(): Player[][] {
    const matches = localStorage.getItem('matches');
    return matches ? JSON.parse(matches) : [];
  }

  // Save players to localStorage
  function savePlayersToStorage(players: Player[]): void {
    localStorage.setItem('playerList', JSON.stringify(players));
  }

  // Save queue to localStorage
  function saveQueueToStorage(queue: Player[]): void {
    localStorage.setItem('playerQueue', JSON.stringify(queue));
  }

  // Save matches to localStorage
  function saveMatchesToStorage(matches: Player[][]): void {
    localStorage.setItem('matches', JSON.stringify(matches));
  }

  // Add new player
  const addNewPlayer = () => {
    if (newPlayerName.value && newPlayerLevel.value !== null) {
      const newPlayer: Player = {
        name: newPlayerName.value,
        level: newPlayerLevel.value,
        gamesPlayed: 0,
      };

      // Add player to players list and queue
      players.value.push(newPlayer);
      queue.value.push(newPlayer);

      // Save to localStorage
      savePlayersToStorage(players.value);
      saveQueueToStorage(queue.value); // Save queue

      // Reset form inputs
      newPlayerName.value = null;
      newPlayerLevel.value = null;
    }
  };

  // Generate matches from the queue
  const generateMatches = (): Player[][] => {
    const matches: Player[][] = [];
    const queueCopy = [...queue.value];

    // Separate players by levels
    const level1Players = queueCopy.filter(p => p.level === 1);
    const higherLevelPlayers = queueCopy.filter(p => p.level > 1);

    // Match level 1 players with level 2 or 3 players (doubles format)
    while (level1Players.length > 0) {
      const player1 = level1Players.shift(); // Get the first player from level 1
      const teammate1 = higherLevelPlayers.shift(); // Get the first higher level player
      const player2 = level1Players.shift(); // Get the next player from level 1
      const teammate2 = higherLevelPlayers.shift(); // Get the next higher level player

      // Ensure that all players are unique
      if (player1 && teammate1 && player2 && teammate2) {
        matches.push([player1, teammate1, player2, teammate2]);

        // Remove players from queue after matching
        queue.value = queue.value.filter(p => ![player1.name, teammate1.name, player2.name, teammate2.name].includes(p.name));
      } else {
        break; // Break if there are not enough players to match
      }
    }

    // Handle remaining level 2 and 3 players in doubles
    while (higherLevelPlayers.length >= 4) {
      const player1 = higherLevelPlayers.shift()!;
      const teammate1 = higherLevelPlayers.shift()!;
      const player2 = higherLevelPlayers.shift()!;
      const teammate2 = higherLevelPlayers.shift()!;

      matches.push([player1, teammate1, player2, teammate2]);

      // Remove players from queue after matching
      queue.value = queue.value.filter(p => ![player1.name, teammate1.name, player2.name, teammate2.name].includes(p.name));
    }

    return matches;
  };

  // Generate new matches
  const generateNewMatches = () => {
    const newMatches = generateMatches();
    matches.value = [...matches.value, ...newMatches];
    saveQueueToStorage(queue.value);
    saveMatchesToStorage(matches.value); // Save matches to localStorage
  };

  // Mark match as done
  const markMatchAsDone = (index: number) => {
    const match = matches.value[index];

    // Increment gamesPlayed for each player in the match
    match.forEach(player => {
      const foundPlayer = players.value.find(p => p.name === player.name);
      if (foundPlayer) {
        foundPlayer.gamesPlayed++;
      }
    });

    // Remove match from list
    matches.value.splice(index, 1);

    // Save updated state to localStorage
    saveMatchesToStorage(matches.value);
    savePlayersToStorage(players.value); // Save updated players to localStorage
  };

  // Remove player from the players list and the queue
  const removePlayer = (name: string) => {
    // Remove player from players array
    players.value = players.value.filter(player => player.name !== name);
    // Remove player from the queue
    queue.value = queue.value.filter(player => player.name !== name);
    savePlayersToStorage(players.value); // Save updated players to localStorage
    saveQueueToStorage(queue.value); // Save updated queue to localStorage
  };

  // Remove player from the queue
  const removeFromQueue = (name: string) => {
    queue.value = queue.value.filter(player => player.name !== name);
    saveQueueToStorage(queue.value); // Save updated queue to localStorage
  };

  // Reset games played for all players
  const resetGamesPlayed = () => {
    players.value.forEach(player => {
      player.gamesPlayed = 0;
    });
    savePlayersToStorage(players.value); // Save updated players to localStorage
  };

  // Requeue player
  const requeuePlayer = (name: string) => {
    const player = players.value.find(p => p.name === name);
    if (player) {
      queue.value.push(player); // Requeue the player to the back of the queue
      saveQueueToStorage(queue.value); // Save updated queue to localStorage
    }
  };
</script>

<style lang="scss">
  .q-page {
    max-width: 600px;
    margin: 0 auto;
  }
</style>
