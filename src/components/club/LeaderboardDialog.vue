<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-card style="min-width: 320px; max-width: 90vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Club Leaderboard</div>
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
      <q-card-section
        class="q-px-md q-pt-xs q-pb-md"
        style="max-height: 78vh; overflow-y: auto"
      >
        <div v-if="loading" class="flex flex-center q-py-md">
          <q-spinner color="accent" size="32px" />
        </div>
        <q-list separator v-else-if="leaderboard.length">
          <q-item
            v-for="(player, idx) in leaderboard"
            :key="player.username"
            :class="player.winRate >= 50 ? 'bg-green-1' : 'bg-red-1'"
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
            <q-item-section side class="text-right">
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
                    anchor="center left"
                    self="center right"
                    :offset="[8, 0]"
                    class="text-no-wrap"
                  >
                    <template v-if="player.provisional">
                      {{ player.gamesToReliable }} games to rank up
                    </template>
                    <template v-else>
                      {{ Math.round(player.reliability * 100) }}% solid
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
import PlayerAvatar from '../PlayerAvatar.vue';
import { getRatingColor } from '../../utils/playerHelpers';

defineOptions({ name: 'LeaderboardDialog' });

defineProps<{
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
}>();

defineEmits<{
  'update:modelValue': [value: boolean];
}>();
</script>

<style scoped>
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
</style>
