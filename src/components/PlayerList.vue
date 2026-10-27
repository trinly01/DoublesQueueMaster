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
        :link-state="linkStateFor(player)"
        :avoid-state="avoidStateFor(player)"
        :sort-by="sortBy"
        :remove-label="removeLabel"
        :remove-icon="removeIcon"
        :remove-color="removeColor"
        :can-delete="canDelete"
        :can-pair-avoid="canPairAvoid && !pairAvoidLocked"
        @click="$emit('playerClick', player)"
        @avatarClick="$emit('playerAvatarClick', $event)"
        @commend="$emit('playerCommend', $event)"
        @report="$emit('playerReport', $event)"
        @edit="$emit('playerEdit', $event)"
        @remove="$emit('playerRemove', $event)"
        @requeue="$emit('playerRequeue', $event)"
        @link-toggle="$emit('playerLinkToggle', $event)"
        @avoid-toggle="$emit('playerAvoidManage', $event)"
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
            <!-- Queue actions collapsed into a kebab menu — same pattern as
                 MatchCard's options menu; keeps tight mobile rows clean. -->
            <q-btn
              color="grey-7"
              icon="more_vert"
              flat
              round
              size="sm"
              @click.stop
            >
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >Options</q-tooltip
              >
              <q-menu auto-close>
                <q-list style="min-width: 170px">
                  <q-item
                    v-if="
                      canPairAvoid &&
                      (linkSourceUsername === playerItem.username ||
                        avoidSourceUsername === playerItem.username)
                    "
                    clickable
                    class="text-warning"
                    @click="
                      linkSourceUsername === playerItem.username
                        ? $emit('playerLinkToggle', playerItem.username)
                        : $emit('playerAvoidToggle', playerItem.username)
                    "
                  >
                    <q-item-section avatar>
                      <q-icon name="close" />
                    </q-item-section>
                    <q-item-section>
                      {{
                        linkSourceUsername === playerItem.username
                          ? 'Cancel pairing'
                          : 'Cancel avoid'
                      }}
                    </q-item-section>
                  </q-item>

                  <q-item
                    v-if="
                      isInQueue && !linkSourceUsername && !avoidSourceUsername
                    "
                    clickable
                    @click="$emit('playerLockToggle', playerItem.username)"
                  >
                    <q-item-section avatar>
                      <q-icon
                        :name="playerItem.lockedAt ? 'lock_open' : 'lock'"
                        :color="playerItem.lockedAt ? 'amber-8' : undefined"
                      />
                    </q-item-section>
                    <q-item-section>{{
                      playerItem.lockedAt ? 'Unlock player' : 'Lock player'
                    }}</q-item-section>
                  </q-item>

                  <q-item
                    v-if="
                      isInQueue &&
                      !playerItem.linkedTo &&
                      !linkSourceUsername &&
                      !avoidSourceUsername
                    "
                    clickable
                    :disable="pairAvoidDisabled"
                    @click="$emit('playerLinkToggle', playerItem.username)"
                  >
                    <q-item-section avatar>
                      <q-icon name="link" color="teal" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>
                        Pair duo…
                        <q-badge
                          v-if="pairAvoidLocked"
                          color="amber"
                          text-color="white"
                          label="Pro"
                          class="q-ml-xs"
                          dense
                        />
                      </q-item-label>
                      <q-item-label
                        v-if="pairAvoidHint"
                        caption
                        class="text-grey-6"
                        >{{ pairAvoidHint }}</q-item-label
                      >
                    </q-item-section>
                  </q-item>

                  <q-item
                    v-if="!linkSourceUsername && !avoidSourceUsername"
                    clickable
                    :disable="pairAvoidDisabled"
                    @click="$emit('playerAvoidToggle', playerItem.username)"
                  >
                    <q-item-section avatar>
                      <q-icon name="person_off" color="deep-orange" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>
                        Avoid player…
                        <q-badge
                          v-if="pairAvoidLocked"
                          color="amber"
                          text-color="white"
                          label="Pro"
                          class="q-ml-xs"
                          dense
                        />
                      </q-item-label>
                      <q-item-label
                        v-if="pairAvoidHint"
                        caption
                        class="text-grey-6"
                        >{{ pairAvoidHint }}</q-item-label
                      >
                    </q-item-section>
                  </q-item>

                  <q-item
                    v-if="
                      hasAvoids(playerItem) &&
                      !linkSourceUsername &&
                      !avoidSourceUsername
                    "
                    clickable
                    :disable="pairAvoidDisabled"
                    @click="$emit('playerAvoidManage', playerItem.username)"
                  >
                    <q-item-section avatar>
                      <q-icon name="manage_accounts" color="deep-orange" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>
                        Manage avoids
                        <q-badge
                          v-if="pairAvoidLocked"
                          color="amber"
                          text-color="white"
                          label="Pro"
                          class="q-ml-xs"
                          dense
                        />
                      </q-item-label>
                      <q-item-label
                        v-if="pairAvoidHint"
                        caption
                        class="text-grey-6"
                        >{{ pairAvoidHint }}</q-item-label
                      >
                    </q-item-section>
                  </q-item>

                  <q-separator
                    v-if="!linkSourceUsername && !avoidSourceUsername"
                  />

                  <q-item
                    v-if="
                      showRequeueButton &&
                      !linkSourceUsername &&
                      !avoidSourceUsername
                    "
                    clickable
                    :disable="isInQueue || isInMatch"
                    @click="$emit('playerRequeue', playerItem.username)"
                  >
                    <q-item-section avatar>
                      <q-icon name="input" color="accent" />
                    </q-item-section>
                    <q-item-section>{{
                      isInQueue
                        ? 'Already in queue'
                        : isInMatch
                          ? 'In match'
                          : 'Add to queue'
                    }}</q-item-section>
                  </q-item>

                  <q-item
                    v-if="!linkSourceUsername && !avoidSourceUsername"
                    clickable
                    :disable="!canDelete && !isInQueue"
                    class="text-negative"
                    @click="$emit('playerRemove', playerItem.username)"
                  >
                    <q-item-section avatar>
                      <q-icon :name="removeIcon" color="negative" />
                    </q-item-section>
                    <q-item-section>{{ removeLabel }}</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
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
  lockedAt?: number;
  linkedTo?: string;
  /** Undraftable right now (locked / pair waiting) — rendered dimmed at bottom. */
  isStalled?: boolean;
  /** Display names of this player's avoid targets, e.g. "Ann (team), Bob" */
  avoidSummary?: string;
  /** True when the player is someone's avoid target (incoming). */
  avoidedBy?: string;
  linkedPartnerName?: string;
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
  linkSourceUsername?: string | null;
  avoidSourceUsername?: string | null;
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
  /** Admin role gate — pair/avoid menu items hidden entirely for mods. */
  canPairAvoid?: boolean;
  /** Pro subscription gate — items stay visible but disabled with a Pro badge. */
  pairAvoidLocked?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  currentUserId: '',
  showAvatar: true,
  showActions: true,
  showQueueTime: false,
  showPosition: false,
  isInQueue: false,
  isInMatch: false,
  linkSourceUsername: null,
  avoidSourceUsername: null,
  showRequeueButton: true,
  removeLabel: 'Remove',
  removeIcon: 'delete',
  removeColor: 'negative',
  canDelete: true,
  canPairAvoid: false,
  pairAvoidLocked: false,
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
  playerLockToggle: [username: string];
  playerLinkToggle: [username: string];
  playerAvoidToggle: [username: string];
  playerAvoidManage: [username: string];
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

// Link-mode row state: the armed source row is highlighted, eligible partners
// pulse, everything else dims. Candidates must be queued, unlocked, and
// unlinked themselves.
const linkStateFor = (
  player: Player,
): 'source' | 'candidate' | 'ineligible' | null => {
  if (!props.linkSourceUsername) return null;
  if (player.username === props.linkSourceUsername) return 'source';
  const eligible =
    props.isInQueue &&
    !player.lockedAt &&
    !player.linkedTo &&
    !player.isInMatch;
  return eligible ? 'candidate' : 'ineligible';
};

// Avoid-mode row state: the armed source row is highlighted, every other
// player is a valid target except the source's linked partner (contradiction).
const avoidStateFor = (
  player: Player,
): 'source' | 'candidate' | 'ineligible' | null => {
  if (!props.avoidSourceUsername) return null;
  if (player.username === props.avoidSourceUsername) return 'source';
  const source = props.players.find(
    (p) => p.username === props.avoidSourceUsername,
  );
  const partner = source?.linkedTo;
  if (partner && player.username === partner) return 'ineligible';
  return 'candidate';
};

const hasAvoids = (player: Player): boolean =>
  !!player.avoids && Object.keys(player.avoids).length > 0;

// Pair/avoid stay visible but disabled with an explainer — mods see
// "Admin only", admins on an expired club see the Pro gate.
const pairAvoidDisabled = computed(
  () => !props.canPairAvoid || props.pairAvoidLocked,
);
const pairAvoidHint = computed(() =>
  [
    !props.canPairAvoid ? 'Admin only' : '',
    props.pairAvoidLocked ? 'Pro feature' : '',
  ]
    .filter(Boolean)
    .join(' · '),
);

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
