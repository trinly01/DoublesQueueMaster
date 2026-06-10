<template>
  <div class="team-arrangement">
    <!-- Balance Indicator -->
    <div class="balance-indicator q-mb-lg">
      <div class="row items-center justify-between">
        <div class="text-subtitle1">Team Balance</div>
        <div class="row items-center q-gutter-sm">
          <q-chip
            :color="getBalanceColor()"
            text-color="white"
            :icon="getBalanceIcon()"
            size="md"
          >
            {{ getBalanceText() }}
          </q-chip>
          <q-icon v-if="!isBalanced()" name="warning" color="orange" size="sm">
            <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
              >Unbalanced</q-tooltip
            >
          </q-icon>
        </div>
      </div>
      <!-- <div class="text-caption text-grey-7 q-mt-xs">
        Team 1: {{ getTeamSkill(team1) }} vs Team 2: {{ getTeamSkill(team2) }}
      </div> -->
    </div>

    <!-- Team Arrangement Actions -->
    <div class="row q-mb-lg q-gutter-sm">
      <q-btn
        color="accent"
        label="Balance Teams"
        icon="balance"
        @click="balanceTeams"
        outline
      />
      <q-btn
        color="accent"
        label="Shuffle"
        icon="shuffle"
        @click="shuffleTeams"
        outline
      />
    </div>

    <!-- Teams Display -->
    <div class="row q-col-gutter-lg">
      <!-- Team 1 -->
      <div class="col-12 col-md-6">
        <q-card flat bordered>
          <q-card-section class="bg-blue-6 text-white">
            <div class="text-h6">
              Team 1
              <q-chip
                :label="`Rating: ${getTeamSkill(team1)}`"
                color="white"
                text-color="blue-6"
                size="sm"
                class="q-ml-sm"
              />
              <q-chip
                :label="`Win: ${getWinProbability().teamA}%`"
                color="white"
                text-color="blue-6"
                size="sm"
                class="q-ml-sm"
              />
            </div>
            <div class="text-caption q-mt-xs" style="opacity: 0.85">
              H: {{ getHarmonicMean(team1) }} | A:
              {{ getArithmeticMean(team1) }}
            </div>
          </q-card-section>
          <q-card-section class="team-drop-area">
            <div class="text-caption text-grey-6 q-mb-sm text-center">
              <q-icon name="touch_app" size="xs" /> Click to select, click
              another to swap
            </div>
            <q-list v-if="team1.length > 0">
              <q-item
                v-for="(player, index) in team1"
                :key="player.username"
                clickable
                class="team-player-item swappable-player"
                :class="{
                  'selected-for-swap':
                    selectedForSwap?.username === player.username,
                  'can-swap-with':
                    selectedForSwap &&
                    selectedForSwap.username !== player.username,
                }"
                @click="selectPlayerForSwap(player, 'team1')"
              >
                <q-item-section avatar>
                  <q-avatar
                    :color="getLevelColor(player.level)"
                    text-color="white"
                    :class="{
                      'swap-pulse':
                        selectedForSwap?.username === player.username,
                    }"
                  >
                    {{ index + 1 }}
                    <q-tooltip
                      anchor="top middle"
                      self="bottom middle"
                      :offset="[8, 8]"
                      >{{ player.firstName || player.username }} - Rating
                      {{ player.rating || 1500 }} - Position
                      {{ index + 1 }}</q-tooltip
                    >
                  </q-avatar>
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-medium">
                    {{ player.firstName || player.username }}
                    <q-icon
                      v-if="selectedForSwap?.username === player.username"
                      name="check_circle"
                      color="green"
                      size="sm"
                      class="q-ml-xs swap-icon-pulse"
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
                  <q-chip
                    :label="player.rating || 1500"
                    :color="getRatingColor(player.rating || 1500)"
                    text-color="white"
                    size="xs"
                    dense
                    style="width: fit-content"
                  />
                </q-item-section>
                <q-item-section side>
                  <q-icon name="swap_horiz" color="grey-5" size="sm" />
                </q-item-section>
              </q-item>
            </q-list>
            <div v-else class="text-center text-grey-6 q-pa-md empty-team-drop">
              <q-icon name="group_add" size="lg" color="grey-4" />
              <p class="q-mt-sm">Click to assign</p>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Team 2 -->
      <div class="col-12 col-md-6">
        <q-card flat bordered>
          <q-card-section class="bg-orange-6 text-white">
            <div class="text-h6">
              Team 2
              <q-chip
                :label="`Rating: ${getTeamSkill(team2)}`"
                color="white"
                text-color="orange-6"
                size="sm"
                class="q-ml-sm"
              />
              <q-chip
                :label="`Win: ${getWinProbability().teamB}%`"
                color="white"
                text-color="orange-6"
                size="sm"
                class="q-ml-sm"
              />
            </div>
            <div class="text-caption q-mt-xs" style="opacity: 0.85">
              H: {{ getHarmonicMean(team2) }} | A:
              {{ getArithmeticMean(team2) }}
            </div>
          </q-card-section>
          <q-card-section class="team-drop-area">
            <div class="text-caption text-grey-6 q-mb-sm text-center">
              <q-icon name="touch_app" size="xs" /> Click to select, click
              another to swap
            </div>
            <q-list v-if="team2.length > 0">
              <q-item
                v-for="(player, index) in team2"
                :key="player.username"
                clickable
                class="team-player-item swappable-player"
                :class="{
                  'selected-for-swap':
                    selectedForSwap?.username === player.username,
                  'can-swap-with':
                    selectedForSwap &&
                    selectedForSwap.username !== player.username,
                }"
                @click="selectPlayerForSwap(player, 'team2')"
              >
                <q-item-section avatar>
                  <q-avatar
                    :color="getLevelColor(player.level)"
                    text-color="white"
                    :class="{
                      'swap-pulse':
                        selectedForSwap?.username === player.username,
                    }"
                  >
                    {{ index + 1 }}
                    <q-tooltip
                      anchor="top middle"
                      self="bottom middle"
                      :offset="[8, 8]"
                      >{{ player.firstName || player.username }} - Rating
                      {{ player.rating || 1500 }} - Position
                      {{ index + 1 }}</q-tooltip
                    >
                  </q-avatar>
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-medium">
                    {{ player.firstName || player.username }}
                    <q-icon
                      v-if="selectedForSwap?.username === player.username"
                      name="check_circle"
                      color="green"
                      size="sm"
                      class="q-ml-xs swap-icon-pulse"
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
                  <q-chip
                    :label="player.rating || 1500"
                    :color="getRatingColor(player.rating || 1500)"
                    text-color="white"
                    size="xs"
                    dense
                    style="width: fit-content"
                  />
                </q-item-section>
                <q-item-section side>
                  <q-icon name="swap_horiz" color="grey-5" size="sm" />
                </q-item-section>
              </q-item>
            </q-list>
            <div v-else class="text-center text-grey-6 q-pa-md empty-team-drop">
              <q-icon name="group_add" size="lg" color="grey-4" />
              <p class="q-mt-sm">Click to assign</p>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { getRatingColor } from '../utils/playerHelpers';
import {
  computeTeamRating,
  computeWinProbability,
  computeHarmonicMean,
  computeArithmeticMean,
} from '../services/matchmaking';
import type { Player } from '../services/matchmaking';

// Props
interface Props {
  team1: Player[];
  team2: Player[];
  createBalancedMatch: (players: Player[]) => Player[];
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  'update:team1': [team: Player[]];
  'update:team2': [team: Player[]];
}>();

// Local state
const selectedForSwap = ref<Player | null>(null);
const selectedForSwapTeam = ref<'team1' | 'team2' | null>(null);

// Computed properties
const getTeamSkill = (team: Player[]): number => {
  return Math.round(computeTeamRating(team));
};

const getHarmonicMean = (team: Player[]): number => {
  return Math.round(computeHarmonicMean(team));
};

const getArithmeticMean = (team: Player[]): number => {
  return Math.round(computeArithmeticMean(team));
};

const getWinProbability = () => {
  const prob = computeWinProbability(props.team1, props.team2);
  return {
    teamA: Math.round(prob.teamA * 100),
    teamB: Math.round(prob.teamB * 100),
  };
};

const getBalanceDeviation = (): number => {
  const prob = getWinProbability();
  return Math.abs(prob.teamA - 50);
};

const isBalanced = (): boolean => {
  return getBalanceDeviation() <= 20;
};

const getBalanceColor = (): string => {
  const dev = getBalanceDeviation();
  if (dev <= 5) return 'green';
  if (dev <= 10) return 'light-green';
  if (dev <= 20) return 'orange';
  return 'red';
};

const getBalanceIcon = (): string => {
  const dev = getBalanceDeviation();
  if (dev <= 5) return 'verified';
  if (dev <= 10) return 'check_circle';
  if (dev <= 20) return 'warning';
  return 'error';
};

const getBalanceText = (): string => {
  const dev = getBalanceDeviation();
  if (dev <= 5) return 'Perfect Balance';
  if (dev <= 10) return 'Well Balanced';
  if (dev <= 20) return 'Slightly Unbalanced';
  return 'Very Unbalanced';
};

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

// Methods
const balanceTeams = () => {
  const allPlayers = [...props.team1, ...props.team2];
  const balanced = props.createBalancedMatch(allPlayers);
  emit('update:team1', [balanced[0], balanced[1]]);
  emit('update:team2', [balanced[2], balanced[3]]);
};

const shuffleTeams = () => {
  const allPlayers = [...props.team1, ...props.team2];

  // Fisher-Yates shuffle
  for (let i = allPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPlayers[i], allPlayers[j]] = [allPlayers[j], allPlayers[i]];
  }

  emit('update:team1', [allPlayers[0], allPlayers[1]]);
  emit('update:team2', [allPlayers[2], allPlayers[3]]);
};

const selectPlayerForSwap = (player: Player, team: 'team1' | 'team2') => {
  // If no player selected yet, select this one
  if (!selectedForSwap.value) {
    selectedForSwap.value = player;
    selectedForSwapTeam.value = team;
    return;
  }

  // If clicking the same player, deselect
  if (selectedForSwap.value.username === player.username) {
    selectedForSwap.value = null;
    selectedForSwapTeam.value = null;
    return;
  }

  // If clicking another player, swap them
  const team1Array = [...props.team1];
  const team2Array = [...props.team2];

  // Remove both players from their current teams
  const newTeam1 = team1Array.filter(
    (p) =>
      p.username !== selectedForSwap.value!.username &&
      p.username !== player.username,
  );
  const newTeam2 = team2Array.filter(
    (p) =>
      p.username !== selectedForSwap.value!.username &&
      p.username !== player.username,
  );

  // Add them to their new teams
  if (selectedForSwapTeam.value === 'team1') {
    newTeam2.push(selectedForSwap.value);
  } else {
    newTeam1.push(selectedForSwap.value);
  }

  if (team === 'team1') {
    newTeam2.push(player);
  } else {
    newTeam1.push(player);
  }

  emit('update:team1', newTeam1);
  emit('update:team2', newTeam2);

  // Reset selection
  selectedForSwap.value = null;
  selectedForSwapTeam.value = null;
};
</script>

<style lang="scss" scoped>
.balance-indicator {
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 8px;
  border: 2px solid #e0e0e0;
}

.team-player-item {
  transition: background-color 0.2s ease;

  &:hover {
    background-color: rgba(0, 0, 0, 0.02);
  }
}

.team-drop-area {
  min-height: 200px;
  position: relative;
}

.empty-team-drop {
  opacity: 0.6;
}

// Swappable player styles
.swappable-player {
  cursor: pointer;
  transition: all 0.3s ease;
  user-select: none;
  position: relative;
  touch-action: manipulation;

  &:active {
    background-color: rgba(0, 0, 0, 0.08);
  }

  &.selected-for-swap {
    background: linear-gradient(90deg, rgba(33, 186, 69, 0.2), transparent);
    border-left: 4px solid #21ba45;
    box-shadow: 0 4px 12px rgba(33, 186, 69, 0.3);
    animation: pulse-green 1.5s ease-in-out infinite;
  }

  &.can-swap-with:hover {
    background-color: rgba(33, 186, 69, 0.1);
    border: 2px dashed #21ba45;
    transform: translateX(4px);
  }

  &:hover:not(.selected-for-swap) {
    background-color: rgba(0, 0, 0, 0.04);
    transform: translateX(4px);
  }
}

// Animations
@keyframes pulse-green {
  0%,
  100% {
    box-shadow: 0 4px 12px rgba(33, 186, 69, 0.3);
    border-left-width: 4px;
  }

  50% {
    box-shadow: 0 6px 20px rgba(33, 186, 69, 0.6);
    border-left-width: 6px;
  }
}

.swap-icon-pulse {
  animation: icon-bounce 0.8s ease-in-out infinite;
}

@keyframes icon-bounce {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.2);
  }
}

.swap-pulse {
  animation: avatar-pulse 1s ease-in-out infinite;
}

@keyframes avatar-pulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7);
  }

  50% {
    transform: scale(1.1);
    box-shadow: 0 0 0 10px rgba(255, 255, 255, 0);
  }
}
</style>
