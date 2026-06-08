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
            v-if="player.level !== undefined"
            :label="`L${player.level}`"
            :color="getLevelColor(player.level as 1 | 2 | 3)"
            text-color="white"
            size="xs"
            dense
          />
        </div>

        <!-- Editable: score input -->
        <q-input
          v-if="editable"
          v-model.number="localTeamAScore"
          type="number"
          label="Score"
          outlined
          class="q-mt-sm"
          input-class="text-h4 text-center"
          style="max-width: 120px; margin-left: auto; margin-right: auto"
        />
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
            v-if="player.level !== undefined"
            :label="`L${player.level}`"
            :color="getLevelColor(player.level as 1 | 2 | 3)"
            text-color="white"
            size="xs"
            dense
          />
        </div>

        <!-- Editable: score input -->
        <q-input
          v-if="editable"
          v-model.number="localTeamBScore"
          type="number"
          label="Score"
          outlined
          class="q-mt-sm"
          input-class="text-h4 text-center"
          style="max-width: 120px; margin-left: auto; margin-right: auto"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  getLevelColor,
  getMatchStatusColor,
  getMatchStatusLabel,
} from '../utils/playerHelpers';

interface TeamPlayer {
  username: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  level?: number;
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
