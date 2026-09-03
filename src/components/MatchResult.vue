<template>
  <div class="match-result">
    <!-- Match Layout: Players split around center (metadata) -->
    <div class="row items-center q-pa-sm no-wrap">
      <!-- Left: Team A players -->
      <div class="col text-center">
        <div
          v-for="player in teamA"
          :key="player.username"
          class="column items-center q-mb-xs"
        >
          <span
            :class="[
              'text-weight-medium text-center player-name',
              isBlurred(player.username) ? 'stats-blur' : '',
            ]"
          >
            {{
              blurText(
                player.firstName || player.name || player.username,
                player.username,
              )
            }}
          </span>
          <span
            v-if="player.username && (player.firstName || player.name)"
            :class="[
              'text-grey-6 player-username',
              isBlurred(player.username) ? 'stats-blur' : '',
            ]"
          >
            @{{ blurText(player.username, player.username) }}
          </span>
          <q-chip
            v-if="player.rating !== undefined"
            :label="player.rating"
            :color="getRatingColor(player.rating)"
            text-color="white"
            size="xs"
            dense
            :class="{ 'stats-blur': isBlurred(player.username) }"
          />
        </div>

        <!-- Editable: score input -->
        <q-input
          v-if="editable"
          ref="teamAInput"
          v-model.number="localTeamAScore"
          type="number"
          inputmode="numeric"
          pattern="[0-9]*"
          label="Score"
          outlined
          class="q-mt-sm score-input"
          input-class="text-h4 text-center"
          style="margin-left: auto; margin-right: auto"
        />
        <div
          v-if="
            editable &&
            status === 'in-progress' &&
            !localTeamAScore &&
            !localTeamBScore
          "
          class="row justify-center q-gutter-sm"
          style="margin-top: 2px"
        >
          <q-btn
            v-for="s in quickScores"
            :key="s"
            size="xs"
            :label="String(s)"
            color="accent"
            @click="setTeamAScore(s)"
          />
        </div>
      </div>

      <!-- Center: Win Probability + Live elapsed + Scores + VS -->
      <div class="col-auto text-center center-group">
        <!-- Editable: win probability on top, live elapsed below -->
        <div
          v-if="editable && winProbability !== undefined"
          class="text-caption text-grey-6"
          style="line-height: 1"
        >
          {{ (winProbability * 100).toFixed(0) }}%
          <q-icon name="sports_tennis" color="grey-6" size="sm" />
          {{ ((1 - winProbability) * 100).toFixed(0) }}%
        </div>
        <q-chip
          v-if="editable && status === 'in-progress' && startedAt"
          dense
          rounded
          class="live-chip bg-amber-2 text-amber-10"
        >
          <q-avatar
            class="live-dot-avatar"
            color="amber-7"
            text-color="white"
            size="14px"
          >
            <span class="live-dot-inner" />
          </q-avatar>
          {{ elapsedTime }}
        </q-chip>
        <!-- Read-only: scores + probability in aligned grid -->
        <div
          v-if="
            !editable && teamAScore !== undefined && teamBScore !== undefined
          "
          class="q-mt-xs score-grid"
          style="
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            gap: 0 clamp(0.5rem, 4vw, 1.5rem);
            line-height: 1;
            margin-bottom: 0;
          "
        >
          <div class="text-center" style="line-height: 1">
            <div class="text-h5 text-weight-bold" style="line-height: 1">
              {{ teamAScore }}
            </div>
            <div
              v-if="winProbability !== undefined"
              class="text-caption text-grey-6"
              style="line-height: 1; margin-top: 0"
            >
              {{ (winProbability * 100).toFixed(0) }}%
            </div>
          </div>
          <div class="text-center">
            <span class="text-subtitle2 text-weight-bold text-grey-8">VS</span>
          </div>
          <div class="text-center" style="line-height: 1">
            <div class="text-h5 text-weight-bold" style="line-height: 1">
              {{ teamBScore }}
            </div>
            <div
              v-if="winProbability !== undefined"
              class="text-caption text-grey-6"
              style="line-height: 1; margin-top: 0"
            >
              {{ ((1 - winProbability) * 100).toFixed(0) }}%
            </div>
          </div>
        </div>
        <div
          v-if="completedAt"
          :class="[
            'text-caption text-grey-6 text-center q-mt-xs',
            blurDate ? 'stats-blur' : '',
          ]"
        >
          {{ formatDate(completedAt) }}
        </div>
        <div v-if="startedAt && completedAt" class="text-center q-mt-xs">
          <q-badge
            rounded
            color="amber-6"
            text-color="black"
            class="text-caption"
          >
            {{ formatDuration(startedAt, completedAt) }}
          </q-badge>
        </div>
      </div>

      <!-- Right: Team B players -->
      <div class="col text-center">
        <div
          v-for="player in teamB"
          :key="player.username"
          class="column items-center q-mb-xs"
        >
          <span
            :class="[
              'text-weight-medium text-center player-name',
              isBlurred(player.username) ? 'stats-blur' : '',
            ]"
          >
            {{
              blurText(
                player.firstName || player.name || player.username,
                player.username,
              )
            }}
          </span>
          <span
            v-if="player.username && (player.firstName || player.name)"
            :class="[
              'text-grey-6 player-username',
              isBlurred(player.username) ? 'stats-blur' : '',
            ]"
          >
            @{{ blurText(player.username, player.username) }}
          </span>
          <q-chip
            v-if="player.rating !== undefined"
            :label="player.rating"
            :color="getRatingColor(player.rating)"
            text-color="white"
            size="xs"
            dense
            :class="{ 'stats-blur': isBlurred(player.username) }"
          />
        </div>

        <!-- Editable: score input -->
        <q-input
          v-if="editable"
          ref="teamBInput"
          v-model.number="localTeamBScore"
          type="number"
          inputmode="numeric"
          pattern="[0-9]*"
          label="Score"
          outlined
          class="q-mt-sm score-input"
          input-class="text-h4 text-center"
          style="margin-left: auto; margin-right: auto"
        />
        <div
          v-if="
            editable &&
            status === 'in-progress' &&
            !localTeamAScore &&
            !localTeamBScore
          "
          class="row justify-center q-gutter-sm"
          style="margin-top: 2px"
        >
          <q-btn
            v-for="s in quickScores"
            :key="s"
            size="xs"
            :label="String(s)"
            color="accent"
            @click="setTeamBScore(s)"
          />
        </div>
      </div>
    </div>
    <MatchMetaChips :meta="meta" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import type { QInput } from 'quasar';
import type { MatchMeta } from '../types/matchMeta';
import type { TeamPlayer } from '../types/player';
import { getRatingColor, formatDate } from '../utils/playerHelpers';
import MatchMetaChips from './MatchMetaChips.vue';

const props = withDefaults(
  defineProps<{
    teamA: TeamPlayer[];
    teamB: TeamPlayer[];
    teamAScore?: number;
    teamBScore?: number;
    winProbability?: number;
    status?: string;
    editable?: boolean;
    startedAt?: string;
    completedAt?: string;
    blurExceptUsername?: string;
    blurDate?: boolean;
    meta?: MatchMeta;
  }>(),
  {
    editable: false,
  },
);

const isBlurred = (playerUsername: string): boolean => {
  if (!props.blurExceptUsername) return false;
  return playerUsername !== props.blurExceptUsername;
};

const blurText = (text: string, playerUsername: string): string => {
  if (!isBlurred(playerUsername)) return text;
  return text.replace(/./g, '*');
};

const emit = defineEmits<{
  'update:teamAScore': [value: number];
  'update:teamBScore': [value: number];
}>();

const localTeamAScore = computed({
  get: () => props.teamAScore ?? 0,
  set: (val) => emit('update:teamAScore', val),
});

const quickScores = [11, 15, 21];
const teamAInput = ref<QInput | null>(null);
const teamBInput = ref<QInput | null>(null);

const setTeamAScore = (s: number) => {
  localTeamAScore.value = s;
  localTeamBScore.value = 0;
  teamBInput.value?.focus();
  teamBInput.value?.select();
};

const setTeamBScore = (s: number) => {
  localTeamBScore.value = s;
  localTeamAScore.value = 0;
  teamAInput.value?.focus();
  teamAInput.value?.select();
};

const localTeamBScore = computed({
  get: () => props.teamBScore ?? 0,
  set: (val) => emit('update:teamBScore', val),
});

const formatDuration = (startIso: string, endIso: string): string => {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const diff = Math.max(0, end - start);
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}m ${secs}s`;
};

// Live elapsed-time chip for in-progress matches in the editable dialog
const elapsedTime = ref('');
let elapsedTimer: ReturnType<typeof setInterval> | null = null;

const updateElapsedTime = () => {
  if (!props.startedAt) {
    elapsedTime.value = '';
    return;
  }
  const diff = Math.max(0, Date.now() - new Date(props.startedAt).getTime());
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  elapsedTime.value = `${mins}m ${secs}s`;
};

const startElapsedTimer = () => {
  if (elapsedTimer) return;
  updateElapsedTime();
  elapsedTimer = setInterval(updateElapsedTime, 1000);
};

const stopElapsedTimer = () => {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
};

watch(
  () => [props.editable, props.status, props.startedAt],
  () => {
    if (props.editable && props.status === 'in-progress' && props.startedAt) {
      startElapsedTimer();
    } else {
      stopElapsedTimer();
      elapsedTime.value = '';
    }
  },
  { immediate: true },
);

onUnmounted(() => stopElapsedTimer());
</script>

<style lang="scss" scoped>
.match-result {
  overflow-x: hidden;

  // Allow flex cols to shrink below intrinsic content width
  .row > .col {
    min-width: 0;
    overflow: hidden;
  }

  .score-input {
    max-width: clamp(80px, 30vw, 120px);
    min-width: 0;
  }

  .player-name {
    width: 100%;
    max-width: clamp(50px, 22vw, 80px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .player-username {
    font-size: clamp(8px, 2.5vw, 10px);
    width: 100%;
    max-width: clamp(50px, 22vw, 80px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .center-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    line-height: 1;
    margin-left: clamp(4px, 4vw, 16px);
    margin-right: clamp(4px, 4vw, 16px);

    .q-chip {
      margin: 0;
    }

    .q-icon {
      margin: 0;
      font-size: 1rem;
    }

    .live-chip {
      margin: 0;
    }

    .live-dot-avatar {
      margin-left: -2px;
      margin-right: 4px;
    }

    .live-dot-inner {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: #fff;
      animation: live-dot-pulse 2s ease-in-out infinite;
    }
  }
}

@keyframes live-dot-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.8);
  }
}

@media (max-width: 768px) {
  .match-result {
    .row.no-wrap {
      padding: 2px !important;
    }

    .score-grid {
      .text-h5 {
        font-size: clamp(1.1rem, 5vw, 1.5rem);
      }

      .text-subtitle2 {
        font-size: clamp(0.7rem, 3vw, 0.875rem);
      }
    }

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
    }

    .q-chip--size-xs {
      font-size: 0.6rem;
      min-height: 14px;
      padding: 0 3px;
    }

    .text-weight-medium {
      font-size: clamp(0.75rem, 3.5vw, 0.875rem);
    }
  }
}
</style>
