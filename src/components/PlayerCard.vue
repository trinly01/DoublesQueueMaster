<template>
  <q-item
    class="player-item"
    :class="{
      'player-selected': isSelected,
      'link-source': linkState === 'source',
      'link-candidate': linkState === 'candidate',
      'link-ineligible': linkState === 'ineligible',
      'avoid-source': avoidState === 'source',
      'avoid-candidate': avoidState === 'candidate',
      'avoid-ineligible': avoidState === 'ineligible',
      'is-self': isSelf,
      'self-loser': isSelf && player.queueType === 'LOSERS',
      'self-winner': isSelf && player.queueType === 'WINNERS',

      // Quasar bg-* utilities are !important — they'd override the pulse
      // animation. On self rows the keyframes carry the queue color instead.
      [queueBgClass]: !isSelf,
    }"
    @click="$emit('click', player)"
    clickable
  >
    <q-item-section avatar v-if="showAvatar">
      <div class="relative-position">
        <PlayerAvatar
          v-if="!player.avatar || avatarLoadError"
          :name="player.firstName"
          :username="player.username"
          :color="avatarColor"
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
          :color="avatarColor"
          :user-id="player.userId"
          :dupr-id="player.duprId"
          :image-url="player.avatar"
          size="md"
          class="cursor-pointer"
          @click.stop="$emit('avatarClick', player)"
          @image-error="handleAvatarError"
        />
        <q-badge
          v-if="player.lockedAt"
          floating
          rounded
          color="amber-8"
          class="queue-lock-badge"
        >
          <q-icon name="lock" size="10px" color="white" />
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >Locked — skipped by auto-draft</q-tooltip
          >
        </q-badge>
        <q-badge
          v-if="player.linkedTo"
          floating
          rounded
          :color="linkColor"
          class="queue-link-badge"
          :class="{ 'cursor-pointer': showActions }"
          @click.stop="showActions && $emit('linkToggle', player.username)"
        >
          <q-icon name="link" size="10px" color="white" />
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >Paired with {{ linkedPartnerName }}
            {{ showActions ? '— tap to unpair' : '' }}</q-tooltip
          >
        </q-badge>
        <q-badge
          v-if="
            showActions &&
            player.avoids &&
            Object.keys(player.avoids).length > 0
          "
          floating
          rounded
          color="deep-orange"
          class="queue-avoid-badge"
          :class="{ 'cursor-pointer': showActions }"
          @click.stop="showActions && $emit('avoidToggle', player.username)"
        >
          <q-icon name="person_off" size="10px" color="white" />
          <span
            v-if="Object.keys(player.avoids).length > 1"
            class="text-white"
            style="font-size: 9px"
            >{{ Object.keys(player.avoids).length }}</span
          >
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >Avoids: {{ player.avoidSummary
            }}{{ showActions ? ' — tap to manage' : '' }}</q-tooltip
          >
        </q-badge>
        <q-badge
          v-if="showActions && player.avoidedBy"
          floating
          rounded
          color="grey-6"
          class="queue-avoided-by-badge"
        >
          <q-icon name="person_off" size="10px" color="white" />
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >Avoided by {{ player.avoidedBy }}</q-tooltip
          >
        </q-badge>
      </div>
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
          v-if="(!sortBy || sortBy !== 'winRate') && !hideInternalRating"
          :label="player.rating"
          :color="getRatingColor(player.rating ?? 1450)"
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

    <q-item-section side>
      <div class="row items-center">
        <q-btn
          v-if="showFeedbackButton && !isSelf"
          flat
          dense
          round
          color="positive"
          @click.stop="$emit('commend', player)"
          icon="thumb_up"
          size="md"
        >
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >Commend</q-tooltip
          >
        </q-btn>
        <q-btn
          v-if="showFeedbackButton && !isSelf"
          flat
          round
          color="negative"
          @click.stop="$emit('report', player)"
          icon="thumb_down"
          size="sm"
        >
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >Report</q-tooltip
          >
        </q-btn>
        <template v-if="showActions || $slots.actions">
          <slot name="actions" :player="player">
            <q-btn
              flat
              round
              color="primary"
              @click.stop="$emit('edit', player)"
              icon="edit"
              size="xs"
            >
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >Edit</q-tooltip
              >
            </q-btn>
            <q-btn
              flat
              round
              :color="isInQueue || isInMatch ? 'warning' : removeColor"
              @click.stop="$emit('remove', player.username)"
              :icon="isInQueue || isInMatch ? 'remove_circle' : removeIcon"
              size="xs"
              :disable="isInMatch || (!canDelete && !isInQueue)"
            >
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >{{
                  isInQueue || isInMatch ? 'Check out' : removeLabel
                }}</q-tooltip
              >
              <q-tooltip
                v-if="!canDelete && !isInQueue && !isInMatch"
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >Admin only</q-tooltip
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
        </template>
      </div>
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PlayerAvatar from './PlayerAvatar.vue';
import { getRatingColor, linkPairColor } from '../utils/playerHelpers';
import { useDupr } from '../composables/useDupr';
import type { Player as BasePlayer } from '../services/matchmaking';
type Player = BasePlayer & {
  enteredAt?: number;
  queueType?: 'GENERAL' | 'WINNERS' | 'LOSERS';
  lockedAt?: number;
  linkedTo?: string;
  isStalled?: boolean;
  avoidSummary?: string;
  avoidedBy?: string;
  linkedPartnerName?: string;
  linkedPairColor?: string;
  userId?: string;
};

interface Props {
  player: Player;
  currentUserId?: string;
  showAvatar?: boolean;
  showActions?: boolean;
  showQueueTime?: boolean;
  showFeedbackButton?: boolean;
  isSelected?: boolean;
  isInQueue?: boolean;
  isInMatch?: boolean;
  linkState?: 'source' | 'candidate' | 'ineligible' | null;
  avoidState?: 'source' | 'candidate' | 'ineligible' | null;
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
  showFeedbackButton: true,
  isSelected: false,
  isInQueue: false,
  isInMatch: false,
  linkState: null,
  avoidState: null,
  removeLabel: 'Remove',
  removeIcon: 'delete',
  removeColor: 'negative',
  canDelete: true,
});

defineEmits<{
  click: [player: Player];
  avatarClick: [player: Player];
  commend: [player: Player];
  report: [player: Player];
  edit: [player: Player];
  remove: [username: string];
  requeue: [username: string];
  linkToggle: [username: string];
  avoidToggle: [username: string];
}>();

// DUPR compliance — when the partner workspace hides internal ratings, the
// ring falls back to a neutral color so it can't leak the skill tier either.
const hideInternalRating = computed(() => useDupr().hideInternalRating);
const avatarColor = computed(() =>
  hideInternalRating.value
    ? 'grey-6'
    : getRatingColor(props.player.rating),
);

const isSelf = computed(() => {
  return (
    !!props.currentUserId &&
    !!props.player.userId &&
    props.currentUserId === props.player.userId
  );
});

const queueBgClass = computed(() => {
  if (props.player.queueType === 'WINNERS') return 'bg-green-1';
  if (props.player.queueType === 'LOSERS') return 'bg-red-1';
  return '';
});

const linkedPartnerName = computed(
  () => props.player.linkedPartnerName || props.player.linkedTo || '',
);

const linkColor = computed(
  () =>
    props.player.linkedPairColor ||
    linkPairColor(props.player.username, props.player.linkedTo),
);

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
// Logged-in player's own row: slow soft pulse so they can spot themselves
// at a glance — no badge clutter.
@keyframes self-row-pulse {
  0%,
  100% {
    background-color: rgba(255, 179, 0, 0.06);
  }
  50% {
    background-color: rgba(255, 179, 0, 0.25);
  }
}

// Self + queue-type rows keep their status color as the pulse base —
// loser red ↔ amber, winner green ↔ amber — so the "you" highlight never
// erases which queue the row is in.
@keyframes self-loser-pulse {
  0%,
  100% {
    background-color: rgba(244, 67, 54, 0.12);
  }
  50% {
    background-color: rgba(255, 179, 0, 0.28);
  }
}

@keyframes self-winner-pulse {
  0%,
  100% {
    background-color: rgba(76, 175, 80, 0.12);
  }
  50% {
    background-color: rgba(255, 179, 0, 0.28);
  }
}

.player-item.is-self {
  box-shadow: inset 3px 0 0 #ffb300;
  animation: self-row-pulse 3s ease-in-out infinite;
}

.player-item.is-self.self-loser {
  animation-name: self-loser-pulse;
}

.player-item.is-self.self-winner {
  animation-name: self-winner-pulse;
}

.queue-lock-badge {
  padding: 2px 4px;
}

.queue-link-badge {
  padding: 2px 4px;
  top: auto !important;
  bottom: 0;
  transform: translate(15%, 15%);
}

/* Avoid badge sits on the opposite corner from the pair badge so neither
   overlaps the avatar ring or crowds the lock badge (top-right). */
.queue-avoid-badge {
  padding: 2px 4px;
  top: auto !important;
  bottom: 0;
  right: auto !important;
  left: 0;
  transform: translate(-15%, 15%);
}

/* Incoming-avoid marker shares the left edge, nudged above the avoid badge. */
.queue-avoided-by-badge {
  padding: 2px 4px;
  right: auto !important;
  left: 0;
  transform: translate(-15%, -15%);
}

@keyframes link-candidate-pulse {
  0%,
  100% {
    box-shadow: inset 0 0 0 1px rgba(38, 166, 154, 0.35);
  }
  50% {
    box-shadow: inset 0 0 0 2px rgba(38, 166, 154, 0.9);
  }
}

.player-item.link-source {
  background-color: rgba(38, 166, 154, 0.12);
  border-left: 4px solid #009688;
}

.player-item.link-candidate {
  animation: link-candidate-pulse 1.4s ease-in-out infinite;
  cursor: pointer;
}

.player-item.link-ineligible {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes avoid-candidate-pulse {
  0%,
  100% {
    box-shadow: inset 0 0 0 1px rgba(255, 87, 34, 0.35);
  }
  50% {
    box-shadow: inset 0 0 0 2px rgba(255, 87, 34, 0.9);
  }
}

.player-item.avoid-source {
  background-color: rgba(255, 87, 34, 0.12);
  border-left: 4px solid #ff5722;
}

.player-item.avoid-candidate {
  animation: avoid-candidate-pulse 1.4s ease-in-out infinite;
  cursor: pointer;
}

.player-item.avoid-ineligible {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .player-item.avoid-candidate {
    animation: none;
    box-shadow: inset 0 0 0 2px rgba(255, 87, 34, 0.6);
  }
  .player-item.link-candidate {
    animation: none;
    box-shadow: inset 0 0 0 2px rgba(38, 166, 154, 0.6);
  }
}

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
