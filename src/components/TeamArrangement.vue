<template>
  <div class="team-arrangement">
    <!-- Compact balance + actions bar -->
    <div class="row items-center justify-between q-mb-md">
      <div class="row items-center q-gutter-xs">
        <q-chip
          :color="getBalanceColor()"
          text-color="white"
          :icon="getBalanceIcon()"
          size="sm"
          dense
        >
          {{ getBalanceText() }}
        </q-chip>
        <q-icon v-if="!isBalanced()" name="warning" color="orange" size="xs" />
      </div>
      <div class="row items-center q-gutter-xs">
        <q-btn
          color="accent"
          label="Balance"
          icon="balance"
          @click="balanceTeams"
          outline
          dense
          size="sm"
        />
        <q-btn
          color="accent"
          label="Shuffle"
          icon="shuffle"
          @click="shuffleTeams"
          outline
          dense
          size="sm"
        />
      </div>
    </div>

    <!-- Compact teams layout: Team A | center | Team B -->
    <div class="row items-start no-wrap teams-row">
      <!-- Team 1 -->
      <div class="col text-center team-col">
        <div class="team-header bg-blue-6 text-white">
          <div class="header-left">
            <q-chip
              :label="getTeamSkill(team1)"
              color="white"
              text-color="blue-6"
              size="xs"
              dense
              class="header-chip"
            />
            <span class="header-pct"> {{ getWinProbability().teamA }}% </span>
          </div>
          <div class="header-right">
            <span class="header-stat"> H:{{ getHarmonicMean(team1) }} </span>
            <span class="header-stat"> A:{{ getArithmeticMean(team1) }} </span>
          </div>
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]">
            Rating: 60% Harmonic + 40% Arithmetic · Win: Win Probability · H:
            Harmonic Mean (weakest player weighs more) · A: Arithmetic Mean
            (simple average)
          </q-tooltip>
        </div>
        <div
          v-for="player in team1"
          :key="player.username"
          class="team-player swappable-player"
          :class="{
            'selected-for-swap': selectedForSwap?.username === player.username,
            'can-swap-with':
              selectedForSwap &&
              selectedForSwapTeam !== 'team1' &&
              selectedForSwap.username !== player.username,
            'disabled-teammate':
              selectedForSwap &&
              selectedForSwapTeam === 'team1' &&
              selectedForSwap.username !== player.username,
          }"
          @click="
            selectedForSwap &&
            selectedForSwapTeam === 'team1' &&
            selectedForSwap.username !== player.username
              ? null
              : selectPlayerForSwap(player, 'team1')
          "
        >
          <span
            class="text-weight-medium player-name text-blue-6"
            :class="{
              'text-green': selectedForSwap?.username === player.username,
            }"
          >
            {{ player.firstName || player.username }}
          </span>
          <q-chip
            :label="player.rating || 1450"
            :color="getRatingColor(player.rating || 1450)"
            text-color="white"
            size="xs"
            dense
          />
        </div>
        <div v-if="team1.length === 0" class="text-grey-5 text-caption q-pa-sm">
          Empty
        </div>
      </div>

      <!-- Center: VS icon -->
      <div class="col-auto q-mx-sm center-group">
        <q-icon name="sports_tennis" color="grey-6" size="sm" />
      </div>

      <!-- Team 2 -->
      <div class="col text-center team-col">
        <div class="team-header bg-orange-6 text-white">
          <div class="header-left">
            <q-chip
              :label="getTeamSkill(team2)"
              color="white"
              text-color="orange-6"
              size="xs"
              dense
              class="header-chip"
            />
            <span class="header-pct"> {{ getWinProbability().teamB }}% </span>
          </div>
          <div class="header-right">
            <span class="header-stat"> H:{{ getHarmonicMean(team2) }} </span>
            <span class="header-stat"> A:{{ getArithmeticMean(team2) }} </span>
          </div>
          <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]">
            Rating: 60% Harmonic + 40% Arithmetic · Win: Win Probability · H:
            Harmonic Mean (weakest player weighs more) · A: Arithmetic Mean
            (simple average)
          </q-tooltip>
        </div>
        <div
          v-for="player in team2"
          :key="player.username"
          class="team-player swappable-player"
          :class="{
            'selected-for-swap': selectedForSwap?.username === player.username,
            'can-swap-with':
              selectedForSwap &&
              selectedForSwapTeam !== 'team2' &&
              selectedForSwap.username !== player.username,
            'disabled-teammate':
              selectedForSwap &&
              selectedForSwapTeam === 'team2' &&
              selectedForSwap.username !== player.username,
          }"
          @click="
            selectedForSwap &&
            selectedForSwapTeam === 'team2' &&
            selectedForSwap.username !== player.username
              ? null
              : selectPlayerForSwap(player, 'team2')
          "
        >
          <span
            class="text-weight-medium player-name text-orange-6"
            :class="{
              'text-green': selectedForSwap?.username === player.username,
            }"
          >
            {{ player.firstName || player.username }}
          </span>
          <q-chip
            :label="player.rating || 1450"
            :color="getRatingColor(player.rating || 1450)"
            text-color="white"
            size="xs"
            dense
          />
        </div>
        <div v-if="team2.length === 0" class="text-grey-5 text-caption q-pa-sm">
          Empty
        </div>
      </div>
    </div>

    <!-- Swap hint -->
    <div class="text-center text-caption text-grey-6 q-mt-sm">
      <q-icon name="touch_app" size="xs" /> Click a player, then click another
      to swap
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

  // If clicking another player, swap them in-place (preserve index)
  const team1Array = [...props.team1];
  const team2Array = [...props.team2];

  const fromTeam =
    selectedForSwapTeam.value === 'team1' ? team1Array : team2Array;
  const toTeam = team === 'team1' ? team1Array : team2Array;

  const fromIndex = fromTeam.findIndex(
    (p) => p.username === selectedForSwap.value!.username,
  );
  const toIndex = toTeam.findIndex((p) => p.username === player.username);

  // Swap the players at their original indices
  fromTeam[fromIndex] = player;
  toTeam[toIndex] = selectedForSwap.value;

  emit('update:team1', team1Array);
  emit('update:team2', team2Array);

  // Reset selection
  selectedForSwap.value = null;
  selectedForSwapTeam.value = null;
};
</script>

<style lang="scss" scoped>
.teams-row {
  min-height: 120px;
}

.team-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.team-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-radius: 6px;
  width: 100%;
}

.header-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
}

.header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}

.header-chip {
  margin: 0 !important;
}

.header-pct {
  font-size: 0.75rem;
  opacity: 0.9;
  line-height: 1.1;
}

.header-stat {
  font-size: 0.75rem;
  opacity: 0.7;
  line-height: 1.1;
}

.team-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  touch-action: manipulation;
  width: 100%;

  &:active {
    background-color: rgba(0, 0, 0, 0.08);
  }

  &.selected-for-swap {
    background: rgba(33, 186, 69, 0.15);
    border: 2px solid #21ba45;
    box-shadow: 0 2px 8px rgba(33, 186, 69, 0.3);
  }

  &.can-swap-with {
    border: 2px dashed #21ba45;
    background-color: rgba(33, 186, 69, 0.05);
  }

  &.can-swap-with:hover {
    background-color: rgba(33, 186, 69, 0.12);
    border: 2px dashed #21ba45;
  }

  &.disabled-teammate {
    opacity: 0.4;
    cursor: default;
    pointer-events: none;
  }

  &:hover:not(.selected-for-swap):not(.disabled-teammate) {
    background-color: rgba(0, 0, 0, 0.04);
  }
}

.player-name {
  font-size: 0.8rem;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.center-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 8px;
}

// Mobile adjustments
@media (max-width: 768px) {
  .player-name {
    font-size: 0.75rem;
    max-width: 70px;
  }

  .center-group {
    padding-top: 20px;
  }
}
</style>
