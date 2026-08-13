<template>
  <section class="section">
    <div class="container">
      <div class="text-center q-mb-xl">
        <h2 class="section-title">Stuck playing the same people?</h2>
        <p class="section-subtitle">
          16 players, 2 courts. See what happens with plain FIFO vs DinkMatch.
        </p>
      </div>

      <!-- Legend -->
      <div class="legend">
        <div class="legend-item">
          <span class="skill-dot beginner"></span> Beginner
        </div>
        <div class="legend-item">
          <span class="skill-dot intermediate"></span> Intermediate
        </div>
        <div class="legend-item">
          <span class="skill-dot advanced"></span> Advanced
        </div>
      </div>

      <!-- Player count control -->
      <div class="player-count-control q-mt-md">
        <div class="player-count-label">Players: {{ playerCount }}</div>
        <q-slider
          v-model="playerCount"
          :min="8"
          :max="24"
          :step="1"
          label
          label-always
          switch-label-side
          color="primary"
          style="max-width: 300px"
        />
      </div>

      <!-- Two flex columns: independent headers/controls, shared min-heights on courts/racks -->
      <div class="sim-wrapper q-mt-md">
        <!-- LEFT: The old way -->
        <div class="sim-col sim-old">
          <div class="sim-header">
            <q-icon name="warning" size="20px" class="q-mr-xs" />
            The old way — FIFO paddle rack
          </div>

          <!-- Spacer: pushes controls + courts down to align with right column -->
          <div class="controls-spacer"></div>

          <div class="controls-row">
            <div class="round-counter">
              <q-icon name="replay" size="14px" />
              Round {{ leftRound }}
            </div>
            <div
              class="draft-status"
              :class="leftDraftStep > 7 ? 'draft-done' : 'draft-active'"
              :key="leftDraftStep > 7 ? 'done' : 'drafting'"
            >
              <q-icon
                :name="leftDraftStep > 7 ? 'play_circle' : 'hourglass_top'"
                size="14px"
              />
              <span v-if="leftDraftStep > 7">Match on — next round soon</span>
              <span v-else>Queueing players... ({{ leftDraftStep }}/8)</span>
            </div>
          </div>

          <!-- Court 1 -->
          <div class="court-block">
            <div class="court-label">
              <q-icon name="repeat" size="14px" class="q-mr-xs" />
              Court 1 — winners play winners
            </div>
            <div class="court-teams">
              <TransitionGroup name="paddle-move" tag="div" class="court-team">
                <div
                  v-for="p in leftCourt1.teamA"
                  :key="p"
                  class="paddle-chip"
                  :class="playerSkill(p)"
                >
                  {{ p }}
                  <span class="skill-dot" :class="playerSkill(p)"></span>
                </div>
              </TransitionGroup>
              <div class="vs">vs</div>
              <TransitionGroup name="paddle-move" tag="div" class="court-team">
                <div
                  v-for="p in leftCourt1.teamB"
                  :key="p"
                  class="paddle-chip"
                  :class="playerSkill(p)"
                >
                  {{ p }}
                  <span class="skill-dot" :class="playerSkill(p)"></span>
                </div>
              </TransitionGroup>
            </div>
            <div class="court-callout callout-bad">
              <q-icon name="repeat" size="14px" />
              <span v-if="leftRound <= 2">Same faces, same teams</span>
              <span v-else>Round {{ leftRound }} — still the same winners</span>
            </div>
          </div>

          <!-- Court 2 -->
          <div class="court-block">
            <div class="court-label">
              <q-icon name="whatshot" size="14px" class="q-mr-xs" />
              Court 2 — losers play losers, no balancing
            </div>
            <div class="court-teams">
              <TransitionGroup name="paddle-move" tag="div" class="court-team">
                <div
                  v-for="p in leftCourt2.teamA"
                  :key="p"
                  class="paddle-chip"
                  :class="playerSkill(p)"
                >
                  {{ p }}
                  <span class="skill-dot" :class="playerSkill(p)"></span>
                </div>
              </TransitionGroup>
              <div class="vs">vs</div>
              <TransitionGroup name="paddle-move" tag="div" class="court-team">
                <div
                  v-for="p in leftCourt2.teamB"
                  :key="p"
                  class="paddle-chip"
                  :class="playerSkill(p)"
                >
                  {{ p }}
                  <span class="skill-dot" :class="playerSkill(p)"></span>
                </div>
              </TransitionGroup>
            </div>
            <div class="court-callout callout-bad">
              <q-icon name="whatshot" size="14px" />
              <span>Pro + beginner vs pro + beginner — blowout!</span>
            </div>
          </div>

          <!-- Placeholder: matches right's general queue height for rack alignment -->
          <div class="queue-placeholder" v-if="rightGeneralQueue.length"></div>

          <!-- Winners rack -->
          <div class="waiting-strip waiting-strip-winners">
            <span class="waiting-label">
              <q-icon name="emoji_events" size="12px" class="q-mr-xs" />
              Winners rack:
            </span>
            <TransitionGroup name="paddle-queue" tag="div" class="queue-chips">
              <div
                v-for="p in leftWinnersRack"
                :key="p"
                class="paddle-chip paddle-chip-sm"
                :class="playerSkill(p)"
              >
                {{ p }}
                <span class="skill-dot" :class="playerSkill(p)"></span>
              </div>
            </TransitionGroup>
          </div>

          <!-- Losers rack -->
          <div class="waiting-strip waiting-strip-losers">
            <span class="waiting-label">
              <q-icon
                name="sentiment_dissatisfied"
                size="12px"
                class="q-mr-xs"
              />
              Losers rack:
            </span>
            <TransitionGroup name="paddle-queue" tag="div" class="queue-chips">
              <div
                v-for="p in leftLosersRack"
                :key="p"
                class="paddle-chip paddle-chip-sm"
                :class="playerSkill(p)"
              >
                {{ p }}
                <span class="skill-dot" :class="playerSkill(p)"></span>
              </div>
            </TransitionGroup>
          </div>
        </div>

        <!-- RIGHT: DinkMatch -->
        <div class="sim-col sim-new">
          <div class="sim-header sim-header-good">
            <q-icon name="check_circle" size="20px" class="q-mr-xs" />
            DinkMatch — smart matchmaking
          </div>

          <div class="controls-row">
            <div class="row q-col-gutter-sm controls-dropdowns">
              <div class="col">
                <q-select
                  v-model="modeSelectValue"
                  :options="modeOptions"
                  outlined
                  dense
                  label="Matchmaking mode"
                  class="mode-select"
                  @update:model-value="onModeSelect"
                />
              </div>
              <div class="col">
                <q-select
                  v-model="priorityModeValue"
                  :options="priorityModeOptions"
                  outlined
                  dense
                  label="Queue priority"
                  class="mode-select"
                  @update:model-value="onPriorityModeChange"
                />
              </div>
            </div>
          </div>
          <div class="mode-desc-bar" :key="rightModeIndex">
            <div class="mode-desc-inline">
              {{ currentModeDef.description }}
            </div>
          </div>
          <div class="controls-row">
            <div class="round-counter round-counter-good">
              <q-icon name="replay" size="14px" />
              Round {{ rightRound }}
            </div>
            <div
              class="draft-status"
              :class="draftStep > 7 ? 'draft-done' : 'draft-active'"
              :key="draftStep > 7 ? 'done' : 'drafting'"
            >
              <q-icon
                :name="draftStep > 7 ? 'check_circle' : 'hourglass_top'"
                size="14px"
              />
              <span v-if="draftStep > 7"
                >Match set! Teams balanced by {{ currentModeDef.label }}</span
              >
              <span v-else>Drafting players... ({{ draftStep }}/8)</span>
            </div>
          </div>

          <!-- Court 1 -->
          <div class="court-block court-block-good">
            <div class="court-label">Court 1</div>
            <div class="court-teams">
              <TransitionGroup name="paddle-move" tag="div" class="court-team">
                <div
                  v-for="p in rightCourt1TeamA"
                  :key="p"
                  class="paddle-chip"
                  :class="playerSkill(p)"
                >
                  {{ p }}
                  <span class="skill-dot" :class="playerSkill(p)"></span>
                </div>
              </TransitionGroup>
              <div class="vs">vs</div>
              <TransitionGroup name="paddle-move" tag="div" class="court-team">
                <div
                  v-for="p in rightCourt1TeamB"
                  :key="p"
                  class="paddle-chip"
                  :class="playerSkill(p)"
                >
                  {{ p }}
                  <span class="skill-dot" :class="playerSkill(p)"></span>
                </div>
              </TransitionGroup>
            </div>
            <div class="court-callout callout-good">
              <q-icon name="balance" size="14px" />
              <span v-if="rightRound <= 2">Fresh matchups every round</span>
              <span v-else
                >Round {{ rightRound }} — still balanced by rating</span
              >
            </div>
          </div>

          <!-- Court 2 -->
          <div class="court-block court-block-good">
            <div class="court-label">Court 2</div>
            <div class="court-teams">
              <TransitionGroup name="paddle-move" tag="div" class="court-team">
                <div
                  v-for="p in rightCourt2TeamA"
                  :key="p"
                  class="paddle-chip"
                  :class="playerSkill(p)"
                >
                  {{ p }}
                  <span class="skill-dot" :class="playerSkill(p)"></span>
                </div>
              </TransitionGroup>
              <div class="vs">vs</div>
              <TransitionGroup name="paddle-move" tag="div" class="court-team">
                <div
                  v-for="p in rightCourt2TeamB"
                  :key="p"
                  class="paddle-chip"
                  :class="playerSkill(p)"
                >
                  {{ p }}
                  <span class="skill-dot" :class="playerSkill(p)"></span>
                </div>
              </TransitionGroup>
            </div>
            <div class="court-callout callout-good">
              <q-icon name="balance" size="14px" />
              <span>Even teams — no blowouts here</span>
            </div>
          </div>

          <!-- General queue -->
          <div
            class="waiting-strip waiting-strip-good"
            v-if="rightGeneralQueue.length"
          >
            <span class="waiting-label">
              <q-icon name="schedule" size="12px" class="q-mr-xs" />
              Next up:
            </span>
            <TransitionGroup name="paddle-queue" tag="div" class="queue-chips">
              <div
                v-for="p in rightGeneralQueue"
                :key="p"
                class="paddle-chip paddle-chip-sm"
                :class="playerSkill(p)"
              >
                {{ p }}
                <span class="skill-dot" :class="playerSkill(p)"></span>
              </div>
            </TransitionGroup>
          </div>

          <!-- Winners rack -->
          <div class="waiting-strip waiting-strip-winners">
            <span class="waiting-label">
              <q-icon name="emoji_events" size="12px" class="q-mr-xs" />
              Winners:
            </span>
            <TransitionGroup name="paddle-queue" tag="div" class="queue-chips">
              <div
                v-for="p in rightWinnersQueue"
                :key="p"
                class="paddle-chip paddle-chip-sm"
                :class="playerSkill(p)"
              >
                {{ p }}
                <span class="skill-dot" :class="playerSkill(p)"></span>
              </div>
            </TransitionGroup>
          </div>

          <!-- Losers rack -->
          <div class="waiting-strip waiting-strip-losers">
            <span class="waiting-label">
              <q-icon
                name="sentiment_dissatisfied"
                size="12px"
                class="q-mr-xs"
              />
              Losers:
            </span>
            <TransitionGroup name="paddle-queue" tag="div" class="queue-chips">
              <div
                v-for="p in rightLosersQueue"
                :key="p"
                class="paddle-chip paddle-chip-sm"
                :class="playerSkill(p)"
              >
                {{ p }}
                <span class="skill-dot" :class="playerSkill(p)"></span>
              </div>
            </TransitionGroup>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
  MatchmakerEngine,
  RatingEngine,
  computeWinProbability,
  type Player,
} from 'src/services/matchmaking';

// ============ Player count control ============
const playerCount = ref(16);

// ============ Mock players with realistic ratings ============
const skillForRating = (
  rating: number,
): 'beginner' | 'intermediate' | 'advanced' => {
  if (rating >= 1600) return 'advanced';
  if (rating >= 1400) return 'intermediate';
  return 'beginner';
};

function makePlayer(username: string, rating: number): Player {
  return {
    username,
    level: rating >= 1600 ? 3 : rating >= 1400 ? 2 : 1,
    rating,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    history: { playedWith: {}, playedAgainst: {} },
  };
}

// Ratings spread linearly from 1750 (best) down to 1250 (worst)
function generateSimPlayers(count: number): Player[] {
  const players: Player[] = [];
  const maxRating = 1750;
  const minRating = 1250;
  for (let i = 0; i < count; i++) {
    const rating = Math.round(
      maxRating - ((maxRating - minRating) * i) / Math.max(1, count - 1),
    );
    players.push(makePlayer(`P${i + 1}`, rating));
  }
  return players;
}

const simPlayers = ref<Player[]>(generateSimPlayers(playerCount.value));

const playerSkill = (
  username: string,
): 'beginner' | 'intermediate' | 'advanced' =>
  skillForRating(
    simPlayerState.find((p) => p.username === username)?.rating ??
      simPlayers.value.find((p) => p.username === username)?.rating ??
      1450,
  );

// ============ Mode definitions (matching real app) ============
const modeDefs = [
  {
    label: 'Casual',
    value: 'fair_balance' as const,
    description:
      'Drafts the next in line, then builds the most balanced teams by skill rating',
  },
  {
    label: 'Social',
    value: 'variety_first' as const,
    description:
      'Drafts the next in line, then prioritizes new partners and opponents each round',
  },
  {
    label: 'Standard',
    value: 'balanced_variety' as const,
    description:
      'Drafts the next in line, then balances fair teams with fresh matchups equally',
  },
  {
    label: 'Competitive',
    value: 'balance_first' as const,
    description:
      'Drafts the next in line, then builds the closest games while avoiding repeat matchups',
  },
  {
    label: 'Pro Pick',
    value: 'strict_balance' as const,
    description:
      'Picks from the whole pool. Drafts top or bottom-rated players first',
  },
];

const modeOptions = modeDefs.map((m, i) => ({ label: m.label, value: i }));
const modeSelectValue = ref(modeOptions[0]);
const rightModeIndex = ref(0);
const currentModeDef = computed(() => modeDefs[rightModeIndex.value]);

// Queue priority mode — mirrors ClubPage's queuePriorityMode setting
const priorityModeOptions = [
  { label: 'Fewest games played', value: 'gamesPlayed' },
  { label: 'First come, first served', value: 'timestamp' },
];
const priorityModeValue = ref(priorityModeOptions[0]);
let queuePriorityMode: 'gamesPlayed' | 'timestamp' = 'gamesPlayed';

function onPriorityModeChange(val: { label: string; value: string }) {
  queuePriorityMode = val.value as 'gamesPlayed' | 'timestamp';
  // Reset simulation state for clean restart
  simPlayerState = queueOrder.value.map((username) => {
    const p = simPlayers.value.find((sp) => sp.username === username)!;
    return {
      ...p,
      matchesPlayed: 0,
      history: { playedWith: {}, playedAgainst: {} },
    };
  });
  rightQueueState = queueOrder.value.map((username, i) => ({
    username,
    queueType: 'GENERAL' as const,
    enteredAt: i,
  }));
  allStarSortDirection = 'desc';
  preferWinners = true;
  startDraft();
}

// ============ Shared FIFO queue order ============
// Both sides use this same order — players joined at different times
// 8 players always start on courts (2 courts × 4), rest split between winners/losers racks
// Right side: all start in queue, first 8 drafted for round 1
const queueOrder = computed(() => {
  const n = playerCount.value;
  const rackCount = n - 8; // players in racks (winners + losers)
  const winnersCount = Math.ceil(rackCount / 2);
  const order: string[] = [];
  // Winners rack: middle-high rated players (just below court players)
  for (let i = 8; i < 8 + winnersCount; i++) order.push(`P${i + 1}`);
  // Losers rack: lowest rated players
  for (let i = 8 + winnersCount; i < n; i++) order.push(`P${i + 1}`);
  // Courts: top 8 rated players (P1-P8)
  for (let i = 0; i < 8; i++) order.push(`P${i + 1}`);
  return order;
});

// Deep clone players so history accumulates across rounds
let simPlayerState: Player[] = queueOrder.value.map((username) => {
  const p = simPlayers.value.find((sp) => sp.username === username)!;
  return {
    ...p,
    history: {
      playedWith: { ...p.history!.playedWith },
      playedAgainst: { ...p.history!.playedAgainst },
    },
  };
});

// Current draft results for display
const rightMatches = ref<{ teamA: string[]; teamB: string[] }[]>([]);
const draftStep = ref(0);
const rightRound = ref(1);
const DRAFT_STEP_MS = 600;
const DRAFT_HOLD_MS = 2000; // hold after all 8 placed before next round
const TOTAL_PICKS = 8; // 2 courts × 4 players
let draftTimer:
  | ReturnType<typeof setInterval>
  | ReturnType<typeof setTimeout>
  | null = null;

// Track queue with types — matches real app's GENERAL/WINNERS/LOSERS queue system
type SimQueueEntry = {
  username: string;
  queueType: 'GENERAL' | 'WINNERS' | 'LOSERS';
  enteredAt: number;
};
let rightQueueState: SimQueueEntry[] = queueOrder.value.map((username, i) => ({
  username,
  queueType: 'GENERAL' as const,
  enteredAt: i,
}));
// Track last drafted players so we can reorder queue after the hold
let lastDraftedUsernames: string[] = [];
// Track last match results (winners/losers/scores) for queue return and rating update
let lastMatchResults: {
  winners: string[];
  losers: string[];
  scoreW: number;
  scoreL: number;
}[] = [];
// Pro Pick sort direction alternates each round (like real app)
let allStarSortDirection: 'desc' | 'asc' = 'desc';
// Alternator flag: when WINNERS and LOSERS brackets are tied on priority,
// alternate which bracket gets drafted first to prevent losers from being stuck
let preferWinners = true;

// Generate matches using real MatchmakerEngine with queue type logic
function generateRoundMatches(): { teamA: string[]; teamB: string[] }[] {
  const mode = currentModeDef.value.value;
  const isStrictBalance = mode === 'strict_balance';
  const playersNeeded = 4; // teamSize=2, 2 teams per match

  // Sort queue: strict_balance sorts by rating (alternating dir), others by gamesPlayed then enteredAt
  const sortedQueue = [...rightQueueState];
  if (isStrictBalance) {
    sortedQueue.sort((a, b) => {
      const ratingA =
        simPlayerState.find((p) => p.username === a.username)?.rating ?? 1450;
      const ratingB =
        simPlayerState.find((p) => p.username === b.username)?.rating ?? 1450;
      if (ratingA !== ratingB) {
        return allStarSortDirection === 'desc'
          ? ratingB - ratingA
          : ratingA - ratingB;
      }
      return a.enteredAt - b.enteredAt;
    });
  } else {
    sortedQueue.sort((a, b) => {
      if (queuePriorityMode === 'gamesPlayed') {
        const playedA =
          simPlayerState.find((p) => p.username === a.username)
            ?.matchesPlayed || 0;
        const playedB =
          simPlayerState.find((p) => p.username === b.username)
            ?.matchesPlayed || 0;
        if (playedA !== playedB) return playedA - playedB;
      }
      return a.enteredAt - b.enteredAt;
    });
  }

  const matches: { teamA: string[]; teamB: string[] }[] = [];
  const draftedUsernames: string[] = [];
  const matchResults: {
    winners: string[];
    losers: string[];
    scoreW: number;
    scoreL: number;
  }[] = [];
  let remainingQueue = [...sortedQueue];

  // Draft 2 matches (2 courts × 4 players = 8 players)
  for (let court = 0; court < 2; court++) {
    if (remainingQueue.length < playersNeeded) break;

    let draftedEntries: SimQueueEntry[] = [];

    if (isStrictBalance) {
      draftedEntries = remainingQueue.slice(0, playersNeeded);
    } else {
      // Real app draft logic: GENERAL first, then priority-aware W/L alternation
      const general = remainingQueue.filter((q) => q.queueType === 'GENERAL');
      const winners = remainingQueue.filter((q) => q.queueType === 'WINNERS');
      const losers = remainingQueue.filter((q) => q.queueType === 'LOSERS');

      if (general.length >= playersNeeded) {
        draftedEntries = general.slice(0, playersNeeded);
      } else if (
        general.length > 0 &&
        general.length + losers.length >= playersNeeded
      ) {
        const neededFromLosers = playersNeeded - general.length;
        draftedEntries = [...general, ...losers.slice(0, neededFromLosers)];
      } else if (
        winners.length >= playersNeeded &&
        losers.length >= playersNeeded
      ) {
        // Both brackets have enough — use priority to decide, alternator as tiebreaker
        const bestWinner = winners[0];
        const bestLoser = losers[0];

        let draftWinnersFirst: boolean;
        if (queuePriorityMode === 'gamesPlayed') {
          const winnerPlayed =
            simPlayerState.find((p) => p.username === bestWinner.username)
              ?.matchesPlayed || 0;
          const loserPlayed =
            simPlayerState.find((p) => p.username === bestLoser.username)
              ?.matchesPlayed || 0;
          if (winnerPlayed !== loserPlayed) {
            draftWinnersFirst = winnerPlayed < loserPlayed;
          } else if (bestWinner.enteredAt !== bestLoser.enteredAt) {
            draftWinnersFirst = bestWinner.enteredAt < bestLoser.enteredAt;
          } else {
            draftWinnersFirst = preferWinners;
            preferWinners = !preferWinners;
          }
        } else {
          // timestamp mode: purely enteredAt
          if (bestWinner.enteredAt !== bestLoser.enteredAt) {
            draftWinnersFirst = bestWinner.enteredAt < bestLoser.enteredAt;
          } else {
            draftWinnersFirst = preferWinners;
            preferWinners = !preferWinners;
          }
        }

        if (draftWinnersFirst) {
          draftedEntries = winners.slice(0, playersNeeded);
        } else {
          draftedEntries = losers.slice(0, playersNeeded);
        }
      } else if (winners.length >= playersNeeded) {
        draftedEntries = winners.slice(0, playersNeeded);
      } else if (losers.length >= playersNeeded) {
        draftedEntries = losers.slice(0, playersNeeded);
      } else {
        draftedEntries = remainingQueue.slice(0, playersNeeded);
      }
    }

    // Remove drafted from remaining queue
    const draftedUsernamesSet = new Set(draftedEntries.map((e) => e.username));
    remainingQueue = remainingQueue.filter(
      (q) => !draftedUsernamesSet.has(q.username),
    );
    draftedUsernames.push(...draftedEntries.map((e) => e.username));

    const draftedPlayers = draftedEntries.map(
      (e) => simPlayerState.find((p) => p.username === e.username)!,
    );

    const result = MatchmakerEngine.draftBalancedMatch(draftedPlayers, 2, mode);
    const teamA = result.teamA.map((p) => p.username);
    const teamB = result.teamB.map((p) => p.username);
    matches.push({ teamA, teamB });

    // Determine winner based on team rating (Elo expected win probability)
    const prob = computeWinProbability(result.teamA, result.teamB);
    const teamAWon = Math.random() < prob.teamA;
    const winners = teamAWon ? result.teamA : result.teamB;
    const losers = teamAWon ? result.teamB : result.teamA;

    // Generate a simulated score: winner gets 11, loser score based on
    // how close the matchup is (higher prob → more dominant win)
    const winProb = teamAWon ? prob.teamA : prob.teamB;
    const loserScore = Math.max(
      0,
      Math.round(11 - (winProb - 0.5) * 16 - Math.random() * 3),
    );
    const scoreW = 11;
    const scoreL = Math.min(10, loserScore);

    matchResults.push({
      winners: winners.map((p) => p.username),
      losers: losers.map((p) => p.username),
      scoreW,
      scoreL,
    });

    // History is NOT updated here — it's updated in commitRoundToQueue
    // (real app updates history in reportMatchScore, after match completes)
  }

  // Store for later queue return (after hold completes)
  lastDraftedUsernames = draftedUsernames;
  lastMatchResults = matchResults;

  return matches;
}

// Return players to queue with WINNERS/LOSERS types, update history & matchesPlayed
// This matches the real app: winners → WINNERS queue, losers → LOSERS queue
// queueReturnMethod = 'fairness_first' (default) → enteredAt = 0 (jump to front)
function commitRoundToQueue() {
  // Remove drafted players from queue
  rightQueueState = rightQueueState.filter(
    (q) => !lastDraftedUsernames.includes(q.username),
  );

  // Return winners to WINNERS queue, losers to LOSERS queue (matches real app)
  // fairness_first: enteredAt = 0 (jump to front of queue)
  for (const result of lastMatchResults) {
    for (const username of result.winners) {
      rightQueueState.push({
        username,
        queueType: 'WINNERS' as const,
        enteredAt: 0,
      });
    }
    for (const username of result.losers) {
      rightQueueState.push({
        username,
        queueType: 'LOSERS' as const,
        enteredAt: 0,
      });
    }
  }

  // Update match history (real app does this in reportMatchScore)
  for (const result of lastMatchResults) {
    const winners = result.winners.map(
      (u) => simPlayerState.find((p) => p.username === u)!,
    );
    const losers = result.losers.map(
      (u) => simPlayerState.find((p) => p.username === u)!,
    );

    // Update playedWith for teammates
    const updateTeamHistory = (team: Player[]) => {
      for (const p of team) {
        for (const teammate of team) {
          if (p.username !== teammate.username) {
            p.history!.playedWith[teammate.username] =
              (p.history!.playedWith[teammate.username] || 0) + 1;
          }
        }
      }
    };
    updateTeamHistory(winners);
    updateTeamHistory(losers);

    // Update playedAgainst for opponents
    for (const w of winners) {
      for (const l of losers) {
        w.history!.playedAgainst[l.username] =
          (w.history!.playedAgainst[l.username] || 0) + 1;
        l.history!.playedAgainst[w.username] =
          (l.history!.playedAgainst[w.username] || 0) + 1;
      }
    }
  }

  // Update ratings, wins, losses, matchesPlayed via RatingEngine (matches real app's reportMatchScore)
  for (const result of lastMatchResults) {
    const winnerPlayers = result.winners.map(
      (u) => simPlayerState.find((p) => p.username === u)!,
    );
    const loserPlayers = result.losers.map(
      (u) => simPlayerState.find((p) => p.username === u)!,
    );

    const { updatedWinners, updatedLosers } = RatingEngine.calculateShift(
      winnerPlayers,
      loserPlayers,
      result.scoreW,
      result.scoreL,
    );

    // Apply updated player objects back to simPlayerState
    for (const p of updatedWinners) {
      const idx = simPlayerState.findIndex((sp) => sp.username === p.username);
      if (idx !== -1) simPlayerState[idx] = p;
    }
    for (const p of updatedLosers) {
      const idx = simPlayerState.findIndex((sp) => sp.username === p.username);
      if (idx !== -1) simPlayerState[idx] = p;
    }
  }

  // Alternate Pro Pick sort direction for next round (like real app)
  const mode = currentModeDef.value.value;
  if (mode === 'strict_balance') {
    allStarSortDirection = allStarSortDirection === 'desc' ? 'asc' : 'desc';
  }
}

// Draft order: interleave court1/court2 picks
const draftOrder = computed(() => {
  if (rightMatches.value.length < 2) return [];
  const m1 = rightMatches.value[0];
  const m2 = rightMatches.value[1];
  return [
    { player: m1.teamA[0], court: 1, team: 'A' as const },
    { player: m1.teamB[0], court: 1, team: 'B' as const },
    { player: m1.teamA[1], court: 1, team: 'A' as const },
    { player: m1.teamB[1], court: 1, team: 'B' as const },
    { player: m2.teamA[0], court: 2, team: 'A' as const },
    { player: m2.teamB[0], court: 2, team: 'B' as const },
    { player: m2.teamA[1], court: 2, team: 'A' as const },
    { player: m2.teamB[1], court: 2, team: 'B' as const },
  ];
});

const placedPicks = computed(() => draftOrder.value.slice(0, draftStep.value));

const rightCourt1TeamA = computed(() =>
  placedPicks.value
    .filter((p) => p.court === 1 && p.team === 'A')
    .map((p) => p.player),
);
const rightCourt1TeamB = computed(() =>
  placedPicks.value
    .filter((p) => p.court === 1 && p.team === 'B')
    .map((p) => p.player),
);
const rightCourt2TeamA = computed(() =>
  placedPicks.value
    .filter((p) => p.court === 2 && p.team === 'A')
    .map((p) => p.player),
);
const rightCourt2TeamB = computed(() =>
  placedPicks.value
    .filter((p) => p.court === 2 && p.team === 'B')
    .map((p) => p.player),
);

// Right queue split by type for visual racks
const rightGeneralQueue = computed(() => {
  const placed = new Set<string>(placedPicks.value.map((p) => p.player));
  return rightQueueState
    .filter((q) => q.queueType === 'GENERAL' && !placed.has(q.username))
    .map((q) => q.username);
});
const rightWinnersQueue = computed(() => {
  const placed = new Set<string>(placedPicks.value.map((p) => p.player));
  return rightQueueState
    .filter((q) => q.queueType === 'WINNERS' && !placed.has(q.username))
    .map((q) => q.username);
});
const rightLosersQueue = computed(() => {
  const placed = new Set<string>(placedPicks.value.map((p) => p.player));
  return rightQueueState
    .filter((q) => q.queueType === 'LOSERS' && !placed.has(q.username))
    .map((q) => q.username);
});

function startDraft() {
  // Generate fresh matches using real engine
  rightMatches.value = generateRoundMatches();
  draftStep.value = 0;
  if (draftTimer) clearInterval(draftTimer as ReturnType<typeof setInterval>);
  draftTimer = setInterval(() => {
    draftStep.value++;
    if (draftStep.value > TOTAL_PICKS) {
      // Hold the completed match briefly, then commit and generate next round
      clearInterval(draftTimer as ReturnType<typeof setInterval>);
      draftTimer = setTimeout(() => {
        commitRoundToQueue();
        rightMatches.value = generateRoundMatches();
        draftStep.value = 0;
        rightRound.value++;
        startDraftInterval();
      }, DRAFT_HOLD_MS);
    }
  }, DRAFT_STEP_MS);
}

function startDraftInterval() {
  if (draftTimer) clearTimeout(draftTimer as ReturnType<typeof setTimeout>);
  draftTimer = setInterval(() => {
    draftStep.value++;
    if (draftStep.value > TOTAL_PICKS) {
      clearInterval(draftTimer as ReturnType<typeof setInterval>);
      draftTimer = setTimeout(() => {
        commitRoundToQueue();
        rightMatches.value = generateRoundMatches();
        draftStep.value = 0;
        rightRound.value++;
        startDraftInterval();
      }, DRAFT_HOLD_MS);
    }
  }, DRAFT_STEP_MS);
}

function onModeSelect(val: { label: string; value: number }) {
  rightModeIndex.value = val.value;
  // Reset history, matchesPlayed, and queue order when switching modes
  simPlayerState = queueOrder.value.map((username) => {
    const p = simPlayers.value.find((sp) => sp.username === username)!;
    return {
      ...p,
      matchesPlayed: 0,
      history: { playedWith: {}, playedAgainst: {} },
    };
  });
  rightQueueState = queueOrder.value.map((username, i) => ({
    username,
    queueType: 'GENERAL' as const,
    enteredAt: i,
  }));
  allStarSortDirection = 'desc';
  preferWinners = true;
  startDraft();
}

// ============ LEFT SIDE — FIFO win/lose stacking simulation ============
const leftRound = ref(1);
const LEFT_STEP_MS = 600;
const LEFT_HOLD_MS = 2000;
const LEFT_TOTAL_PICKS = 8;
let leftTimer:
  | ReturnType<typeof setInterval>
  | ReturnType<typeof setTimeout>
  | null = null;

interface LeftState {
  court1: { teamA: string[]; teamB: string[] };
  court2: { teamA: string[]; teamB: string[] };
  winnersRack: string[];
  losersRack: string[];
}

// Pending next round — computed when current round completes, placed one by one
const leftPending = ref<{
  court1: { teamA: string[]; teamB: string[] };
  court2: { teamA: string[]; teamB: string[] };
} | null>(null);
const leftDraftStep = ref(0);

function buildInitialLeftState(): LeftState {
  const order = queueOrder.value;
  const rackCount = order.length - 8;
  const winnersCount = Math.ceil(rackCount / 2);
  const winnersRack = order.slice(0, winnersCount);
  const losersRack = order.slice(
    winnersCount,
    winnersCount + rackCount - winnersCount,
  );
  const courtPlayers = order.slice(winnersCount + (rackCount - winnersCount));
  const c1 = courtPlayers.slice(0, 4);
  const c2 = courtPlayers.slice(4, 8);
  return {
    court1: {
      teamA: c1.slice(0, 2),
      teamB: c1.slice(2, 4),
    },
    court2: {
      teamA: c2.slice(0, 2),
      teamB: c2.slice(2, 4),
    },
    winnersRack,
    losersRack,
  };
}

const leftState = ref<LeftState>(buildInitialLeftState());

// Compute next round: requeue winners/losers, pull next 4 from each rack
function computeNextLeftRound(): {
  court1: { teamA: string[]; teamB: string[] };
  court2: { teamA: string[]; teamB: string[] };
  winnersRack: string[];
  losersRack: string[];
  draftedWinners: string[];
  draftedLosers: string[];
  remainingWinners: string[];
  remainingLosers: string[];
} {
  const s = leftState.value;

  // Determine winners/losers based on team rating (Elo expected win probability)
  // Use simPlayerState for live ratings (updated by RatingEngine)
  const getTeamPlayers = (team: string[]) =>
    team.map(
      (u) =>
        simPlayerState.find((p) => p.username === u) ??
        simPlayers.value.find((p) => p.username === u)!,
    );

  const c1Prob = computeWinProbability(
    getTeamPlayers(s.court1.teamA),
    getTeamPlayers(s.court1.teamB),
  );
  const c2Prob = computeWinProbability(
    getTeamPlayers(s.court2.teamA),
    getTeamPlayers(s.court2.teamB),
  );
  const c1TeamAWon = Math.random() < c1Prob.teamA;
  const c2TeamAWon = Math.random() < c2Prob.teamA;
  const c1W = c1TeamAWon ? s.court1.teamA : s.court1.teamB;
  const c1L = c1TeamAWon ? s.court1.teamB : s.court1.teamA;
  const c2W = c2TeamAWon ? s.court2.teamA : s.court2.teamB;
  const c2L = c2TeamAWon ? s.court2.teamB : s.court2.teamA;

  // Generate simulated scores and update ratings via RatingEngine (same as right side)
  const c1WinProb = c1TeamAWon ? c1Prob.teamA : c1Prob.teamB;
  const c2WinProb = c2TeamAWon ? c2Prob.teamA : c2Prob.teamB;
  const genScore = (winProb: number) => {
    const loserScore = Math.max(
      0,
      Math.round(11 - (winProb - 0.5) * 16 - Math.random() * 3),
    );
    return { scoreW: 11, scoreL: Math.min(10, loserScore) };
  };
  const c1Score = genScore(c1WinProb);
  const c2Score = genScore(c2WinProb);

  const c1Winners = getTeamPlayers(c1W);
  const c1Losers = getTeamPlayers(c1L);
  const c2Winners = getTeamPlayers(c2W);
  const c2Losers = getTeamPlayers(c2L);

  const c1Result = RatingEngine.calculateShift(
    c1Winners,
    c1Losers,
    c1Score.scoreW,
    c1Score.scoreL,
  );
  const c2Result = RatingEngine.calculateShift(
    c2Winners,
    c2Losers,
    c2Score.scoreW,
    c2Score.scoreL,
  );

  // Apply updated ratings back to simPlayerState
  for (const p of [
    ...c1Result.updatedWinners,
    ...c1Result.updatedLosers,
    ...c2Result.updatedWinners,
    ...c2Result.updatedLosers,
  ]) {
    const idx = simPlayerState.findIndex((sp) => sp.username === p.username);
    if (idx !== -1) simPlayerState[idx] = p;
  }

  const newWinnersRack = [...s.winnersRack, ...c1W, ...c2W];
  const newLosersRack = [...s.losersRack, ...c1L, ...c2L];

  // Pull next 4 from each rack; if a rack is short, borrow from the other
  let c1Players = newWinnersRack.slice(0, 4);
  let c2Players = newLosersRack.slice(0, 4);
  if (c1Players.length < 4) {
    const needed = 4 - c1Players.length;
    c1Players = [...c1Players, ...newLosersRack.slice(0, needed)];
  }
  if (c2Players.length < 4) {
    const needed = 4 - c2Players.length;
    c2Players = [...c2Players, ...newWinnersRack.slice(0, needed)];
  }
  const remainingWinners = newWinnersRack.slice(
    c1Players.filter((p) => newWinnersRack.includes(p)).length,
  );
  const remainingLosers = newLosersRack.slice(
    c2Players.filter((p) => newLosersRack.includes(p)).length,
  );

  // Balance teams using the same engine as the right side (live ratings)
  const c1PlayerObjs = c1Players.map(
    (u) =>
      simPlayerState.find((p) => p.username === u) ??
      simPlayers.value.find((p) => p.username === u)!,
  );
  const c2PlayerObjs = c2Players.map(
    (u) =>
      simPlayerState.find((p) => p.username === u) ??
      simPlayers.value.find((p) => p.username === u)!,
  );
  const c1Balanced = MatchmakerEngine.draftBalancedMatch(
    c1PlayerObjs,
    2,
    'fair_balance',
  );
  const c2Balanced = MatchmakerEngine.draftBalancedMatch(
    c2PlayerObjs,
    2,
    'fair_balance',
  );

  return {
    court1: {
      teamA: c1Balanced.teamA.map((p) => p.username),
      teamB: c1Balanced.teamB.map((p) => p.username),
    },
    court2: {
      teamA: c2Balanced.teamA.map((p) => p.username),
      teamB: c2Balanced.teamB.map((p) => p.username),
    },
    // Keep full rack (including players being drafted) so they appear in racks
    // at draftStep=0 and animate to courts as draft step increases
    winnersRack: newWinnersRack,
    losersRack: newLosersRack,
    // Track which players are being drafted (to be removed from rack after hold)
    draftedWinners: c1Players,
    draftedLosers: c2Players,
    remainingWinners,
    remainingLosers,
  };
}

// Draft order: all 4 winners to court 1 first (FIFO index order), then all 4 losers to court 2
const leftDraftOrder = computed(() => {
  if (!leftPending.value) return [];
  const m1 = leftPending.value.court1;
  const m2 = leftPending.value.court2;
  return [
    { player: m1.teamA[0], court: 1, team: 'A' as const },
    { player: m1.teamA[1], court: 1, team: 'A' as const },
    { player: m1.teamB[0], court: 1, team: 'B' as const },
    { player: m1.teamB[1], court: 1, team: 'B' as const },
    { player: m2.teamA[0], court: 2, team: 'A' as const },
    { player: m2.teamA[1], court: 2, team: 'A' as const },
    { player: m2.teamB[0], court: 2, team: 'B' as const },
    { player: m2.teamB[1], court: 2, team: 'B' as const },
  ];
});

const leftPlacedPicks = computed(() =>
  leftDraftOrder.value.slice(0, leftDraftStep.value),
);

// Currently displayed courts: based on placed picks from pending (like right side)
// At draftStep=0 with pending set, courts are empty (players in racks)
// Before first round (no pending ever set), show initial state
const leftCourt1 = computed(() => {
  if (!leftPending.value && leftDraftStep.value === 0)
    return leftState.value.court1;
  const placed = leftPlacedPicks.value.filter((p) => p.court === 1);
  const teamA = placed.filter((p) => p.team === 'A').map((p) => p.player);
  const teamB = placed.filter((p) => p.team === 'B').map((p) => p.player);
  return { teamA, teamB };
});

const leftCourt2 = computed(() => {
  if (!leftPending.value && leftDraftStep.value === 0)
    return leftState.value.court2;
  const placed = leftPlacedPicks.value.filter((p) => p.court === 2);
  const teamA = placed.filter((p) => p.team === 'A').map((p) => p.player);
  const teamB = placed.filter((p) => p.team === 'B').map((p) => p.player);
  return { teamA, teamB };
});

// Racks show: full rack from leftState (already includes returning players)
// minus players already placed on courts (like right side)
const leftWinnersRack = computed(() => {
  if (!leftPending.value && leftDraftStep.value === 0)
    return leftState.value.winnersRack;
  const placed = new Set(leftPlacedPicks.value.map((p) => p.player));
  return leftState.value.winnersRack.filter((p) => !placed.has(p));
});

const leftLosersRack = computed(() => {
  if (!leftPending.value && leftDraftStep.value === 0)
    return leftState.value.losersRack;
  const placed = new Set(leftPlacedPicks.value.map((p) => p.player));
  return leftState.value.losersRack.filter((p) => !placed.has(p));
});

function startLeftDraft() {
  // Compute the next round and store as pending
  const next = computeNextLeftRound();

  if (leftTimer) {
    clearInterval(leftTimer as ReturnType<typeof setInterval>);
    clearTimeout(leftTimer as ReturnType<typeof setTimeout>);
  }

  // Set state with FULL racks (including players being drafted)
  // so drafted players appear in racks at step 0 and animate to courts
  leftState.value = {
    court1: next.court1,
    court2: next.court2,
    winnersRack: next.winnersRack,
    losersRack: next.losersRack,
  };
  leftPending.value = { court1: next.court1, court2: next.court2 };
  leftDraftStep.value = 0;

  leftTimer = setInterval(() => {
    leftDraftStep.value++;
    if (leftDraftStep.value > LEFT_TOTAL_PICKS) {
      // All placed — hold, then start next round
      clearInterval(leftTimer as ReturnType<typeof setInterval>);
      leftRound.value++;
      leftTimer = setTimeout(() => {
        // After hold: update racks to remaining (remove drafted players)
        leftState.value = {
          court1: next.court1,
          court2: next.court2,
          winnersRack: next.remainingWinners,
          losersRack: next.remainingLosers,
        };
        startLeftDraft();
      }, LEFT_HOLD_MS);
    }
  }, LEFT_STEP_MS);
}

function resetSimulation() {
  // Clear timers
  if (leftTimer) {
    clearInterval(leftTimer as ReturnType<typeof setInterval>);
    clearTimeout(leftTimer as ReturnType<typeof setTimeout>);
    leftTimer = null;
  }
  if (draftTimer) {
    clearInterval(draftTimer as ReturnType<typeof setInterval>);
    clearTimeout(draftTimer as ReturnType<typeof setTimeout>);
    draftTimer = null;
  }

  // Regenerate players
  simPlayers.value = generateSimPlayers(playerCount.value);

  // Reset right side state
  simPlayerState = queueOrder.value.map((username) => {
    const p = simPlayers.value.find((sp) => sp.username === username)!;
    return {
      ...p,
      history: {
        playedWith: { ...p.history!.playedWith },
        playedAgainst: { ...p.history!.playedAgainst },
      },
    };
  });
  rightQueueState = queueOrder.value.map((username, i) => ({
    username,
    queueType: 'GENERAL' as const,
    enteredAt: i,
  }));
  lastDraftedUsernames = [];
  lastMatchResults = [];
  allStarSortDirection = 'desc';
  preferWinners = true;
  rightRound.value = 1;
  draftStep.value = 0;
  rightMatches.value = [];

  // Reset left side state
  leftRound.value = 1;
  leftDraftStep.value = 0;
  leftPending.value = null;
  leftState.value = buildInitialLeftState();

  // Restart both
  startLeftDraft();
  startDraft();
}

watch(playerCount, (val) => {
  const clamped = Math.max(8, Math.min(24, val));
  if (clamped !== val) {
    playerCount.value = clamped;
    return; // watcher will re-fire with clamped value
  }
  resetSimulation();
});

onMounted(() => {
  startLeftDraft();
  startDraft();
});

onUnmounted(() => {
  if (leftTimer) {
    clearInterval(leftTimer as ReturnType<typeof setInterval>);
    clearTimeout(leftTimer as ReturnType<typeof setTimeout>);
  }
  if (draftTimer) {
    clearInterval(draftTimer as ReturnType<typeof setInterval>);
    clearTimeout(draftTimer as ReturnType<typeof setTimeout>);
  }
});
</script>

<style lang="scss" scoped>
$brand-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
  width: 100%;
}

.section {
  padding: 4rem 1.5rem;
  background: white;
}

.section-title {
  font-size: clamp(1.6rem, 4vw, 2.25rem);
  font-weight: 800;
  margin: 0 0 0.5rem;
  color: #2d2d3a;
}

.section-subtitle {
  font-size: 1.05rem;
  color: #6b7280;
  margin: 0;
}

/* Simulation wrapper — two flex columns side by side */
.sim-wrapper {
  display: flex;
  gap: 1.5rem;
  align-items: stretch;
}

/* Player count control */
.player-count-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.player-count-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #6b7280;
}

/* Each column is a card */
.sim-col {
  flex: 1;
  min-width: 0;
  border-radius: 18px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sim-old {
  background: #f4f4f5;
  border: 1px solid #e4e4e7;
}

.sim-new {
  background: linear-gradient(135deg, #f8f9fc 0%, #eef1f7 100%);
  border: 1px solid #d1d5db;
}

/* Placeholder: invisible spacer matching general-queue strip height */
.queue-placeholder {
  min-height: 70px;
  visibility: hidden;
}

/* Spacer: dynamically grows to push courts down, aligning with right column */
.controls-spacer {
  flex: 1;
}

/* Controls row */
.controls-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.controls-dropdowns {
  flex-wrap: wrap;
  width: 100%;
}

.sim-header {
  display: flex;
  align-items: center;
  font-size: 0.9rem;
  font-weight: 700;
  color: #71717a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sim-header-good {
  color: #16a34a;
}

/* Round counter */
.round-counter {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 999px;
  padding: 4px 12px;
  align-self: flex-start;
}

.round-counter-good {
  color: #16a34a;
  background: #f0fdf4;
  border: 1px solid #86efac;
}

/* Court blocks */
.court-block {
  background: #e4e4e7;
  border-radius: 12px;
  padding: 0.75rem;
  position: relative;
  min-height: 88px;
}

.court-block-good {
  background: #dcfce7;
}

.court-label {
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: #71717a;
  margin-bottom: 0.5rem;
}

.court-teams {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.court-team {
  display: flex;
  gap: 4px;
  flex: 1;
  justify-content: center;
  position: relative;
}

.vs {
  font-size: 0.7rem;
  font-weight: 700;
  color: #a1a1aa;
  flex-shrink: 0;
}

/* Paddle chips */
.paddle-chip {
  display: flex;
  align-items: center;
  gap: 3px;
  background: white;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  min-width: 44px;
  justify-content: center;
  animation: chipAppear 0.3s ease;
}

/* Skill dots */
.skill-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.skill-dot.beginner {
  background: #22c55e;
}

.skill-dot.intermediate {
  background: #eab308;
}

.skill-dot.advanced {
  background: #ef4444;
}

/* Legend */
.legend {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  margin-bottom: 0.5rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: #6b7280;
}

/* Court callouts (inside court blocks) */
.court-callout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 0.5rem;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  animation: calloutPop 0.3s ease;
  align-self: center;
}

.callout-bad {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fca5a5;
}

.callout-good {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #86efac;
}

/* Waiting strip */
.waiting-strip {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  background: #e4e4e7;
  border-radius: 8px;
  min-height: 70px;
}

.waiting-strip-good {
  background: #e0e7ff;
}

.waiting-strip-winners {
  background: #fef3c7;
  border: 1px solid #fcd34d;
}

.waiting-strip-losers {
  background: #fee2e2;
  border: 1px solid #fca5a5;
}

.waiting-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: #71717a;
  margin-right: 4px;
}

.queue-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-content: flex-start;
}

/* TransitionGroup: paddle-move (courts that change) */
/* Enter: slide up from rack area below */
.paddle-move-enter-from {
  transform: translateY(20px) scale(0.8);
}

/* Leave: slide down toward rack area */
.paddle-move-leave-to {
  transform: translateY(20px) scale(0.8);
}

.paddle-move-enter-active,
.paddle-move-leave-active {
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.paddle-move-leave-active {
  position: absolute;
}

.paddle-move-move {
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

/* TransitionGroup: paddle-queue (waiting strips) */
/* Enter: returning from court above — slide down from top */
.paddle-queue-enter-from {
  transform: translateY(-12px) scale(0.7);
}

/* Leave: going to court above — slide up */
.paddle-queue-leave-to {
  transform: translateY(-20px) scale(0.8);
}

.paddle-queue-enter-active,
.paddle-queue-leave-active {
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.paddle-queue-leave-active {
  position: absolute;
}

.paddle-queue-move {
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.paddle-chip-sm {
  padding: 2px 6px;
  font-size: 0.65rem;
}

.paddle-chip-sm .skill-dot {
  width: 6px;
  height: 6px;
}

/* Mode dropdown */
.mode-select {
  :deep(.q-field__control) {
    border-radius: 10px;
  }
}

/* Mode description bar */
.mode-desc-bar {
  background: white;
  border-radius: 10px;
  padding: 0.4rem 0.75rem;
  border-left: 3px solid #667eea;
  animation: calloutPop 0.3s ease;
}

.mode-name-inline {
  font-size: 0.95rem;
  font-weight: 800;
  color: #2d2d3a;
}

.mode-desc-inline {
  font-size: 0.78rem;
  color: #6b7280;
  margin-top: 2px;
}

/* Draft status indicator */
.draft-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  animation: calloutPop 0.3s ease;
  align-self: flex-start;
}

.draft-active {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #93c5fd;
}

.draft-done {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #86efac;
}

/* Animations */
@keyframes chipAppear {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes calloutPop {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (max-width: 767px) {
  .sim-wrapper {
    flex-direction: column;
  }
  .sim-col {
    padding: 0.85rem;
  }
  .queue-placeholder {
    display: none;
  }
  .controls-spacer {
    display: none;
  }
  .paddle-chip {
    min-width: 36px;
    padding: 3px 5px;
    font-size: 0.65rem;
    gap: 2px;
  }
  .paddle-chip .skill-dot {
    width: 6px;
    height: 6px;
  }
  .court-teams {
    gap: 0.4rem;
  }
  .court-team {
    gap: 3px;
  }
  .vs {
    font-size: 0.6rem;
  }
}
</style>
