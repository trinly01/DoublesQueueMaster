<template>
  <div class="player-list">
    <q-list separator v-if="players.length > 0">
      <PlayerCard v-for="player in displayPlayers" :key="player.name" :player="player" :show-avatar="showAvatar"
        :show-actions="showActions" :show-queue-time="showQueueTime" :is-selected="isPlayerSelected(player)"
        :is-in-queue="isInQueue" @click="$emit('playerClick', player)" @remove="$emit('playerRemove', $event)"
        @requeue="$emit('playerRequeue', $event)">
        <template v-if="showPosition" #actions="{ player: playerItem }">
          <q-avatar :color="getPositionColor(playerItem)" text-color="white" size="sm" class="q-mr-sm">
            {{ getPlayerPosition(playerItem) }}
            <q-tooltip>
              Position: {{ getPlayerPosition(playerItem) }}
              <br>Games: {{ playerItem.gamesPlayed }}
              <br>Priority: {{ playerItem.priority || 'normal' }}
            </q-tooltip>
          </q-avatar>
          <q-btn flat round color="negative" @click.stop="$emit('playerRemove', playerItem.name)" icon="delete"
            size="sm" />
          <q-btn flat color="accent" @click.stop="$emit('playerRequeue', playerItem.name)" icon="input" size="sm"
            :disable="isInQueue" />
        </template>
      </PlayerCard>
    </q-list>

    <EmptyState v-else :icon="emptyIcon" :title="emptyTitle" :subtitle="emptySubtitle">
      <template v-if="emptyAction" #action>
        <q-btn :color="emptyActionColor" :icon="emptyActionIcon" :label="emptyActionLabel"
          @click="$emit('emptyAction')" />
      </template>
    </EmptyState>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PlayerCard from './PlayerCard.vue';
import EmptyState from './EmptyState.vue';

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

interface Props {
  players: Player[];
  showAvatar?: boolean;
  showActions?: boolean;
  showQueueTime?: boolean;
  showPosition?: boolean;
  isInQueue?: boolean;
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
  emptyIcon: 'people',
  emptyTitle: 'No players found',
  emptySubtitle: 'Add players to get started',
  emptyAction: false,
  emptyActionColor: 'accent',
  emptyActionIcon: 'person_add',
  emptyActionLabel: 'Add Player',
  selectedPlayers: () => []
});

defineEmits<{
  playerClick: [player: Player];
  playerRemove: [name: string];
  playerRequeue: [name: string];
  emptyAction: [];
}>();

// Computed and helper functions
const displayPlayers = computed(() => {
  if (!props.sortBy) return props.players;

  return [...props.players].sort((a, b) => {
    switch (props.sortBy) {
      case 'gamesPlayed':
        return b.gamesPlayed - a.gamesPlayed;
      case 'wins':
        return b.wins - a.wins;
      case 'losses':
        return b.losses - a.losses;
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return a.name.localeCompare(b.name);
    }
  });
});

const isPlayerSelected = (player: Player): boolean => {
  return props.selectedPlayers.some(p => p.name === player.name);
};

const getPlayerPosition = (player: Player): number => {
  return props.players.findIndex(p => p.name === player.name) + 1;
};

const getPositionColor = (player: Player): string => {
  if (player.priority === 'returned') return 'warning';
  return 'accent';
};
</script>

<style lang="scss" scoped>
.player-list {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.q-list {
  flex: 1;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 3px;
    transition: background 0.2s ease;

    &:hover {
      background: #c1c1c1;
    }
  }

  // Show scrollbar only on hover
  &:hover {
    &::-webkit-scrollbar-thumb {
      background: #e0e0e0;
    }
  }
}
</style>
