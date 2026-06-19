<template>
  <q-item
    class="player-item"
    :class="{ 'player-selected': isSelected, [queueBgClass]: true }"
    @click="$emit('click', player)"
    clickable
  >
    <q-item-section avatar v-if="showAvatar">
      <PlayerAvatar
        v-if="!player.avatar || avatarLoadError"
        :name="player.firstName"
        :username="player.username"
        :color="getRatingColor(player.rating)"
        :user-id="player.userId"
        :dupr-id="player.duprId"
        size="md"
        class="cursor-pointer"
        @click.stop="$emit('avatarClick', player)"
      />
      <PlayerAvatar
        v-else
        :name="player.firstName"
        :username="player.username"
        :color="getRatingColor(player.rating)"
        :user-id="player.userId"
        :dupr-id="player.duprId"
        :image-url="player.avatar"
        size="md"
        class="cursor-pointer"
        @click.stop="$emit('avatarClick', player)"
        @image-error="handleAvatarError"
      />
    </q-item-section>

    <q-item-section>
      <q-item-label class="text-weight-medium">
        {{ player.firstName || player.username }}
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
        <q-chip
          v-if="!sortBy || sortBy !== 'winRate'"
          :label="player.rating"
          :color="getRatingColor(player.rating ?? 1500)"
          text-color="white"
          size="xs"
          dense
          class="q-ml-xs"
        />
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
            <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
              >Edit</q-tooltip
            >
          </q-btn>
          <q-btn
            flat
            round
            color="negative"
            @click.stop="$emit('remove', player.username)"
            icon="delete"
            size="xs"
          >
            <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
              >Remove</q-tooltip
            >
          </q-btn>
          <q-btn
            flat
            round
            color="accent"
            @click.stop="$emit('requeue', player.username)"
            icon="input"
            size="xs"
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
        </slot>
      </div>
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PlayerAvatar from './PlayerAvatar.vue';
import { getRatingColor } from '../utils/playerHelpers';
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
  isInMatch?: boolean;
  sortBy?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showAvatar: true,
  showActions: true,
  showQueueTime: false,
  isSelected: false,
  isInQueue: false,
  isInMatch: false,
});

defineEmits<{
  click: [player: Player];
  avatarClick: [player: Player];
  edit: [player: Player];
  remove: [username: string];
  requeue: [username: string];
}>();

const queueBgClass = computed(() => {
  if (props.player.queueType === 'WINNERS') return 'bg-green-1';
  if (props.player.queueType === 'LOSERS') return 'bg-red-1';
  return '';
});

const avatarLoadError = ref(false);

// Reset error when player changes
watch(
  () => props.player,
  () => {
    avatarLoadError.value = false;
  },
);

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
