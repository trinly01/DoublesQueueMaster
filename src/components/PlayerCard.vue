<template>
  <q-item
    class="player-item"
    :class="{ 'player-selected': isSelected }"
    @click="$emit('click', player)"
    clickable
  >
    <q-item-section avatar v-if="showAvatar">
      <q-avatar
        v-if="!player.avatar || avatarLoadError"
        :color="getLevelColor(player.level)"
        text-color="white"
        size="md"
      >
        {{ getPlayerInitials(player.firstName || player.username) }}
        <q-badge
          v-if="player.userId"
          floating
          rounded
          color="accent"
          style="padding: 2px; min-height: 14px; min-width: 14px"
        >
          <q-icon name="verified" size="12px" />
          <q-tooltip>Registered member</q-tooltip>
        </q-badge>
      </q-avatar>
      <q-avatar v-else size="md">
        <img
          :src="player.avatar"
          :alt="player.username"
          @error="handleAvatarError"
        />
        <q-badge
          v-if="player.userId"
          floating
          rounded
          color="accent"
          style="
            padding: 2px;
            min-height: 14px;
            min-width: 14px;
            bottom: -6px;
            left: -2px;
            top: auto;
            right: auto;
          "
        >
          <q-icon name="verified" size="12px" />
          <q-tooltip>Registered member</q-tooltip>
        </q-badge>
        <!-- Level indicator badge when avatar is available -->
        <q-badge
          floating
          rounded
          :color="getLevelColor(player.level)"
          style="
            padding: 2px;
            min-height: 8px;
            min-width: 8px;
            bottom: -2px;
            right: -2px;
            top: auto;
            left: auto;
          "
        >
          <q-tooltip>Level {{ player.level }}</q-tooltip>
        </q-badge>
      </q-avatar>
    </q-item-section>

    <q-item-section>
      <q-item-label class="text-weight-medium">
        {{ player.firstName || player.username }}
        <q-chip
          v-if="player.queueType && player.queueType !== 'GENERAL'"
          :label="player.queueType"
          :color="player.queueType === 'WINNERS' ? 'positive' : 'negative'"
          text-color="white"
          size="xs"
          dense
        />
      </q-item-label>
      <q-item-label
        caption
        class="text-grey-6"
        style="font-size: 10px"
        v-if="player.username && player.firstName"
      >
        @{{ player.username }}
      </q-item-label>
      <q-item-label caption class="player-stats">
        <span class="text-grey-7">G:{{ player.matchesPlayed }}</span>
        <span class="q-ml-xs text-positive" v-if="player.wins !== undefined"
          >W:{{ player.wins || 0 }}</span
        >
        <span class="q-ml-xs text-negative" v-if="player.losses !== undefined"
          >L:{{ player.losses || 0 }}</span
        >
        <span
          class="q-ml-xs text-info"
          v-if="player.wins !== undefined && sortBy === 'winRate'"
          >WR:{{
            player.matchesPlayed
              ? Math.round(((player.wins || 0) / player.matchesPlayed) * 100)
              : 0
          }}%</span
        >
        <span
          class="q-ml-xs text-primary"
          v-if="!sortBy || sortBy !== 'winRate'"
          >R:{{ player.rating === 1500 ? 'NR' : player.rating }}</span
        >
        <!-- <span v-if="showQueueTime && player.enteredAt" class="q-ml-sm text-grey-6">
          {{ getQueueTimeInfo(player.enteredAt) }}
        </span> -->
      </q-item-label>
    </q-item-section>

    <q-item-section side v-if="showActions || $slots.actions">
      <div class="row items-center">
        <slot name="actions" :player="player">
          <q-btn
            flat
            round
            color="primary"
            @click.stop="$emit('edit', player)"
            icon="edit"
            size="xs"
          >
            <q-tooltip>Edit player</q-tooltip>
          </q-btn>
          <q-btn
            flat
            round
            color="negative"
            @click.stop="$emit('remove', player.username)"
            icon="delete"
            size="xs"
          />
          <q-btn
            flat
            round
            color="accent"
            @click.stop="$emit('requeue', player.username)"
            icon="input"
            size="xs"
            :disable="isInQueue"
          />
        </slot>
      </div>
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Player as BasePlayer } from '../services/matchmaking';
type Player = BasePlayer & {
  enteredAt?: number;
  queueType?: 'GENERAL' | 'WINNERS' | 'LOSERS';
  userId?: string;
};

interface Props {
  player: Player;
  showAvatar?: boolean;
  showActions?: boolean;
  showQueueTime?: boolean;
  isSelected?: boolean;
  isInQueue?: boolean;
  sortBy?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showAvatar: true,
  showActions: true,
  showQueueTime: false,
  isSelected: false,
  isInQueue: false,
});

defineEmits<{
  click: [player: Player];
  edit: [player: Player];
  remove: [username: string];
  requeue: [username: string];
}>();

const avatarLoadError = ref(false);

// Reset error when player changes
watch(
  () => props.player,
  () => {
    avatarLoadError.value = false;
  },
);

// Helper functions
const getLevelColor = (level: 1 | 2 | 3): string => {
  switch (level) {
    case 1:
      return 'green-6';
    case 2:
      return 'orange-7';
    case 3:
      return 'red-8';
    default:
      return 'grey-5';
  }
};

const getPlayerInitials = (name: string): string => {
  return name.charAt(0).toUpperCase();
};

const handleAvatarError = () => {
  avatarLoadError.value = true;
};

// const getQueueTimeInfo = (player: Player): string => {
//   if (player.priority === 'returned') {
//     return 'Recently returned';
//   }
//   if (player.originalQueueTime) {
//     const now = new Date();
//     const diff = now.getTime() - new Date(player.originalQueueTime).getTime();
//     const minutes = Math.floor(diff / 60000);
//     if (minutes < 1) return 'Just joined';
//     if (minutes < 60) return `${minutes}m ago`;
//     const hours = Math.floor(minutes / 60);
//     return `${hours}h ago`;
//   }
//   return 'In queue';
// };
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
  }
}

// Mobile adjustments for side actions to prevent overlap
@media (max-width: 1023px) {
  .player-item {
    // Allow main content to shrink
    .q-item__section--main {
      min-width: 0;
    }

    // Truncate text to prevent overflow
    .q-item__label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    // Ensure side section doesn't shrink
    .q-item__section--side {
      flex-shrink: 0;
    }

    // Reduce gap between action buttons
    .row.q-gutter-xs {
      gap: 2px;
    }

    // Reduce avatar size in actions (position numbers)
    .q-avatar--size-sm {
      width: 20px;
      height: 20px;
      font-size: 0.7rem;
    }

    // Reduce avatar margin
    .q-mr-sm {
      margin-right: 4px !important;
    }
  }
}
</style>
