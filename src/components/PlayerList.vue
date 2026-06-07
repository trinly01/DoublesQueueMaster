<template>
  <div class="player-list">
    <q-list separator v-if="players.length > 0">
      <PlayerCard
        v-for="player in displayPlayers"
        :key="player.username"
        :player="player"
        :show-avatar="showAvatar"
        :show-actions="showActions"
        :show-queue-time="showQueueTime"
        :is-selected="isPlayerSelected(player)"
        :is-in-queue="player.isInQueue"
        :is-in-match="player.isInMatch"
        :sort-by="sortBy"
        @click="$emit('playerClick', player)"
        @edit="$emit('playerEdit', $event)"
        @remove="$emit('playerRemove', $event)"
        @requeue="$emit('playerRequeue', $event)"
      >
        <template v-if="showPosition" #actions="{ player: playerItem }">
          <q-avatar
            :color="getPositionColor(playerItem)"
            text-color="white"
            size="sm"
            class="q-mr-sm"
          >
            {{ getPlayerPosition(playerItem) }}
          </q-avatar>
          <template v-if="showActions">
            <q-btn
              flat
              round
              color="negative"
              @click.stop="$emit('playerRemove', playerItem.username)"
              icon="delete"
              size="sm"
            >
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >Remove</q-tooltip
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
};

interface Props {
  players: Player[];
  showAvatar?: boolean;
  showActions?: boolean;
  showQueueTime?: boolean;
  showPosition?: boolean;
  isInQueue?: boolean;
  isInMatch?: boolean;
  showRequeueButton?: boolean;
  emptyIcon?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyAction?: boolean;
  emptyActionColor?: string;
  emptyActionIcon?: string;
  emptyActionLabel?: string;
  selectedPlayers?: Player[];
  sortBy?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showAvatar: true,
  showActions: true,
  showQueueTime: false,
  showPosition: false,
  isInQueue: false,
  isInMatch: false,
  showRequeueButton: true,
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

const getPlayerPosition = (player: Player): number => {
  return props.players.findIndex((p) => p.username === player.username) + 1;
};

const getPositionColor = (player: Player): string => {
  if (player.queueType === 'WINNERS') return 'positive';
  if (player.queueType === 'LOSERS') return 'negative';
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
