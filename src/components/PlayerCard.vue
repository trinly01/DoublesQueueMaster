<template>
  <q-item class="player-item" :class="{ 'player-selected': isSelected }" @click="$emit('click', player)" clickable>
    <q-item-section avatar v-if="showAvatar">
      <q-avatar :color="getLevelColor(player.level)" text-color="white" size="md">
        {{ getPlayerInitials(player.name) }}
        <q-tooltip>
          {{ player.name }} - Level {{ player.level }} - {{ player.gamesPlayed }} games
          <br>W: {{ player.wins }} | L: {{ player.losses }}
        </q-tooltip>
      </q-avatar>
    </q-item-section>

    <q-item-section>
      <q-item-label class="text-weight-medium">
        {{ player.name }}
        <q-chip v-if="player.priority === 'returned'" label="Returned" color="warning" text-color="white" size="xs"
          dense />
      </q-item-label>
      <q-item-label caption class="player-stats">
        <q-chip :label="`lvl ${player.level}`" :color="getLevelColor(player.level)" text-color="white" size="sm"
          dense />
        <span class="q-ml-sm text-grey-7"><span class="games-label">Games:</span> {{ player.gamesPlayed }}</span>
        <span class="q-ml-sm text-positive">W: {{ player.wins }}</span>
        <span class="q-ml-sm text-negative">L: {{ player.losses }}</span>
        <span v-if="showQueueTime && player.originalQueueTime" class="q-ml-sm text-grey-6">
          {{ getQueueTimeInfo(player) }}
        </span>
      </q-item-label>
    </q-item-section>

    <q-item-section side v-if="showActions">
      <div class="row items-center q-gutter-xs">
        <slot name="actions" :player="player">
          <q-btn flat round color="negative" @click.stop="$emit('remove', player.name)" icon="delete" size="sm" />
          <q-btn flat color="accent" @click.stop="$emit('requeue', player.name)" icon="input" size="sm"
            :disable="isInQueue" />
        </slot>
      </div>
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
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
  player: Player;
  showAvatar?: boolean;
  showActions?: boolean;
  showQueueTime?: boolean;
  isSelected?: boolean;
  isInQueue?: boolean;
}

withDefaults(defineProps<Props>(), {
  showAvatar: true,
  showActions: true,
  showQueueTime: false,
  isSelected: false,
  isInQueue: false
});

defineEmits<{
  click: [player: Player];
  remove: [name: string];
  requeue: [name: string];
}>();

// Helper functions
const getLevelColor = (level: 1 | 2 | 3): string => {
  switch (level) {
    case 1: return 'green-6';
    case 2: return 'orange-7';
    case 3: return 'red-8';
    default: return 'grey-5';
  }
};

const getPlayerInitials = (name: string): string => {
  return name.charAt(0).toUpperCase();
};

const getQueueTimeInfo = (player: Player): string => {
  if (player.priority === 'returned') {
    return 'Recently returned';
  }
  if (player.originalQueueTime) {
    const now = new Date();
    const diff = now.getTime() - new Date(player.originalQueueTime).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just joined';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }
  return 'In queue';
};
</script>

<style lang="scss" scoped>
.player-item {
  transition: background-color 0.2s ease;

  &:hover {
    background-color: rgba(0, 0, 0, 0.02);
  }

  &.player-selected {
    background-color: rgba(156, 39, 176, 0.1);
    border-left: 4px solid #9c27b0;
  }
}

.player-stats {
  display: flex;
  align-items: center;
  gap: 0.25rem;

  // Make stats more compact on mobile
  @media (max-width: 768px) {
    font-size: 0.75rem;
    line-height: 1.2;

    span {
      white-space: nowrap;
      margin-right: 0.125rem;
    }

    .games-label {
      display: none;
    }

    .text-grey-7::before {
      content: "G: ";
    }
  }
}
</style>
