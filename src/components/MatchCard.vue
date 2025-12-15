<template>
  <q-item class="match-item" @click="$emit('click', match)" clickable>
    <q-item-section>
      <!-- Match Layout: Status Left, Players Center, Court Right -->
      <div class="row items-center q-pa-sm">
        <!-- Left: Status -->
        <div class="col-auto q-mr-md">
          <q-chip :color="getMatchStatusColor(match.status)" text-color="white" size="sm" dense>
            {{ getMatchStatusLabel(match.status) }}
          </q-chip>
        </div>

        <!-- Center: Players -->
        <div class="col">
          <!-- Singles Match (2 players) -->
          <div v-if="match.players.length === 2" class="row items-center justify-center">
            <!-- Player 1 -->
            <div class="col text-center">
              <div class="column items-center q-mb-xs">
                <span class="text-weight-medium text-center">{{ match.players[0].name }}</span>
                <q-chip :label="`L${match.players[0].level}`" :color="getLevelColor(match.players[0].level)"
                  text-color="white" size="xs" dense />
              </div>
            </div>

            <!-- VS Separator -->
            <div class="col-auto">
              <q-icon name="sports_tennis" color="grey-6" size="sm" class="q-mx-md" />
            </div>

            <!-- Player 2 -->
            <div class="col text-center">
              <div class="column items-center q-mb-xs">
                <span class="text-weight-medium text-center">{{ match.players[1].name }}</span>
                <q-chip :label="`L${match.players[1].level}`" :color="getLevelColor(match.players[1].level)"
                  text-color="white" size="xs" dense />
              </div>
            </div>
          </div>

          <!-- Doubles Match (4 players) -->
          <div v-else class="row items-center justify-center">
            <!-- Team 1 -->
            <div class="col text-center">
              <div v-for="player in match.players.slice(0, 2)" :key="player.name" class="column items-center q-mb-xs">
                <span class="text-weight-medium text-center">{{ player.name }}</span>
                <q-chip :label="`L${player.level}`" :color="getLevelColor(player.level)" text-color="white" size="xs"
                  dense />
              </div>
            </div>

            <!-- VS Separator -->
            <div class="col-auto">
              <q-icon name="sports_tennis" color="grey-6" size="sm" class="q-mx-md" />
            </div>

            <!-- Team 2 -->
            <div class="col text-center">
              <div v-for="player in match.players.slice(2, 4)" :key="player.name" class="column items-center q-mb-xs">
                <span class="text-weight-medium text-center">{{ player.name }}</span>
                <q-chip :label="`L${player.level}`" :color="getLevelColor(player.level)" text-color="white" size="xs"
                  dense />
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Court -->
        <div class="col-auto q-ml-md">
          <q-chip v-if="match.court" color="blue-grey-6" text-color="white" size="sm" dense>
            Court {{ match.court }}
          </q-chip>
        </div>
      </div>
    </q-item-section>

    <q-item-section side v-if="showActions">
      <q-btn color="grey-7" icon="more_vert" flat round size="sm">
        <q-menu>
          <q-list style="min-width: 150px">
            <q-item v-if="match.status === 'in-progress'" clickable @click="$emit('completeMatch')">
              <q-item-section avatar>
                <q-icon name="emoji_events" />
              </q-item-section>
              <q-item-section>Complete Match</q-item-section>
            </q-item>

            <q-item clickable @click="$emit('editMatch')">
              <q-item-section avatar>
                <q-icon name="edit" />
              </q-item-section>
              <q-item-section>Edit Match</q-item-section>
            </q-item>

            <q-item v-if="!match.court && availableCourts > 0" clickable @click="$emit('assignCourt')">
              <q-item-section avatar>
                <q-icon name="sports_tennis" />
              </q-item-section>
              <q-item-section>Assign Court</q-item-section>
            </q-item>

            <q-item v-if="match.court" clickable @click="$emit('changeCourt')">
              <q-item-section avatar>
                <q-icon name="swap_horiz" />
              </q-item-section>
              <q-item-section>Change Court</q-item-section>
            </q-item>

            <q-item v-if="match.status === 'waiting' && match.court && isCourtAvailable" clickable
              @click="$emit('startMatch')">
              <q-item-section avatar>
                <q-icon name="play_arrow" />
              </q-item-section>
              <q-item-section>Start Match</q-item-section>
            </q-item>

            <q-separator />

            <q-item clickable @click="$emit('cancelMatch')" class="text-negative">
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
</template>

<script setup lang="ts">
import {
  getLevelColor,
  getMatchStatusColor,
  getMatchStatusLabel
} from '../utils/playerHelpers';

// Player interface
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

interface Match {
  id: string;
  players: Player[];
  status: 'waiting' | 'in-progress' | 'completed';
  court?: number;
  order: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

interface Props {
  match: Match;
  showActions?: boolean;
  availableCourts?: number;
}

withDefaults(defineProps<Props>(), {
  showActions: true,
  availableCourts: 0
});

defineEmits<{
  click: [match: Match];
  completeMatch: [];
  editMatch: [];
  assignCourt: [];
  changeCourt: [];
  startMatch: [];
  cancelMatch: [];
}>();

// Helper function to check if court is available
const isCourtAvailable = (): boolean => {
  // This would need to be passed as a prop or injected
  // For now, returning true as placeholder
  return true;
};
</script>

<style lang="scss" scoped>
.match-item {
  transition: background-color 0.2s ease;

  &:hover {
    background-color: rgba(0, 0, 0, 0.02);
  }
}
</style>
