<template>
  <div class="player-list">
    <q-list separator v-if="players.length > 0">
      <PlayerCard
        v-for="player in displayPlayers"
        :key="player.username"
        :player="player"
        :current-user-id="currentUserId"
        :show-avatar="showAvatar"
        :show-actions="showActions"
        :show-queue-time="showQueueTime"
        :show-feedback-button="showFeedbackButton"
        :is-selected="isPlayerSelected(player)"
        :is-in-queue="player.isInQueue"
        :is-in-match="player.isInMatch"
        :sort-by="sortBy"
        :remove-label="removeLabel"
        :remove-icon="removeIcon"
        :remove-color="removeColor"
        :can-delete="canDelete"
        @click="$emit('playerClick', player)"
        @avatarClick="$emit('playerAvatarClick', $event)"
        @commend="$emit('playerCommend', $event)"
        @report="$emit('playerReport', $event)"
        @edit="$emit('playerEdit', $event)"
        @remove="$emit('playerRemove', $event)"
        @requeue="$emit('playerRequeue', $event)"
      >
        <template v-if="showPosition" #actions="{ player: playerItem }">
          <q-avatar
            :color="getPositionColor(playerItem)"
            text-color="white"
            size="sm"
            class="q-mx-sm"
          >
            {{ getPlayerPosition(playerItem) }}
          </q-avatar>
          <template v-if="showActions">
            <q-btn
              flat
              round
              :color="removeColor"
              @click.stop="$emit('playerRemove', playerItem.username)"
              :icon="removeIcon"
              size="sm"
              :disable="!canDelete && !isInQueue"
            >
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >{{ removeLabel }}</q-tooltip
              >
              <q-tooltip
                v-if="!canDelete && !isInQueue"
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >Admin only</q-tooltip
              >
            </q-btn>
            <q-btn
              v-if="showRequeueButton"
              flat
              color="accent"
              @click.stop="$emit('playerRequeue', playerItem.username)"
              icon="input"
              size="sm"
              :disable="isInQueue || isInMatch"
            >
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                v-if="isInQueue"
              >
                Already in queue
              </q-tooltip>
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                v-else-if="isInMatch"
              >
                In match
              </q-tooltip>
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                v-else
                >Add to queue</q-tooltip
              >
            </q-btn>
          </template>
        </template>
      </PlayerCard>
    </q-list>

    <EmptyState
      v-else
      :icon="emptyIcon"
      :title="emptyTitle"
      :subtitle="emptySubtitle"
    >
      <template v-if="emptyAction && showActions" #action>
        <q-btn
          :color="emptyActionColor"
          :icon="emptyActionIcon"
          :label="emptyActionLabel"
          @click="$emit('emptyAction')"
        />
      </template>
    </EmptyState>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PlayerCard from './PlayerCard.vue';
import EmptyState from './EmptyState.vue';

import type { Player as BasePlayer } from '../services/matchmaking';
type Player = BasePlayer & {
  enteredAt?: number;
  queueType?: 'GENERAL' | 'WINNERS' | 'LOSERS';
  isInMatch?: boolean;
  isInQueue?: boolean;
  matchOrder?: number;
};

interface Props {
  players: Player[];
  currentUserId?: string;
  showAvatar?: boolean;
  showActions?: boolean;
  showQueueTime?: boolean;
  showPosition?: boolean;
  isInQueue?: boolean;
  isInMatch?: boolean;
  showRequeueButton?: boolean;
  showFeedbackButton?: boolean;
  emptyIcon?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyAction?: boolean;
  emptyActionColor?: string;
  emptyActionIcon?: string;
  emptyActionLabel?: string;
  selectedPlayers?: Player[];
  sortBy?: string;
  removeLabel?: string;
  removeIcon?: string;
  removeColor?: string;
  canDelete?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  currentUserId: '',
  showAvatar: true,
  showActions: true,
  showQueueTime: false,
  showPosition: false,
  isInQueue: false,
  isInMatch: false,
  showRequeueButton: true,
  removeLabel: 'Remove',
  removeIcon: 'delete',
  removeColor: 'negative',
  canDelete: true,
  showFeedbackButton: true,
  emptyIcon: 'people',
  emptyTitle: 'No players found',
  emptySubtitle: 'Add players to get started',
  emptyAction: false,
  emptyActionColor: 'accent',
  emptyActionIcon: 'person_add',
  emptyActionLabel: 'Add Player',
  selectedPlayers: () => [],
});

defineEmits<{
  playerClick: [player: Player];
  playerAvatarClick: [player: Player];
  playerCommend: [player: Player];
  playerReport: [player: Player];
  playerEdit: [player: Player];
  playerRemove: [username: string];
  playerRequeue: [username: string];
  emptyAction: [];
}>();

// Computed and helper functions
const displayPlayers = computed(() => {
  if (!props.sortBy) return props.players;

  return [...props.players].sort((a, b) => {
    switch (props.sortBy) {
      case 'queueStatus': {
        // Mirrors the Queue column order (type groups, then enteredAt),
        // then the Matches column order (matchOrder), then everyone else.
        const statusOrder = (p: Player) =>
          p.isInQueue ? 0 : p.isInMatch ? 1 : 2;
        const sA = statusOrder(a);
        const sB = statusOrder(b);
        if (sA !== sB) return sA - sB;
        if (sA === 0) {
          const typeOrder: Record<string, number> = {
            GENERAL: 0,
            WINNERS: 1,
            LOSERS: 2,
          };
          const tA = typeOrder[a.queueType || 'GENERAL'] ?? 2;
          const tB = typeOrder[b.queueType || 'GENERAL'] ?? 2;
          if (tA !== tB) return tA - tB;
          return (a.enteredAt || 0) - (b.enteredAt || 0);
        }
        if (sA === 1) {
          return (a.matchOrder ?? 0) - (b.matchOrder ?? 0);
        }
        const idleA = (a.firstName || a.username).toLowerCase();
        const idleB = (b.firstName || b.username).toLowerCase();
        return idleA.localeCompare(idleB);
      }
      case 'rating':
        return b.rating - a.rating;
      case 'matchesPlayed':
        return b.matchesPlayed - a.matchesPlayed;
      case 'wins':
        return (b.wins || 0) - (a.wins || 0);
      case 'losses':
        return (b.losses || 0) - (a.losses || 0);
      case 'winRate': {
        const rateA = a.matchesPlayed ? (a.wins || 0) / a.matchesPlayed : 0;
        const rateB = b.matchesPlayed ? (b.wins || 0) / b.matchesPlayed : 0;
        if (rateA === rateB) {
          return b.matchesPlayed - a.matchesPlayed;
        }
        return rateB - rateA;
      }
      case 'name': {
        const nameA = (a.firstName || a.username).toLowerCase();
        const nameB = (b.firstName || b.username).toLowerCase();
        return nameA.localeCompare(nameB);
      }
      default:
        return a.username.localeCompare(b.username);
    }
  });
});

const isPlayerSelected = (player: Player): boolean => {
  return props.selectedPlayers.some((p) => p.username === player.username);
};

// Precompute queue positions once per list change — the per-row filter+findIndex
// version was O(n²) (queue of 50 = 2,500 iterations per render).
const positionByUsername = computed(() => {
  const map = new Map<string, number>();
  const counters: Record<string, number> = {};
  for (const p of props.players) {
    const type = p.queueType || 'GENERAL';
    const next = (counters[type] ?? 0) + 1;
    counters[type] = next;
    map.set(p.username, next);
  }
  return map;
});

const getPlayerPosition = (player: Player): number => {
  return positionByUsername.value.get(player.username) ?? 0;
};

const getPositionColor = (player: Player): string => {
  if (player.queueType === 'WINNERS') return 'teal';
  if (player.queueType === 'LOSERS') return 'deep-orange';
  return 'accent';
};
</script>

<style lang="scss" scoped>
.player-list {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.q-list {
  flex: 1;
  overflow-y: auto;
}
</style>
