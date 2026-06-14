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
            class="text-weight-medium text-center"
            style="
              max-width: 80px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              display: block;
            "
            >{{ player.firstName || player.name || player.username }}</span
          >
          <span
            v-if="player.username && (player.firstName || player.name)"
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
            v-if="player.rating !== undefined"
            :label="player.rating"
            :color="getRatingColor(player.rating)"
            text-color="white"
            size="xs"
            dense
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
          class="q-mt-sm"
          input-class="text-h4 text-center"
          style="max-width: 120px; margin-left: auto; margin-right: auto"
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

      <!-- Center: Court + Win Probability + Status + Scores + VS -->
      <div class="col-auto q-mx-md text-center center-group">
        <q-chip
          v-if="court !== undefined"
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
            >{{ court }}</q-avatar
          >
        </q-chip>
        <span
          v-if="winProbability !== undefined"
          class="text-caption text-grey-6"
        >
          {{ (winProbability * 100).toFixed(0) }}%
          <q-icon name="sports_tennis" color="grey-6" size="sm" />
          {{ ((1 - winProbability) * 100).toFixed(0) }}%
        </span>
        <q-chip
          v-if="status"
          :color="getMatchStatusColor(status)"
          text-color="white"
          size="sm"
          dense
        >
          {{ getMatchStatusLabel(status) }}
        </q-chip>
        <!-- Read-only: scores flanking VS -->
        <div
          v-if="
            !editable && teamAScore !== undefined && teamBScore !== undefined
          "
          class="row items-center justify-center q-gutter-x-sm q-mt-xs"
        >
          <span class="text-h5 text-weight-bold">{{ teamAScore }}</span>
          <span class="text-subtitle2 text-weight-bold text-grey-8">VS</span>
          <span class="text-h5 text-weight-bold">{{ teamBScore }}</span>
        </div>
        <div v-else class="text-subtitle2 text-weight-bold text-grey-8">VS</div>
        <div v-if="completedAt" class="text-caption text-grey-6 q-mt-xs">
          {{ formatDate(completedAt) }}
        </div>
        <div
          v-if="startedAt && completedAt"
          class="text-caption text-grey-7 q-mt-xs"
        >
          Match lasted {{ formatDuration(startedAt, completedAt) }}
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
            class="text-weight-medium text-center"
            style="
              max-width: 80px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              display: block;
            "
            >{{ player.firstName || player.name || player.username }}</span
          >
          <span
            v-if="player.username && (player.firstName || player.name)"
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
            v-if="player.rating !== undefined"
            :label="player.rating"
            :color="getRatingColor(player.rating)"
            text-color="white"
            size="xs"
            dense
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
          class="q-mt-sm"
          input-class="text-h4 text-center"
          style="max-width: 120px; margin-left: auto; margin-right: auto"
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { QInput } from 'quasar';
import {
  getRatingColor,
  getMatchStatusColor,
  getMatchStatusLabel,
} from '../utils/playerHelpers';

interface TeamPlayer {
  username: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  level?: number;
  rating?: number;
}

const props = withDefaults(
  defineProps<{
    teamA: TeamPlayer[];
    teamB: TeamPlayer[];
    teamAScore?: number;
    teamBScore?: number;
    court?: number;
    winProbability?: number;
    status?: string;
    editable?: boolean;
    startedAt?: string;
    completedAt?: string;
  }>(),
  {
    editable: false,
  },
);

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
};

const setTeamBScore = (s: number) => {
  localTeamBScore.value = s;
  localTeamAScore.value = 0;
  teamAInput.value?.focus();
};

const localTeamBScore = computed({
  get: () => props.teamBScore ?? 0,
  set: (val) => emit('update:teamBScore', val),
});

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${months[d.getMonth()]} ${d.getDate()} ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
};

const formatDuration = (startIso: string, endIso: string): string => {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const diff = Math.max(0, end - start);
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}m ${secs}s`;
};
</script>

<style lang="scss" scoped>
.match-result {
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
}

@media (max-width: 768px) {
  .match-result {
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
      font-size: 0.8rem;
    }
  }
}
</style>
