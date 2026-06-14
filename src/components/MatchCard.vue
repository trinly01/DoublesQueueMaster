<template>
  <q-item class="match-item" @click="$emit('click', match)" clickable>
    <q-item-section>
      <!-- Match Layout: Players split around center (status+court+icon) -->
      <div class="row items-center q-pa-sm no-wrap">
        <!-- Left: Team A players -->
        <div class="col text-center">
          <div
            v-for="player in match.teamA"
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
              :label="player.rating"
              :color="getRatingColor(player.rating)"
              text-color="white"
              size="xs"
              dense
            />
          </div>
        </div>

        <!-- Center: Status + Icon + Court stacked -->
        <div class="col-auto q-mx-md center-group">
          <q-chip
            v-if="match.court"
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
              >{{ match.court }}</q-avatar
            >
          </q-chip>
          <span class="text-caption text-grey-6">
            {{
              match.winProbability !== undefined
                ? (match.winProbability * 100).toFixed(0)
                : ''
            }}%
            <q-icon name="sports_tennis" color="grey-6" size="sm" />
            {{
              match.winProbability !== undefined
                ? ((1 - match.winProbability) * 100).toFixed(0)
                : ''
            }}%
          </span>
          <q-chip
            :color="getMatchStatusColor(match.status)"
            text-color="white"
            size="sm"
            dense
          >
            {{ getMatchStatusLabel(match.status) }}
          </q-chip>
          <span
            v-if="match.status === 'in-progress' && match.startedAt"
            class="text-caption text-grey-7"
          >
            {{ elapsed }}
          </span>
        </div>

        <!-- Right: Team B players -->
        <div class="col text-center">
          <div
            v-for="player in match.teamB"
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
              :label="player.rating"
              :color="getRatingColor(player.rating)"
              text-color="white"
              size="xs"
              dense
            />
          </div>
        </div>
      </div>
      <!-- <div
        v-if="match.winProbability !== undefined"
        class="text-center text-caption q-mt-xs row justify-center q-gutter-xs"
      >
        <q-chip
          :color="getForecastColor(match.winProbability)"
          text-color="white"
          size="xs"
          dense
        >
          {{ (match.winProbability * 100).toFixed(0) }}%
        </q-chip>
        <span class="text-grey-6">vs</span>
        <q-chip
          :color="getForecastColor(1 - match.winProbability)"
          text-color="white"
          size="xs"
          dense
        >
          {{ ((1 - match.winProbability) * 100).toFixed(0) }}%
        </q-chip>
      </div>
      <div
        v-if="match.expectedDifference !== undefined"
        class="text-center text-caption text-grey-6 q-mt-xs"
      >
        Balance diff: {{ match.expectedDifference.toFixed(1) }} rating pts
        <span v-if="match.winProbability !== undefined">
          {{ (match.winProbability * 100).toFixed(0) }} |
          {{ ((1 - match.winProbability) * 100).toFixed(0) }}
        </span>
      </div> -->
    </q-item-section>

    <q-item-section side v-if="showActions && !isReadOnlyMode">
      <q-btn color="grey-7" icon="more_vert" flat round size="sm">
        <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
          >Options</q-tooltip
        >
        <q-menu>
          <q-list style="min-width: 150px">
            <q-item
              v-if="match.status === 'in-progress'"
              clickable
              @click="$emit('completeMatch')"
            >
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

            <q-item
              v-if="!match.court && availableCourts > 0"
              clickable
              @click="$emit('assignCourt')"
            >
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

            <q-item
              v-if="
                match.status === 'waiting' && match.court && isCourtAvailable
              "
              clickable
              @click="$emit('startMatch')"
            >
              <q-item-section avatar>
                <q-icon name="play_arrow" />
              </q-item-section>
              <q-item-section>Start Match</q-item-section>
            </q-item>

            <q-separator />

            <q-item
              clickable
              @click="$emit('cancelMatch')"
              class="text-negative"
            >
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
import { inject, ref, onUnmounted, watch } from 'vue';
import {
  getRatingColor,
  getMatchStatusColor,
  getMatchStatusLabel,
} from '../utils/playerHelpers';

const isReadOnlyMode = inject('isReadOnlyMode', false);

// Player interface (matches matchmaking.ts Player)
interface Player {
  username: string;
  name?: string;
  firstName?: string;
  level: 1 | 2 | 3;
  rating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  priority?: string;
  userId?: string;
}

interface Match {
  id: string;
  teamA: Player[];
  teamB: Player[];
  players?: Player[];
  status: 'waiting' | 'in-progress' | 'completed';
  court?: number;
  order: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  queueSource?: string;
  expectedDifference?: number;
  winProbability?: number;
}

interface Props {
  match: Match;
  showActions?: boolean;
  availableCourts?: number;
  isCourtAvailable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showActions: true,
  availableCourts: 0,
  isCourtAvailable: true,
});

const elapsed = ref('');
let timer: ReturnType<typeof setInterval> | null = null;

const updateElapsed = () => {
  if (!props.match.startedAt) {
    elapsed.value = '';
    return;
  }
  const diff = Date.now() - props.match.startedAt.getTime();
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  elapsed.value = `${mins}m ${secs}s`;
};

const startTimer = () => {
  if (timer) return;
  updateElapsed();
  timer = setInterval(updateElapsed, 1000);
};

const stopTimer = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

watch(
  () => [props.match.status, props.match.startedAt?.getTime()],
  () => {
    if (props.match.status === 'in-progress' && props.match.startedAt) {
      startTimer();
    } else {
      stopTimer();
      elapsed.value = '';
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  stopTimer();
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
