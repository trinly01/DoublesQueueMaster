<template>
  <q-item
    class="match-item"
    :class="{
      'bg-yellow-1': match.status === 'in-progress',
      'bg-red-1': match.status === 'cancelled',
    }"
    @click="handleClick"
    clickable
  >
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

        <!-- Center: Status + Icon stacked -->
        <div class="col-auto q-mx-md center-group">
          <q-chip
            v-if="match.status === 'in-progress' && match.court"
            dense
            size="xs"
            class="court-chip"
            color="grey-4"
            text-color="grey-9"
          >
            Court
            <q-avatar
              color="grey-8"
              text-color="white"
              size="16px"
              font-size="9px"
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
          <q-badge
            v-if="match.status === 'waiting'"
            rounded
            color="grey-6"
            text-color="white"
          >
            {{ getMatchStatusLabel(match.status) }}
          </q-badge>
          <q-chip
            v-if="match.status === 'in-progress' && match.startedAt"
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
            {{ elapsed }}
          </q-chip>
          <div
            v-if="dateLabel"
            class="text-caption text-grey-6 text-center"
            style="line-height: 1; margin-top: 2px"
          >
            {{ dateLabel }}
          </div>
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
      <!-- Generation indicator chips -->
      <MatchMetaChips
        :meta="{
          generatedBy: match.generatedBy,
          editedBy: match.editedBy,
          scoredBy: match.scoredBy,
          cancelledBy: match.cancelledBy,
          matchmakingMode: match.matchmakingMode,
          generationType: match.generationType,
          isEdited: match.isEdited,
          editedAt: match.editedAt,
          originalMatchup: match.originalMatchup,
          originalTeamA: match.originalTeamA,
          originalTeamB: match.originalTeamB,
          createdAt: match.createdAt,
          updatedAt: match.updatedAt,
        }"
      />
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
        <q-menu auto-close>
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

            <q-item
              v-if="allowEditCancel"
              clickable
              @click="$emit('editMatch')"
            >
              <q-item-section avatar>
                <q-icon name="edit" />
              </q-item-section>
              <q-item-section>Edit Match</q-item-section>
            </q-item>

            <q-item
              v-if="match.status === 'waiting' && canStart"
              clickable
              @click="$emit('startMatch')"
            >
              <q-item-section avatar>
                <q-icon name="play_arrow" />
              </q-item-section>
              <q-item-section>Start Match</q-item-section>
            </q-item>

            <q-separator v-if="allowEditCancel" />

            <q-item
              v-if="allowEditCancel"
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
import { computed, inject } from 'vue';
import { useNowTicker } from '../composables/useNowTicker';
import {
  getRatingColor,
  getMatchStatusLabel,
  formatDate,
} from '../utils/playerHelpers';
import type { Player } from '../services/matchmaking';
import MatchMetaChips from './MatchMetaChips.vue';

const isReadOnlyMode = inject('isReadOnlyMode', false);

interface Match {
  id: string;
  teamA: Player[];
  teamB: Player[];
  players?: Player[];
  status: 'waiting' | 'in-progress' | 'completed' | 'cancelled';
  court?: number;
  order: number;
  createdAt: Date | string | number;
  startedAt?: Date | string | number;
  completedAt?: Date | string | number;
  queueSource?: string;
  expectedDifference?: number;
  winProbability?: number;
  generatedBy?: string;
  editedBy?: string;
  scoredBy?: string;
  cancelledBy?: string;
  matchmakingMode?: string;
  generationType?: 'auto' | 'manual';
  isEdited?: boolean;
  editedAt?: number;
  originalMatchup?: string;
  originalTeamA?: string;
  originalTeamB?: string;
  updatedAt?: Date | string | number;
}

interface Props {
  match: Match;
  showActions?: boolean;
  canStart?: boolean;
  allowEditCancel?: boolean;
  showDate?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showActions: true,
  canStart: false,
  allowEditCancel: false,
  showDate: false,
});

const emit = defineEmits<{
  click: [match: Match];
  completeMatch: [];
  editMatch: [];
  startMatch: [];
  cancelMatch: [];
  customAnnounce: [match: Match];
}>();

let lastTap = 0;

const handleClick = () => {
  const now = Date.now();
  if (now - lastTap < 300) {
    emit('customAnnounce', props.match);
  } else {
    emit('click', props.match);
  }
  lastTap = now;
};
const toTimestamp = (v: unknown): number => {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Date.parse(v);
  return 0;
};

const dateLabel = computed(() => {
  if (!props.showDate) return '';
  if (props.match.isEdited) {
    const editTime = props.match.editedAt ?? props.match.updatedAt;
    if (editTime) return formatDate(editTime);
  }
  if (
    props.match.status === 'waiting' ||
    props.match.status === 'in-progress'
  ) {
    return '';
  }
  if (props.match.cancelledBy && props.match.updatedAt) {
    return formatDate(props.match.updatedAt);
  }
  if (props.match.completedAt) {
    return formatDate(props.match.completedAt);
  }
  if (props.match.createdAt) {
    return formatDate(props.match.createdAt);
  }
  return '';
});

// Shared 1s ticker — one interval total across all match cards.
const tickerNow = useNowTicker();
const elapsed = computed(() => {
  if (props.match.status !== 'in-progress' || !props.match.startedAt) {
    return '';
  }
  const diff = tickerNow.value - toTimestamp(props.match.startedAt);
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}m ${secs}s`;
});
</script>

<style lang="scss" scoped>
.match-item {
  transition: background-color 0.2s ease;

  &:hover {
    background-color: rgba(0, 0, 0, 0.02);
  }

  // Center group (status + icon) vertical stack
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

    .live-chip {
      margin: 0;
    }

    .court-chip {
      margin: 0;
      margin-right: 5px; // room for the avatar hanging off the right edge
      overflow: visible;
      padding-right: 13px; // extended right end the avatar overlaps

      // Avatar is out of flow — pinned to the chip's right end so it reads
      // as inside the chip, but bigger than the chip itself.
      .q-avatar {
        position: absolute;
        right: -5px;
        top: 50%;
        transform: translateY(-50%);
        margin: 0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
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

  // Mobile adjustments
  @media (max-width: 768px) {
    .center-group {
      .q-chip {
        font-size: 0.7rem;
        min-height: 18px;
        padding: 0 5px;
      }

      // Court chip must stay xs-sized like the meta chips — undo the
      // min-height/padding the generic rule above would force on it.
      .court-chip.q-chip {
        min-height: 0;
        padding: 0 0.4em;
        padding-right: 13px;
      }

      .q-icon {
        font-size: 0.8rem;
        margin: 0;
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
