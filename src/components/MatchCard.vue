<template>
  <q-item class="match-item" @click="$emit('click', match)" clickable>
    <q-item-section>
      <!-- Match Layout: Players split around center (status+court+icon) -->
      <div class="row items-center q-pa-sm no-wrap">
        <!-- Left: Team A players -->
        <div class="col text-center">
          <div v-for="player in match.teamA" :key="player.username" class="column items-center q-mb-xs">
            <span class="text-weight-medium text-center">{{
              player.username
            }}</span>
            <q-chip :label="`L${player.level}`" :color="getLevelColor(player.level)" text-color="white" size="xs"
              dense />
          </div>
        </div>

        <!-- Center: Status + Icon + Court stacked -->
        <div class="col-auto q-mx-md center-group">
          <q-chip v-if="match.court" color="blue-grey-7" text-color="white" size="sm" dense>
            Court
            <q-avatar color="blue-grey-9" style="left: 10px" dense size="xs" rounded text-color="white">{{ match.court
              }}</q-avatar>
          </q-chip>
          <q-icon name="sports_tennis" color="grey-6" size="sm" />
          <q-chip :color="getMatchStatusColor(match.status)" text-color="white" size="sm" dense>
            {{ getMatchStatusLabel(match.status) }}
          </q-chip>
        </div>

        <!-- Right: Team B players -->
        <div class="col text-center">
          <div v-for="player in match.teamB" :key="player.username" class="column items-center q-mb-xs">
            <span class="text-weight-medium text-center">{{
              player.username
            }}</span>
            <q-chip :label="`L${player.level}`" :color="getLevelColor(player.level)" text-color="white" size="xs"
              dense />
          </div>
        </div>
      </div>
      <div v-if="match.expectedDifference !== undefined" class="text-center text-caption text-grey-6 q-mt-xs">
        Balance diff: {{ match.expectedDifference.toFixed(1) }} rating pts
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

            <q-item v-if="
              match.status === 'waiting' && match.court && isCourtAvailable
            " clickable @click="$emit('startMatch')">
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
  getMatchStatusLabel,
} from '../utils/playerHelpers';

// Player interface
interface Player {
  username: string;
  level: 1 | 2 | 3;
  rating: number;
  matchesPlayed: number;
}

interface Match {
  id: string;
  teamA: Player[];
  teamB: Player[];
  status: 'waiting' | 'in-progress' | 'completed';
  court?: number;
  order: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  expectedDifference?: number;
}

interface Props {
  match: Match;
  showActions?: boolean;
  availableCourts?: number;
}

withDefaults(defineProps<Props>(), {
  showActions: true,
  availableCourts: 0,
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

  // Center group (status + icon + court) vertical stack
  .center-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    line-height: 1;

    .q-chip {
      margin: 0;
    }

    .q-icon {
      margin: 0;
      font-size: 1rem;
    }
  }

  // Court chip styling
  .court-chip {
    font-size: 0.75rem;
    min-height: 20px;
  }

  // Mobile adjustments
  @media (max-width: 768px) {
    .center-group {
      .q-chip {
        font-size: 0.7rem;
        min-height: 18px;
        padding: 0 5px;
      }

      .q-icon {
        font-size: 0.8rem;
        margin: 0;
      }

      .court-avatar {
        font-size: 0.7rem;
        min-width: 22px;
        min-height: 22px;
      }
    }

    // Reduce player level chip size
    .q-chip--size-xs {
      font-size: 0.6rem;
      min-height: 14px;
      padding: 0 3px;
    }

    // Compact player names
    .text-weight-medium {
      font-size: 0.8rem;
    }
  }
}
</style>
