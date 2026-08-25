<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-card style="width: 420px; max-width: 90vw; max-height: 95vh">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Club Leaderboard</div>
        <q-btn
          icon="info"
          flat
          round
          dense
          size="xs"
          class="q-ml-xs"
          text-color="grey-7"
          style="margin-top: -12px"
        >
          <q-popup-proxy>
            <q-card class="lb-tooltip" flat>
              <q-card-section class="q-pb-md">
                <div class="lb-tooltip-title row items-center">
                  <q-icon name="info" size="18px" class="q-mr-xs" />
                  How leaderboard ranking works
                </div>
              </q-card-section>
              <q-card-section class="q-pt-none">
                <div class="lb-tooltip-body">
                  <div class="lb-section">
                    <div class="lb-row">
                      <span class="lb-label">Club</span>
                      <span class="lb-desc"
                        >top 30 in this club (last 45 days)</span
                      >
                    </div>
                    <div class="lb-row">
                      <span class="lb-label">My Matches</span>
                      <span class="lb-desc"
                        >top 30 you've played with (last 45 days)</span
                      >
                    </div>
                    <div class="lb-row">
                      <span class="lb-label">Global</span>
                      <span class="lb-desc"
                        >top 30 everywhere (last 45 days, 12+ games)</span
                      >
                    </div>
                  </div>
                  <div class="lb-divider"></div>
                  <p class="lb-line">Standard, Competitive, Pro Pick only.</p>
                  <p class="lb-line">
                    Win → up. Lose → down. Beat a stronger opponent for more
                    points. Everyone starts with a seed rating.
                  </p>
                  <p class="lb-line lb-order">Order: score → games → wins</p>
                  <div class="lb-divider"></div>
                  <div class="lb-legend">
                    <div class="lb-row">
                      <span class="lb-label">Pulsing dot</span>
                      <span class="lb-desc"
                        >provisional — under 12 games, your seed still outweighs
                        your results</span
                      >
                    </div>
                    <div class="lb-row">
                      <span class="lb-label">Solid %</span>
                      <span class="lb-desc"
                        >reliability — more games, more accurate</span
                      >
                    </div>
                  </div>
                </div>
              </q-card-section>
            </q-card>
          </q-popup-proxy>
        </q-btn>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>
      <div class="row q-gutter-xs q-px-md q-pb-xs justify-center">
        <q-chip dense color="grey-6" text-color="white" size="xs">
          Beginner
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >&lt; 1400</q-tooltip
          >
        </q-chip>
        <q-chip dense color="blue-6" text-color="white" size="xs">
          Intermediate
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >1400–1699</q-tooltip
          >
        </q-chip>
        <q-chip dense color="green-6" text-color="white" size="xs">
          Advanced
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >1700–1899</q-tooltip
          >
        </q-chip>
        <q-chip dense color="amber-7" text-color="white" size="xs">
          Expert
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >1900–2099</q-tooltip
          >
        </q-chip>
        <q-chip dense color="red-7" text-color="white" size="xs">
          Pro
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
            >2100+</q-tooltip
          >
        </q-chip>
      </div>
      <div class="q-px-md q-pt-xs">
        <q-btn-group spread class="full-width">
          <q-btn
            flat
            color="accent"
            :class="leaderboardTab === 'club' ? 'bg-accent text-white' : ''"
            icon="groups"
            label="Club"
            dense
            size="sm"
            @click="leaderboardTab = 'club'"
          />
          <q-btn
            flat
            color="accent"
            :class="leaderboardTab === 'matches' ? 'bg-accent text-white' : ''"
            icon="sports_tennis"
            label="My Matches"
            dense
            size="sm"
            @click="leaderboardTab = 'matches'"
          />
          <q-btn
            flat
            color="accent"
            :class="leaderboardTab === 'global' ? 'bg-accent text-white' : ''"
            icon="public"
            label="Global"
            dense
            size="sm"
            @click="leaderboardTab = 'global'"
          />
        </q-btn-group>
      </div>
      <q-card-section
        class="leaderboard-scroll q-px-md q-pt-xs q-pb-md"
        style="max-height: 78vh; overflow-y: auto"
      >
        <div v-if="activeLoading" class="flex flex-center q-py-md">
          <q-spinner color="accent" size="32px" />
        </div>
        <q-list separator v-else-if="activeLeaderboard.length">
          <q-item
            v-for="(player, idx) in activeLeaderboard"
            :key="player.username"
            :class="(player.winRate || 0) >= 50 ? 'bg-green-1' : 'bg-red-1'"
          >
            <q-item-section avatar>
              <div class="row items-center no-wrap" style="gap: 8px">
                <div
                  class="text-h6 text-weight-bold text-right"
                  :class="player.provisional ? 'text-grey-5' : 'text-grey-8'"
                  style="min-width: 24px"
                >
                  {{ player.provisional ? '–' : idx + 1 }}
                </div>

                <PlayerAvatar
                  :name="player.firstName"
                  :username="player.username"
                  :color="getRatingColor(player.rating || 1450)"
                  :image-url="player.avatar"
                  size="32px"
                  :index="idx"
                />
              </div>
            </q-item-section>
            <q-item-section class="col">
              <q-item-label class="text-weight-medium ellipsis">
                {{ player.firstName || player.username }}
              </q-item-label>
              <q-item-label caption class="ellipsis">
                @{{ player.username }}
              </q-item-label>
            </q-item-section>
            <q-item-section side class="text-right" style="min-width: 0">
              <div class="row items-center justify-end no-wrap">
                <q-chip
                  :color="getRatingColor(player.rating || 1450)"
                  text-color="white"
                  size="sm"
                  dense
                  class="text-weight-bold q-mb-xs"
                >
                  <span
                    v-if="player.provisional"
                    class="provisional-dot q-mr-xs"
                    ><span class="provisional-dot-inner"
                  /></span>
                  {{ player.score }}
                  <q-tooltip
                    v-if="player.provisional !== undefined"
                    anchor="center left"
                    self="center right"
                    :offset="[8, 0]"
                    class="text-no-wrap"
                  >
                    <template v-if="player.provisional">
                      {{ player.gamesToReliable }} game{{
                        player.gamesToReliable === 1 ? '' : 's'
                      }}
                      to rank up
                    </template>
                    <template v-else>
                      {{ Math.round((player.reliability || 0) * 100) }}% solid
                    </template>
                  </q-tooltip>
                </q-chip>
              </div>
              <div class="text-caption">
                <span class="text-grey-10">{{ player.games }}G</span>
                <span class="text-green text-weight-bold q-ml-xs"
                  >{{ player.wins || 0 }}W</span
                >
                <span class="text-red-10 q-ml-xs"
                  >{{ player.losses || 0 }}L</span
                >
              </div>
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="text-center text-grey q-py-md">
          No completed matches yet.
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import PlayerAvatar from '../PlayerAvatar.vue';
import { getRatingColor } from '../../utils/playerHelpers';

defineOptions({ name: 'LeaderboardDialog' });

const props = defineProps<{
  modelValue: boolean;
  leaderboard: Array<{
    id: string;
    username?: string;
    firstName?: string;
    avatar?: string;
    rating?: number;
    score: number;
    games: number;
    wins?: number;
    losses?: number;
    winRate: number;
    reliability: number;
    provisional: boolean;
    gamesToReliable: number;
  }>;
  loading: boolean;
  globalLeaderboard?: Array<{
    username?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    rating: number;
    score?: number;
    games?: number;
    wins?: number;
    losses?: number;
    winRate?: number;
    provisional?: boolean;
    reliability?: number;
    gamesToReliable?: number;
  }>;
  globalLoading?: boolean;
  myMatchesLeaderboard?: Array<{
    username?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    rating: number;
    score?: number;
    games?: number;
    wins?: number;
    losses?: number;
    winRate?: number;
    provisional?: boolean;
    reliability?: number;
    gamesToReliable?: number;
  }>;
  myMatchesLoading?: boolean;
}>();

defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const leaderboardTab = ref<'club' | 'matches' | 'global'>('club');

const activeLeaderboard = computed(() => {
  if (leaderboardTab.value === 'global') return props.globalLeaderboard || [];
  if (leaderboardTab.value === 'matches')
    return props.myMatchesLeaderboard || [];
  return props.leaderboard;
});

const activeLoading = computed(() => {
  if (leaderboardTab.value === 'global') return props.globalLoading || false;
  if (leaderboardTab.value === 'matches')
    return props.myMatchesLoading || false;
  return props.loading;
});
</script>

<style scoped>
.lb-tooltip {
  max-width: 340px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #f0f0f0;
}
.lb-tooltip-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
}
.lb-tooltip-body {
  font-size: 12px;
  line-height: 1.6;
  color: #666;
}
.lb-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.lb-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.lb-label {
  font-weight: 600;
  color: #333;
  white-space: nowrap;
  flex-shrink: 0;
}
.lb-desc {
  color: #777;
}
.lb-line {
  margin: 8px 0 0 0;
}
.lb-order {
  color: #aaa;
  font-size: 11px;
  letter-spacing: 0.3px;
  margin-top: 10px;
}
.lb-divider {
  height: 1px;
  background: #f0f0f0;
  margin: 12px 0;
}
.lb-legend {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.provisional-dot {
  display: inline-flex;
  align-items: center;
  margin-left: 2px;
}

.provisional-dot-inner {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #fff;
  animation: provisional-pulse 1s ease-in-out infinite;
}

@keyframes provisional-pulse {
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

/* Thin scrollbar — must be unscoped for ::-webkit-scrollbar to work */
</style>

<style>
.leaderboard-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
  /* overlay = scrollbar floats over content, no gutter space reserved.
     Falls back to auto in browsers that don't support overlay. */
  overflow-y: overlay !important;
}
.leaderboard-scroll::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.leaderboard-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.leaderboard-scroll::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}
.leaderboard-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.35);
}
</style>
