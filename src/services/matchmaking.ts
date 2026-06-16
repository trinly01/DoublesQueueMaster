import { reactive } from 'vue';
import { LocalStorage } from 'quasar';

/**
 * ==========================================
 * 1. PWA LOCAL STORAGE ENTITIES
 * ==========================================
 */

export interface Player {
  username: string; // Unique identifier
  name?: string; // Optional alias for UI compatibility
  firstName?: string; // First name from Directus
  lastName?: string; // Last name from Directus
  level: 1 | 2 | 3; // Added for manual matchmaking and UI labels
  rating: number; // Defaults to 1500
  matchesPlayed: number; // Defaults to 0
  wins: number;
  losses: number;
  priority?: string;
  userId?: string; // Directus user ID — present only for registered club members
  duprId?: string; // DUPR player ID for CSV export
  ratingUpdatedAt?: number; // Epoch ms of the last rating change (LWW token vs directus_users.rating_updated_at)
  statsUpdatedAt?: number; // Epoch ms of the last matchesPlayed/wins/losses/history change
  updatedAt?: number; // Epoch ms of the last any field change (for per-field LWW)
  createdAt?: number; // Epoch ms when player was first created (for checkpoint purge)
  avatar?: string; // Avatar URL from Directus
  deletedAt?: number; // Epoch ms of deletion (tombstone). If present, player is logically deleted.
  history?: {
    playedWith: Record<string, number>;
    playedAgainst: Record<string, number>;
  };
}

export interface QueueEntry {
  username: string;
  queueType: 'GENERAL' | 'WINNERS' | 'LOSERS';
  enteredAt: number; // Sort-priority value for FIFO ordering (can be 0 = "jump to front"). NOT a creation time.
  createdAt?: number; // Epoch ms when the entry was actually created (used for reset checkpoints).
  updatedAt?: number; // Epoch ms of last change (for per-field LWW)
  deletedAt?: number; // Epoch ms of deletion (tombstone). If present, entry is logically deleted.
  queuedAt?: number; // Epoch ms when the player was last placed into the queue (add / re-queue).
}

export interface ActiveMatch {
  matchId: string; // Simple random string to identify the court/game
  queueSource: 'GENERAL' | 'WINNERS' | 'LOSERS' | 'MANUAL';
  teamA: string[]; // Array of usernames
  teamB: string[]; // Array of usernames
  expectedDifference: number;
  status: 'waiting' | 'in-progress' | 'completed';
  court?: number;
  startedAt?: number; // Epoch ms when match began
  createdAt?: number;
  updatedAt?: number; // Epoch ms of last change (for per-field LWW)
  deletedAt?: number; // Epoch ms of deletion (tombstone). If present, match is logically deleted.
  originalQueueTypes?: Record<string, 'GENERAL' | 'WINNERS' | 'LOSERS'>;
  oldestQueueEntryAt?: number; // Earliest queue enteredAt among all players (for FIFO priority)
  minGamesPlayed?: number; // Minimum matchesPlayed among all players (for fairness priority)
}

export interface CompletedMatchPlayer {
  username: string;
  name?: string; // firstName + lastName, for display in CSV
  duprId?: string;
  firstName?: string;
  lastName?: string;
  level?: 1 | 2 | 3;
  rating?: number;
  avatar?: string;
}

export interface CompletedMatch {
  matchId: string; // Same as the original ActiveMatch.matchId
  matchType: 'singles' | 'doubles';
  teamA: CompletedMatchPlayer[];
  teamB: CompletedMatchPlayer[];
  teamAScore: number;
  teamBScore: number;
  startedAt?: number; // Epoch ms when match began
  completedAt: number; // Epoch ms
  updatedAt: number; // Epoch ms (LWW)
}

export interface AppState {
  teamSize: number;
  players: Record<string, Player>; // Dictionary of all players ever registered
  queues: QueueEntry[]; // Players currently waiting to play
  activeMatches: ActiveMatch[]; // Matches currently happening on the court
  completedMatches: CompletedMatch[]; // Persisted completed matches for DUPR export

  // Settings managed by the system
  availableCourts?: number;
  autoAdvanceMatches?: boolean;
  queueReturnMethod?: 'fairness_first' | 'end_of_queue' | 'smart_position';
  autoSortQueue?: boolean;
  queuePriorityMode?: 'timestamp' | 'gamesPlayed';
  matchmakingMode?:
    | 'variety_first'
    | 'balance_first'
    | 'balanced_variety'
    | 'strict_balance'
    | 'fair_balance';
  sortBy?: 'matchesPlayed' | 'rating' | 'winRate' | 'wins' | 'losses' | 'name';
  matchType?: 'singles' | 'doubles';
  matchesFilterBy?: 'all' | number;
  scoreType?: 'RALLY' | 'SIDEOUT'; // For DUPR CSV export
  ttsEnabled?: boolean; // Text-to-speech announcements
  completedMatchesResetAt?: number; // Epoch ms — drops completedMatches older than this
  lastExportedAt?: number; // Epoch ms of last export
  settingsUpdatedAt?: number; // Epoch ms of last settings change (for per-field LWW)
  playersResetAt?: number; // Epoch ms — drops players created before this checkpoint
  queuesResetAt?: number; // Epoch ms — drops queue entries entered before this checkpoint
  matchesResetAt?: number; // Epoch ms — drops matches created before this checkpoint
  lastModified?: number;
  clubId?: string; // Which club this local state belongs to
}

const STORAGE_KEY = 'matchmaking_state';

// Standalone helper: enforce one-match-per-player on any AppState.
// Losing matches are tombstoned and their players returned to queue.
function enforceOneMatchPerPlayerOnState(state: AppState) {
  const playerToMatches = new Map<string, ActiveMatch[]>();
  state.activeMatches.forEach((m) => {
    if (m.deletedAt) return;
    [...m.teamA, ...m.teamB].forEach((username) => {
      const arr = playerToMatches.get(username) || [];
      arr.push(m);
      playerToMatches.set(username, arr);
    });
  });

  const matchesToRemove = new Set<string>();
  playerToMatches.forEach((matches) => {
    if (matches.length <= 1) return;
    // Sort by updatedAt desc (tie-break on createdAt desc)
    matches.sort((a, b) => {
      const diff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      if (diff !== 0) return diff;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
    for (let i = 1; i < matches.length; i++) {
      matchesToRemove.add(matches[i].matchId);
    }
  });

  if (matchesToRemove.size === 0) return;

  const now = Date.now();
  // Pre-calculate which players are kept in non-removed matches
  const playersKept = new Set<string>();
  state.activeMatches.forEach((m) => {
    if (!m.deletedAt && !matchesToRemove.has(m.matchId)) {
      m.teamA.forEach((u) => playersKept.add(u));
      m.teamB.forEach((u) => playersKept.add(u));
    }
  });

  state.activeMatches.forEach((m) => {
    if (matchesToRemove.has(m.matchId)) {
      // Return all players from this match to the queue,
      // but only if they are not already in another kept match.
      [...m.teamA, ...m.teamB].forEach((username) => {
        if (
          !playersKept.has(username) &&
          !state.queues.some((q) => !q.deletedAt && q.username === username)
        ) {
          state.queues.push({
            username,
            queueType:
              m.originalQueueTypes?.[username] ||
              (m.queueSource === 'MANUAL' ? 'GENERAL' : m.queueSource) ||
              'GENERAL',
            enteredAt: now,
            createdAt: now,
            updatedAt: now,
            queuedAt: now,
          });
        }
      });
      // Tombstone the match
      m.deletedAt = now;
      m.updatedAt = now;
    }
  });

  console.log(
    `[enforceOneMatchPerPlayer] Removed ${matchesToRemove.size} conflicting match(es), returned players to queue`,
  );
}

/**
 * Calculate K-factor based on rating distance from default (1500)
 * This provides stability across per-event resets of matchesPlayed/wins/losses
 */
const calculateKFactor = (rating: number): number => {
  const distanceFromStart = Math.abs(rating - 1500);

  if (distanceFromStart >= 100) {
    return 20; // Well-established skill (stable)
  } else if (distanceFromStart >= 50) {
    return 30; // Some skill established (medium volatility)
  } else {
    return 40; // Still establishing skill (higher volatility)
  }
};

/**
 * ==========================================
 * 2. INDIVIDUAL RATING ALGORITHM
 * ==========================================
 * Pure math function. Aggressive decaying volatility for fast accuracy.
 */
export const RatingEngine = {
  calculateShift: (
    winners: Player[],
    losers: Player[],
    scoreW: number,
    scoreL: number,
  ) => {
    // Calculate team strength using Harmonic Mean to heavily penalize skill variance (Weakest Link Theorem)
    const harmonicMean = (team: Player[]) => {
      if (team.length === 0) return 1500;
      const sumReciprocal = team.reduce(
        (sum, p) => sum + 1 / Math.max(1, p.rating),
        0,
      );
      return team.length / sumReciprocal;
    };

    const ratingW = harmonicMean(winners);
    const ratingL = harmonicMean(losers);

    const totalWinnerRating = winners.reduce((sum, p) => sum + p.rating, 0);
    const totalLoserRating = losers.reduce((sum, p) => sum + p.rating, 0);

    const expectedW = 1 / (1 + Math.pow(10, (ratingL - ratingW) / 400));
    const multiplier = 1 + Math.abs(scoreW - scoreL) * 0.05;

    const applyToPlayer = (
      player: Player,
      isWinner: boolean,
      team: Player[],
    ): Player => {
      // Rating-distance-based K-factor for stability across per-event resets
      const baseK = calculateKFactor(player.rating);
      // Inverse Stakes Scaling: Halve the volatility in Doubles because you are only 50% responsible for the match
      const K = baseK / team.length;

      const outcome = isWinner ? 1 : 0;
      const expected = isWinner ? expectedW : 1 - expectedW;

      // Base shift if points were distributed equally
      const baseShift = K * multiplier * (outcome - expected);

      // Proportional distribution (Backpack problem solver)
      const totalTeamRating = isWinner ? totalWinnerRating : totalLoserRating;
      const proportionalShare = player.rating / totalTeamRating;

      // Scale shift by their share relative to an even split (1 / team.length)
      const shift = baseShift * (proportionalShare * team.length);

      return {
        ...player,
        rating: Math.round(player.rating + shift),
        matchesPlayed: player.matchesPlayed + 1,
        wins: (player.wins || 0) + (isWinner ? 1 : 0),
        losses: (player.losses || 0) + (isWinner ? 0 : 1),
        ratingUpdatedAt: Date.now(),
        statsUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      };
    };

    return {
      updatedWinners: winners.map((p) => applyToPlayer(p, true, winners)),
      updatedLosers: losers.map((p) => applyToPlayer(p, false, losers)),
    };
  },
};

// Pure Harmonic Mean (heavily weights the weakest player)
export const computeHarmonicMean = (team: Player[]): number => {
  if (team.length === 0) return 1500;
  const sumReciprocal = team.reduce(
    (sum, p) => sum + 1 / Math.max(1, p.rating || 1500),
    0,
  );
  return team.length / sumReciprocal;
};

// Pure Arithmetic Mean (simple average)
export const computeArithmeticMean = (team: Player[]): number => {
  if (team.length === 0) return 1500;
  return team.reduce((sum, p) => sum + (p.rating || 1500), 0) / team.length;
};

// Softened Harmonic Mean of team ratings (60% harmonic + 40% arithmetic)
// Reduces extreme penalty on weaker players while still respecting the weakest link
export const computeTeamRating = (team: Player[]) => {
  const harmonic = computeHarmonicMean(team);
  const arithmetic = computeArithmeticMean(team);
  return harmonic * 0.6 + arithmetic * 0.4;
};

// Forecasted win probability for each team
export const computeWinProbability = (teamA: Player[], teamB: Player[]) => {
  const ratingA = computeTeamRating(teamA);
  const ratingB = computeTeamRating(teamB);
  const probA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return {
    teamA: probA,
    teamB: 1 - probA,
    expectedDifference: Math.abs(ratingA - ratingB),
  };
};

/**
 * ==========================================
 * 3. BALANCED MATCHMAKING ALGORITHM
 * ==========================================
 * Pure function to calculate fairest Top-K combinations.
 */
export const MatchmakerEngine = {
  getCombinations: (players: Player[], teamSize: number) => {
    const combinations: { teamA: Player[]; teamB: Player[] }[] = [];
    const playerZero = players[0];
    const rest = players.slice(1);

    const pick = (pool: Player[], needed: number, currentTeam: Player[]) => {
      if (needed === 0) {
        const teamA = [playerZero, ...currentTeam];
        const teamB = players.filter(
          (p) => !teamA.some((a) => a.username === p.username),
        );
        combinations.push({ teamA, teamB });
        return;
      }
      for (let i = 0; i <= pool.length - needed; i++) {
        pick(pool.slice(i + 1), needed - 1, [...currentTeam, pool[i]]);
      }
    };

    pick(rest, teamSize - 1, []);
    return combinations;
  },

  draftBalancedMatch: (
    players: Player[],
    teamSize: number,
    mode:
      | 'variety_first'
      | 'balance_first'
      | 'balanced_variety'
      | 'strict_balance'
      | 'fair_balance' = 'fair_balance',
  ) => {
    const allMatchups = MatchmakerEngine.getCombinations(players, teamSize);

    const evaluated = allMatchups.map((matchup) => {
      const ratingA = computeTeamRating(matchup.teamA);
      const ratingB = computeTeamRating(matchup.teamB);
      const expectedDifference = Math.abs(ratingA - ratingB);

      if (mode === 'strict_balance' || mode === 'fair_balance') {
        // Pure balance: no novelty penalty, only expectedDifference
        return {
          ...matchup,
          expectedDifference,
          combinedScore: expectedDifference,
        };
      }

      if (mode === 'balance_first' || mode === 'balanced_variety') {
        // Combined-score behavior: balance + novelty penalty
        const partnerWeight = mode === 'balanced_variety' ? 25 : 50;
        const opponentWeight = mode === 'balanced_variety' ? 8 : 15;
        let noveltyPenalty = 0;
        const addTeamPenalty = (team: Player[]) => {
          for (let i = 0; i < team.length; i++) {
            for (let j = i + 1; j < team.length; j++) {
              const historyCount =
                team[i].history?.playedWith?.[team[j].username] || 0;
              noveltyPenalty += historyCount * partnerWeight;
            }
          }
        };
        addTeamPenalty(matchup.teamA);
        addTeamPenalty(matchup.teamB);
        for (const pA of matchup.teamA) {
          for (const pB of matchup.teamB) {
            const historyCount = pA.history?.playedAgainst?.[pB.username] || 0;
            noveltyPenalty += historyCount * opponentWeight;
          }
        }
        return {
          ...matchup,
          expectedDifference,
          combinedScore: expectedDifference + noveltyPenalty,
        };
      }

      // Variety-first: count raw repeats, not weighted penalties
      let partnerRepeats = 0;
      let opponentRepeats = 0;
      const countTeamRepeats = (team: Player[]) => {
        for (let i = 0; i < team.length; i++) {
          for (let j = i + 1; j < team.length; j++) {
            partnerRepeats +=
              team[i].history?.playedWith?.[team[j].username] || 0;
          }
        }
      };
      countTeamRepeats(matchup.teamA);
      countTeamRepeats(matchup.teamB);
      for (const pA of matchup.teamA) {
        for (const pB of matchup.teamB) {
          opponentRepeats += pA.history?.playedAgainst?.[pB.username] || 0;
        }
      }

      return {
        ...matchup,
        expectedDifference,
        partnerRepeats,
        opponentRepeats,
      };
    });

    if (
      mode === 'balance_first' ||
      mode === 'balanced_variety' ||
      mode === 'strict_balance' ||
      mode === 'fair_balance'
    ) {
      type ScoreItem = { combinedScore: number };
      evaluated.sort(
        (a, b) =>
          (a as unknown as ScoreItem).combinedScore -
          (b as unknown as ScoreItem).combinedScore,
      );
      // All balance-oriented modes use strict best
      return evaluated[0];
    }

    // Variety-first: sort by fewest partner repeats, then opponent repeats, then balance
    type VarietyItem = { partnerRepeats: number; opponentRepeats: number };
    evaluated.sort((a, b) => {
      const pa = (a as unknown as VarietyItem).partnerRepeats;
      const pb = (b as unknown as VarietyItem).partnerRepeats;
      if (pa !== pb) return pa - pb;
      const oa = (a as unknown as VarietyItem).opponentRepeats;
      const ob = (b as unknown as VarietyItem).opponentRepeats;
      if (oa !== ob) return oa - ob;
      return a.expectedDifference - b.expectedDifference;
    });

    const best = evaluated[0];
    if (best && best.expectedDifference > 150) {
      console.warn(
        `[Matchmaker] Best variety-first matchup still has a ${Math.round(best.expectedDifference)} rating gap (sweet spot is <150).`,
        best.teamA.map((p: Player) => p.username),
        'vs',
        best.teamB.map((p: Player) => p.username),
      );
    }

    return best;
  },
};

/**
 * ==========================================
 * 4. PWA LOCAL STORAGE MANAGER
 * ==========================================
 * The main service you will use in your Vue components.
 */
export class LocalMatchmakingSystem {
  public state: AppState;
  public onStateChange: (() => void) | null = null;

  constructor(defaultTeamSize: number = 2) {
    let initialState = this.loadState();
    if (!initialState || typeof initialState !== 'object') {
      initialState = {
        teamSize: defaultTeamSize,
        players: {},
        queues: [],
        activeMatches: [],
        completedMatches: [],
      };
    }

    // Fallback default settings
    if (initialState.availableCourts === undefined)
      initialState.availableCourts = 1;
    if (initialState.autoAdvanceMatches === undefined)
      initialState.autoAdvanceMatches = true;
    if (initialState.queueReturnMethod === undefined)
      initialState.queueReturnMethod = 'fairness_first';
    if (initialState.autoSortQueue === undefined)
      initialState.autoSortQueue = true;
    if (initialState.queuePriorityMode === undefined)
      initialState.queuePriorityMode = 'timestamp';
    if (initialState.matchmakingMode === undefined)
      initialState.matchmakingMode = 'fair_balance';
    if (initialState.sortBy === undefined)
      initialState.sortBy = 'matchesPlayed';
    if (initialState.matchType === undefined)
      initialState.matchType = 'doubles';
    if (initialState.matchesFilterBy === undefined)
      initialState.matchesFilterBy = 'all';
    if (initialState.scoreType === undefined)
      initialState.scoreType = 'SIDEOUT';
    if (initialState.ttsEnabled === undefined) initialState.ttsEnabled = true;
    if (initialState.completedMatchesResetAt === undefined)
      initialState.completedMatchesResetAt = 0;
    if (initialState.lastExportedAt === undefined)
      initialState.lastExportedAt = 0;
    if (initialState.playersResetAt === undefined)
      initialState.playersResetAt = 0;
    if (initialState.queuesResetAt === undefined)
      initialState.queuesResetAt = 0;
    if (initialState.matchesResetAt === undefined)
      initialState.matchesResetAt = 0;
    if (initialState.lastModified === undefined)
      initialState.lastModified = Date.now();
    if (initialState.clubId === undefined) initialState.clubId = '';

    this.state = reactive(initialState);
  }

  // --- INTERNAL STORAGE METHODS ---
  private saveState() {
    // Ensure no player appears in more than one active match.
    // Losing matches are tombstoned and their players returned to queue.
    this.enforceOneMatchPerPlayer();

    // Ensure no court has more than one in-progress match.
    // Losing matches are tombstoned and their players returned to queue.
    this.enforceOneMatchPerCourt();

    // Enforce constraint: no player can be in both queue and active matches
    this.enforceQueueMatchConstraint();
    // Remove orphaned queue entries (entries without a matching player profile)
    this.cleanupOrphanedQueueEntries();

    // Deduplicate activeMatches by matchId (keep newest updatedAt)
    const uniqueMatches = new Map<string, ActiveMatch>();
    this.state.activeMatches.forEach((m) => {
      const existing = uniqueMatches.get(m.matchId);
      if (!existing || (m.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
        uniqueMatches.set(m.matchId, m);
      }
    });
    this.state.activeMatches = Array.from(uniqueMatches.values());

    // Deduplicate queues by username (keep newest queuedAt first,
    // then updatedAt, including tombstones so a newer deletion can win
    // over an older live entry).
    const uniqueQueues = new Map<string, QueueEntry>();
    this.state.queues.forEach((q) => {
      const existing = uniqueQueues.get(q.username);
      if (!existing) {
        uniqueQueues.set(q.username, q);
      } else {
        const existingQueued = existing.queuedAt ?? existing.createdAt ?? 0;
        const entryQueued = q.queuedAt ?? q.createdAt ?? 0;
        if (entryQueued !== existingQueued) {
          if (entryQueued > existingQueued) {
            uniqueQueues.set(q.username, q);
          }
          return;
        }
        const existingTime = existing.updatedAt ?? existing.createdAt ?? 0;
        const entryTime = q.updatedAt ?? q.createdAt ?? 0;
        if (entryTime > existingTime) {
          uniqueQueues.set(q.username, q);
        }
      }
    });
    this.state.queues = Array.from(uniqueQueues.values());

    // Validate players dictionary keys match usernames
    const fixedPlayers: Record<string, Player> = {};
    Object.entries(this.state.players).forEach(([key, player]) => {
      if (player.username && player.username !== key) {
        fixedPlayers[player.username] = player;
      } else {
        fixedPlayers[key] = player;
      }
    });
    this.state.players = fixedPlayers;

    // Garbage-collect tombstones older than 7 days to prevent array bloat
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    this.state.queues = this.state.queues.filter(
      (q) => !q.deletedAt || now - q.deletedAt < SEVEN_DAYS,
    );

    this.state.activeMatches = this.state.activeMatches.filter(
      (m) => !m.deletedAt || now - m.deletedAt < SEVEN_DAYS,
    );

    // Checkpoint purge: remove any entity created before its reset checkpoint.
    // This prevents stale data from reappearing after a reset on another admin.
    const playersCheckpoint = this.state.playersResetAt ?? 0;
    const queuesCheckpoint = this.state.queuesResetAt ?? 0;
    const matchesCheckpoint = this.state.matchesResetAt ?? 0;

    if (playersCheckpoint > 0) {
      const keptPlayers: Record<string, Player> = {};
      for (const [key, player] of Object.entries(this.state.players)) {
        const effectiveTime = Math.max(
          player.createdAt ?? 0,
          player.updatedAt ?? 0,
          player.deletedAt ?? 0,
          player.statsUpdatedAt ?? 0,
        );
        if (effectiveTime >= playersCheckpoint) {
          keptPlayers[key] = player;
        }
      }
      this.state.players = keptPlayers;
    }

    if (queuesCheckpoint > 0) {
      this.state.queues = this.state.queues.filter((q) => {
        const effectiveTime = Math.max(
          q.createdAt ?? 0,
          q.updatedAt ?? 0,
          q.deletedAt ?? 0,
        );
        return effectiveTime >= queuesCheckpoint;
      });
    }

    if (matchesCheckpoint > 0) {
      this.state.activeMatches = this.state.activeMatches.filter((m) => {
        const effectiveTime = Math.max(
          m.createdAt ?? 0,
          m.updatedAt ?? 0,
          m.deletedAt ?? 0,
        );
        return effectiveTime >= matchesCheckpoint;
      });
    }

    this.state.lastModified = now;
    LocalStorage.set(STORAGE_KEY, this.state);
    if (this.onStateChange) {
      this.onStateChange();
    }
  }

  private cleanupOrphanedQueueEntries() {
    const originalLength = this.state.queues.length;
    this.state.queues = this.state.queues.filter((q) => {
      // Keep tombstoned entries (they don't need a valid player profile)
      if (q.deletedAt) return true;
      const p = this.state.players[q.username];
      return p !== undefined && !p.deletedAt;
    });
    if (this.state.queues.length !== originalLength) {
      console.log(
        `[cleanupOrphanedQueueEntries] Removed ${originalLength - this.state.queues.length} orphaned queue entries`,
      );
    }
  }

  private enforceQueueMatchConstraint() {
    // Collect all players in active matches
    const playersInMatches = new Set<string>();
    this.state.activeMatches.forEach((m) => {
      if (!m.deletedAt) {
        m.teamA.forEach((username) => playersInMatches.add(username));
        m.teamB.forEach((username) => playersInMatches.add(username));
      }
    });

    // Remove live queue entries for players who are in matches
    // (skip tombstoned entries — they are logically not in queue)
    const originalQueueLength = this.state.queues.length;
    this.state.queues = this.state.queues.filter(
      (q) => q.deletedAt || !playersInMatches.has(q.username),
    );

    if (this.state.queues.length !== originalQueueLength) {
      console.log(
        `[enforceQueueMatchConstraint] Removed ${originalQueueLength - this.state.queues.length} queue entries for players in matches`,
      );
    }
  }

  // Enforce: each player can only be in one active (non-deleted) match.
  // When a conflict is found, the match with the newest updatedAt wins;
  // players from the losing match(es) are returned to the queue.
  public enforceOneMatchPerPlayer() {
    enforceOneMatchPerPlayerOnState(this.state);
  }

  // Enforce: at most one in-progress match per court.
  // When a conflict is found, the match with the newest startedAt wins;
  // players from the losing match(es) are returned to the queue.
  public enforceOneMatchPerCourt() {
    const courtToMatches = new Map<number, ActiveMatch[]>();
    this.state.activeMatches.forEach((m) => {
      if (m.deletedAt || m.status !== 'in-progress' || !m.court) return;
      const arr = courtToMatches.get(m.court) || [];
      arr.push(m);
      courtToMatches.set(m.court, arr);
    });

    const matchesToRemove = new Set<string>();
    courtToMatches.forEach((matches) => {
      if (matches.length <= 1) return;
      // Keep the match with the newest startedAt (or updatedAt fallback)
      matches.sort((a, b) => {
        const diff = (b.startedAt ?? 0) - (a.startedAt ?? 0);
        if (diff !== 0) return diff;
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      });
      for (let i = 1; i < matches.length; i++) {
        matchesToRemove.add(matches[i].matchId);
      }
    });

    if (matchesToRemove.size === 0) return;

    const now = Date.now();
    // Pre-calculate which players are kept in non-removed matches
    const playersKept = new Set<string>();
    this.state.activeMatches.forEach((m) => {
      if (!m.deletedAt && !matchesToRemove.has(m.matchId)) {
        m.teamA.forEach((u) => playersKept.add(u));
        m.teamB.forEach((u) => playersKept.add(u));
      }
    });

    this.state.activeMatches.forEach((m) => {
      if (matchesToRemove.has(m.matchId)) {
        // Return all players from this match to the queue,
        // but only if they are not already in another kept match.
        [...m.teamA, ...m.teamB].forEach((username) => {
          if (
            !playersKept.has(username) &&
            !this.state.queues.some(
              (q) => !q.deletedAt && q.username === username,
            )
          ) {
            this.state.queues.push({
              username,
              queueType:
                m.originalQueueTypes?.[username] ||
                (m.queueSource === 'MANUAL' ? 'GENERAL' : m.queueSource) ||
                'GENERAL',
              enteredAt: now,
              createdAt: now,
              updatedAt: now,
              queuedAt: now,
            });
          }
        });
        // Tombstone the match
        m.deletedAt = now;
        m.updatedAt = now;
      }
    });

    console.log(
      `[enforceOneMatchPerCourt] Removed ${matchesToRemove.size} conflicting match(es) from courts, returned players to queue`,
    );
  }

  private loadState(): AppState | null {
    const saved = LocalStorage.getItem(STORAGE_KEY) as AppState | string | null;
    if (!saved) return null;
    if (typeof saved === 'string') {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return saved;
  }

  // Helper to completely wipe data (Useful for "End Session" button in UI)
  public clearSession() {
    const now = Date.now();
    this.state.queues = [];
    this.state.activeMatches = [];
    this.state.queuesResetAt = now;
    this.state.matchesResetAt = now;
    this.state.settingsUpdatedAt = now;
    this.state.lastModified = now;
    this.saveState();
  }

  public hardResetEverything() {
    LocalStorage.remove(STORAGE_KEY);
    const now = Date.now();
    this.state.players = {};
    this.state.queues = [];
    this.state.activeMatches = [];
    this.state.completedMatches = [];
    this.state.playersResetAt = now;
    this.state.queuesResetAt = now;
    this.state.matchesResetAt = now;
    this.state.completedMatchesResetAt = now;
    this.state.lastExportedAt = 0;
    this.state.settingsUpdatedAt = now;
    this.state.lastModified = now;
    this.saveState();
  }

  public resetState() {
    const now = Date.now();
    this.state.players = {};
    this.state.queues = [];
    this.state.activeMatches = [];
    this.state.completedMatches = [];
    this.state.playersResetAt = now;
    this.state.queuesResetAt = now;
    this.state.matchesResetAt = now;
    this.state.completedMatchesResetAt = now;
    this.state.lastExportedAt = 0;
    this.state.availableCourts = 1;
    this.state.autoAdvanceMatches = true;
    this.state.queueReturnMethod = 'fairness_first';
    this.state.autoSortQueue = true;
    this.state.queuePriorityMode = 'timestamp';
    this.state.matchmakingMode = 'fair_balance';
    this.state.sortBy = 'matchesPlayed';
    this.state.matchType = 'doubles';
    this.state.matchesFilterBy = 'all';
    this.state.scoreType = 'SIDEOUT';
    this.state.ttsEnabled = true;
    this.state.settingsUpdatedAt = now;
    this.state.lastModified = now;
    this.state.clubId = '';
    this.saveState();
  }

  // Epoch-based clear for completed matches (multi-admin safe)
  public clearCompletedMatches() {
    this.state.completedMatchesResetAt = Date.now();
    this.state.settingsUpdatedAt = Date.now();
    // Locally filter; remote side will also filter on sync
    const resetAt = this.state.completedMatchesResetAt;
    this.state.completedMatches = this.state.completedMatches.filter(
      (m) => m.completedAt > resetAt,
    );
    this.saveState();
  }

  public markExported() {
    this.state.lastExportedAt = Date.now();
    this.state.settingsUpdatedAt = Date.now();
    this.saveState();
  }

  // --- PUBLIC API FOR UI (VUE COMPONENTS) ---

  // 1. Register or Check-In a Player to the court
  // Returns: 'added' if added to queue, 'already_in_queue' if in queue, 'already_in_match' if in match
  public checkInPlayer(
    username: string,
    level: 1 | 2 | 3 = 1,
    extra?: Partial<Player>,
  ): 'added' | 'already_in_queue' | 'already_in_match' {
    const normalizedUsername = username.trim();

    // Create player profile if they don't exist in the local database
    if (!this.state.players[normalizedUsername]) {
      this.state.players[normalizedUsername] = {
        username: normalizedUsername,
        level: level,
        rating: 1500,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        statsUpdatedAt: Date.now(),
        ...extra,
      };
    } else {
      // if they do exist, just update the level and clear any tombstone
      this.state.players[normalizedUsername].level = level;
      delete this.state.players[normalizedUsername].deletedAt;
      this.state.players[normalizedUsername].updatedAt = Date.now();
      this.state.lastModified = Date.now();
      // merge any new profile fields (e.g. firstName, avatar, userId)
      if (extra) {
        Object.assign(this.state.players[normalizedUsername], extra);
      }
    }

    // Clean up orphaned queue entries before checking
    this.state.queues = this.state.queues.filter((q) => {
      // Keep tombstoned entries
      if (q.deletedAt) return true;
      const p = this.state.players[q.username];
      return p !== undefined && !p.deletedAt;
    });

    // Prevent adding if already in queue or currently playing
    const inQueue = this.state.queues.some(
      (q) => !q.deletedAt && q.username === normalizedUsername,
    );
    const inMatch = this.state.activeMatches.some(
      (m) =>
        !m.deletedAt &&
        (m.teamA.includes(normalizedUsername) ||
          m.teamB.includes(normalizedUsername)),
    );

    if (inMatch) {
      return 'already_in_match';
    }

    if (inQueue) {
      return 'already_in_queue';
    }

    this.state.queues.push({
      username: normalizedUsername,
      queueType: 'GENERAL',
      enteredAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      queuedAt: Date.now(),
    });

    this.saveState();
    return 'added';
  }

  public removeFromQueue(username: string) {
    const now = Date.now();
    this.state.queues.forEach((q) => {
      if (q.username === username && !q.deletedAt) {
        q.deletedAt = now;
        q.updatedAt = now;
      }
    });
    this.saveState();
  }

  // 2. Draft the next round of matches from waiting players
  public draftNextMatches(priorityMode: string = 'timestamp') {
    const playersNeeded = this.state.teamSize * 2;

    const isStrictBalance = this.state.matchmakingMode === 'strict_balance';

    const sortFn = (a: QueueEntry, b: QueueEntry) => {
      if (isStrictBalance) {
        const ratingA = this.state.players[a.username]?.rating ?? 1500;
        const ratingB = this.state.players[b.username]?.rating ?? 1500;
        if (ratingA !== ratingB) return ratingB - ratingA;
        return a.enteredAt - b.enteredAt;
      }
      if (priorityMode === 'gamesPlayed') {
        const playerA = this.state.players[a.username];
        const playerB = this.state.players[b.username];
        if (
          playerA &&
          playerB &&
          playerA.matchesPlayed !== playerB.matchesPlayed
        ) {
          return playerA.matchesPlayed - playerB.matchesPlayed;
        }
      }
      return a.enteredAt - b.enteredAt;
    };

    const prioritizedQueue = this.state.queues
      .filter((q) => !q.deletedAt)
      .sort(sortFn);

    while (prioritizedQueue.length >= playersNeeded) {
      let draftedEntries: QueueEntry[] = [];

      if (isStrictBalance) {
        // Strict balance: pool all players regardless of queue group and draft
        // the closest-rated N from the top of the rating-sorted queue.
        draftedEntries = prioritizedQueue.slice(0, playersNeeded);
      } else {
        // Non-strict modes: respect bracket priority sequence.
        // 1. GENERAL-only match (if enough to form one)
        // 2. Overflow GENERAL + LOSERS (leftover GENERAL absorb into lower bracket)
        // 3. WINNERS vs WINNERS
        // 4. LOSERS vs LOSERS
        // 5. Fallback: mix from top of overall sorted queue
        const general = prioritizedQueue.filter(
          (q) => q.queueType === 'GENERAL',
        );
        const winners = prioritizedQueue.filter(
          (q) => q.queueType === 'WINNERS',
        );
        const losers = prioritizedQueue.filter((q) => q.queueType === 'LOSERS');

        if (general.length >= playersNeeded) {
          draftedEntries = general.slice(0, playersNeeded);
        } else if (
          general.length > 0 &&
          general.length + losers.length >= playersNeeded
        ) {
          // Leftover GENERAL overflow into LOSERS bracket
          const neededFromLosers = playersNeeded - general.length;
          draftedEntries = [...general, ...losers.slice(0, neededFromLosers)];
        } else if (winners.length >= playersNeeded) {
          draftedEntries = winners.slice(0, playersNeeded);
        } else if (losers.length >= playersNeeded) {
          draftedEntries = losers.slice(0, playersNeeded);
        } else {
          draftedEntries = prioritizedQueue.slice(0, playersNeeded);
        }
      }

      const draftedUsernames = draftedEntries.map((e) => e.username);

      // Remove drafted entries from the temporary priority array for the next iteration
      for (let i = prioritizedQueue.length - 1; i >= 0; i--) {
        if (draftedUsernames.includes(prioritizedQueue[i].username)) {
          prioritizedQueue.splice(i, 1);
        }
      }

      // Hydrate usernames into full Player objects
      const playersToBalance = draftedEntries.map(
        (entry) => this.state.players[entry.username],
      );

      // Tombstone drafted entries so the deletion propagates in cross-admin sync.
      const draftTombstoneAt = Date.now();
      this.state.queues.forEach((q) => {
        if (draftedUsernames.includes(q.username) && !q.deletedAt) {
          q.deletedAt = draftTombstoneAt;
          q.updatedAt = draftTombstoneAt;
        }
      });

      // Generate the match
      const match = MatchmakerEngine.draftBalancedMatch(
        playersToBalance,
        this.state.teamSize,
        this.state.matchmakingMode || 'fair_balance',
      );

      // Validate no duplicate players in the match
      const allMatchPlayers = [...match.teamA, ...match.teamB];
      const uniquePlayers = new Set(allMatchPlayers.map((p) => p.username));
      if (allMatchPlayers.length !== uniquePlayers.size) {
        console.error(
          'MatchmakerEngine returned match with duplicate players:',
          match,
        );
        continue; // Skip this match and try the next round
      }

      // Determine the dominant queue source for the UI tag (just use the first player's type)
      const dominantSource = draftedEntries[0].queueType || 'GENERAL';

      // Map original queue types
      const originalQueueTypes: Record<
        string,
        'GENERAL' | 'WINNERS' | 'LOSERS'
      > = {};
      draftedEntries.forEach((entry) => {
        originalQueueTypes[entry.username] = entry.queueType;
      });

      // Compute queue-priority metadata for match ordering
      const oldestQueueEntryAt = Math.min(
        ...draftedEntries.map((e) => e.enteredAt),
      );
      const minGamesPlayed = Math.min(
        ...draftedEntries.map(
          (e) => this.state.players[e.username]?.matchesPlayed || 0,
        ),
      );

      // Push to active matches
      this.state.activeMatches.push({
        matchId: Math.random().toString(36).substring(2, 9), // Simple local ID
        queueSource: dominantSource as
          | 'GENERAL'
          | 'WINNERS'
          | 'LOSERS'
          | 'MANUAL',
        teamA: match.teamA.map((p) => p.username),
        teamB: match.teamB.map((p) => p.username),
        expectedDifference: match.expectedDifference,
        status: 'waiting',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        originalQueueTypes,
        oldestQueueEntryAt,
        minGamesPlayed,
      });
    }

    // One-shot: after drafting with strict_balance, revert to balance_first
    // so subsequent rounds use queue-priority selection again.
    if (isStrictBalance) {
      // change matchmaking mode back to fair_balance
      this.state.matchmakingMode = 'fair_balance';
      this.state.settingsUpdatedAt = Date.now();
    }

    this.saveState();
  }

  // 3. Report a score for an active match
  public reportMatchScore(
    matchId: string,
    teamAScore: number,
    teamBScore: number,
    returnMethod: string = 'end_of_queue',
  ) {
    const matchIndex = this.state.activeMatches.findIndex(
      (m) => !m.deletedAt && m.matchId === matchId,
    );
    if (matchIndex === -1) {
      console.warn(`[reportMatchScore] Match not found: ${matchId}`);
      return;
    }

    const match = this.state.activeMatches[matchIndex];
    console.log(
      `[reportMatchScore] Completing match ${matchId}, returnMethod: ${returnMethod}`,
    );

    // Hydrate players from usernames
    const teamA = match.teamA.map((u) => this.state.players[u]);
    const teamB = match.teamB.map((u) => this.state.players[u]);

    const teamAWon = teamAScore > teamBScore;
    const winners = teamAWon ? teamA : teamB;
    const losers = teamAWon ? teamB : teamA;
    const scoreW = teamAWon ? teamAScore : teamBScore;
    const scoreL = teamAWon ? teamBScore : teamAScore;

    // Update Match History for Matchup Novelty
    const updateHistory = (playerArray: Player[], opponentArray: Player[]) => {
      playerArray.forEach((p) => {
        if (!p.history) p.history = { playedWith: {}, playedAgainst: {} };

        // Played with teammates
        playerArray.forEach((teammate) => {
          if (teammate.username !== p.username) {
            p.history!.playedWith[teammate.username] =
              (p.history!.playedWith[teammate.username] || 0) + 1;
          }
        });

        // Played against opponents
        opponentArray.forEach((opponent) => {
          p.history!.playedAgainst[opponent.username] =
            (p.history!.playedAgainst[opponent.username] || 0) + 1;
        });
      });
    };

    updateHistory(teamA, teamB);
    updateHistory(teamB, teamA);

    // Apply Math
    const { updatedWinners, updatedLosers } = RatingEngine.calculateShift(
      winners,
      losers,
      scoreW,
      scoreL,
    );

    // Save new ratings to dictionary
    updatedWinners.forEach((p) => (this.state.players[p.username] = p));
    updatedLosers.forEach((p) => (this.state.players[p.username] = p));

    // Persist completed match for DUPR export
    const now = Date.now();
    const getFullName = (p: Player) =>
      [p.firstName, p.lastName].filter(Boolean).join(' ') || undefined;
    const matchType: 'singles' | 'doubles' =
      match.teamA.length === 1 ? 'singles' : 'doubles';
    const completedMatch: CompletedMatch = {
      matchId: match.matchId,
      matchType,
      teamA: teamA.map((p) => ({
        username: p.username,
        name: getFullName(p),
        duprId: p.duprId,
        firstName: p.firstName,
        lastName: p.lastName,
        level: p.level,
        rating: p.rating,
        avatar: p.avatar,
      })),
      teamB: teamB.map((p) => ({
        username: p.username,
        name: getFullName(p),
        duprId: p.duprId,
        firstName: p.firstName,
        lastName: p.lastName,
        level: p.level,
        rating: p.rating,
        avatar: p.avatar,
      })),
      teamAScore,
      teamBScore,
      startedAt: match.startedAt,
      completedAt: now,
      updatedAt: now,
    };
    this.state.completedMatches.push(completedMatch);

    let winnerEnteredAt = Date.now();
    let loserEnteredAt = Date.now();

    if (returnMethod === 'fairness_first') {
      winnerEnteredAt = 0;
      loserEnteredAt = 0;
    } else if (returnMethod === 'smart_position') {
      winnerEnteredAt = Date.now();
      loserEnteredAt = Date.now();
    }

    // Send Winners back to Winners Queue (only if they aren't somehow already there)
    updatedWinners.forEach((p) => {
      const alreadyInQueue = this.state.queues.some(
        (q) => !q.deletedAt && q.username === p.username,
      );
      if (!alreadyInQueue) {
        this.state.queues.push({
          username: p.username,
          queueType: 'WINNERS',
          enteredAt: winnerEnteredAt,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          queuedAt: Date.now(),
        });
        console.log(
          `[reportMatchScore] Added winner ${p.username} to WINNERS queue`,
        );
      } else {
        console.log(
          `[reportMatchScore] Winner ${p.username} already in queue, skipped`,
        );
      }
    });

    // Send Losers back to Losers Queue
    updatedLosers.forEach((p) => {
      const alreadyInQueue = this.state.queues.some(
        (q) => !q.deletedAt && q.username === p.username,
      );
      if (!alreadyInQueue) {
        this.state.queues.push({
          username: p.username,
          queueType: 'LOSERS',
          enteredAt: loserEnteredAt,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          queuedAt: Date.now(),
        });
        console.log(
          `[reportMatchScore] Added loser ${p.username} to LOSERS queue`,
        );
      } else {
        console.log(
          `[reportMatchScore] Loser ${p.username} already in queue, skipped`,
        );
      }
    });

    // Tombstone match instead of removing (for cross-admin sync)
    this.state.activeMatches[matchIndex].deletedAt = Date.now();
    this.state.activeMatches[matchIndex].updatedAt = Date.now();

    this.saveState();
  }

  public persist() {
    this.saveState();
  }

  // Save to LocalStorage WITHOUT firing onStateChange (used after a programmatic
  // merge so we don't recursively trigger another cloud sync).
  public persistSilently() {
    LocalStorage.set(STORAGE_KEY, this.state);
  }
}

/**
 * Smart-merge two AppStates when concurrent admin edits collide.
 * Uses per-entity Last-Write-Wins (LWW) with timestamps:
 * - players: per-player updatedAt wins (or matchesPlayed as fallback)
 * - queues: per-queue updatedAt wins
 * - matches: per-match updatedAt wins
 * - settings: settingsUpdatedAt wins
 */
export function mergeAppState(local: AppState, server: AppState): AppState {
  const localTime = local.lastModified ?? 0;
  const serverTime = server.lastModified ?? 0;
  const localSettingsTime = local.settingsUpdatedAt ?? 0;
  const serverSettingsTime = server.settingsUpdatedAt ?? 0;

  // Detect hard reset: if local state is completely empty (no players, no queues,
  // no matches) and has a newer timestamp than server, this is an intentional
  // reset operation and should overwrite server state entirely.
  const localHasNoPlayers =
    Object.values(local.players || {}).filter((p) => !p.deletedAt).length === 0;
  const localHasNoQueues =
    (local.queues || []).filter((q) => !q.deletedAt).length === 0;
  const localHasNoMatches =
    (local.activeMatches || []).filter((m) => !m.deletedAt).length === 0;
  if (
    localHasNoPlayers &&
    localHasNoQueues &&
    localHasNoMatches &&
    localTime > serverTime
  ) {
    return { ...local };
  }

  // Detect remote reset: if server state is completely empty (no players, no
  // queues, no matches) and has a newer timestamp than local, another admin
  // performed a reset and we should adopt the empty server state.
  const serverHasNoPlayers =
    Object.values(server.players || {}).filter((p) => !p.deletedAt).length ===
    0;
  const serverHasNoQueues =
    (server.queues || []).filter((q) => !q.deletedAt).length === 0;
  const serverHasNoMatches =
    (server.activeMatches || []).filter((m) => !m.deletedAt).length === 0;
  if (
    serverHasNoPlayers &&
    serverHasNoQueues &&
    serverHasNoMatches &&
    serverTime > localTime
  ) {
    return { ...server };
  }

  // Compute effective reset checkpoints (latest reset wins across both sides)
  const effectivePlayersResetAt = Math.max(
    local.playersResetAt ?? 0,
    server.playersResetAt ?? 0,
  );
  const effectiveQueuesResetAt = Math.max(
    local.queuesResetAt ?? 0,
    server.queuesResetAt ?? 0,
  );
  const effectiveMatchesResetAt = Math.max(
    local.matchesResetAt ?? 0,
    server.matchesResetAt ?? 0,
  );

  // Pre-filter collections: drop any entity created before the effective checkpoint
  const filterPlayers = (
    players: Record<string, Player>,
    checkpoint: number,
  ) => {
    if (checkpoint === 0) return players;
    // A tombstoned player created before the reset but deleted after it must
    // survive so the tombstone can win over stale live copies on other admins.
    // Also include statsUpdatedAt so a player who got new stats after the
    // reset is not incorrectly purged.
    const filtered: Record<string, Player> = {};
    for (const [key, p] of Object.entries(players)) {
      const effectiveTime = Math.max(
        p.createdAt ?? 0,
        p.updatedAt ?? 0,
        p.deletedAt ?? 0,
        p.statsUpdatedAt ?? 0,
      );
      if (effectiveTime >= checkpoint) {
        filtered[key] = p;
      }
    }
    return filtered;
  };

  const filterQueues = (queues: QueueEntry[], checkpoint: number) => {
    if (checkpoint === 0) return queues;
    // Use the latest of createdAt / updatedAt / deletedAt for the checkpoint.
    // enteredAt is a sort-priority value that can be 0 (the 'fairness_first' /
    // Jump-to-Front sentinel) and must never be used here.
    // A tombstoned entry created before the reset but deleted after it must
    // survive so the tombstone can win over stale live copies on other admins.
    return queues.filter((q) => {
      const effectiveTime = Math.max(
        q.createdAt ?? 0,
        q.updatedAt ?? 0,
        q.deletedAt ?? 0,
      );
      return effectiveTime >= checkpoint;
    });
  };

  const filterMatches = (matches: ActiveMatch[], checkpoint: number) => {
    if (checkpoint === 0) return matches;
    // A tombstoned match created before the reset but deleted after it must
    // survive so the tombstone can win over stale active copies on other admins.
    return matches.filter((m) => {
      const effectiveTime = Math.max(
        m.createdAt ?? 0,
        m.updatedAt ?? 0,
        m.deletedAt ?? 0,
      );
      return effectiveTime >= checkpoint;
    });
  };

  const localPlayers = filterPlayers(
    local.players || {},
    effectivePlayersResetAt,
  );
  const serverPlayers = filterPlayers(
    server.players || {},
    effectivePlayersResetAt,
  );
  const localQueues = filterQueues(local.queues || [], effectiveQueuesResetAt);
  const serverQueues = filterQueues(
    server.queues || [],
    effectiveQueuesResetAt,
  );
  const localMatches = filterMatches(
    local.activeMatches || [],
    effectiveMatchesResetAt,
  );
  const serverMatches = filterMatches(
    server.activeMatches || [],
    effectiveMatchesResetAt,
  );

  // Merge players using per-field LWW:
  // 1. Non-stat fields (name, avatar, level, etc.) use player.updatedAt (whole-object LWW).
  // 2. Stats fields (matchesPlayed, wins, losses, history) use statsUpdatedAt.
  // 3. Rating uses ratingUpdatedAt.
  // This prevents a non-stat edit (avatar change) from overwriting fresh stats.
  const mergedPlayers: Record<string, Player> = { ...serverPlayers };
  for (const [username, lp] of Object.entries(localPlayers)) {
    const sp = mergedPlayers[username];
    if (!sp) {
      mergedPlayers[username] = lp;
      continue;
    }

    // Step 1: pick the base winner by overall updatedAt (or matchesPlayed fallback)
    const lpTime = lp.updatedAt ?? 0;
    const spTime = sp.updatedAt ?? 0;
    let baseWinner: Player;
    if (lpTime > 0 || spTime > 0) {
      baseWinner = lpTime > spTime ? { ...lp } : { ...sp };
    } else {
      const lpGames = lp.matchesPlayed ?? 0;
      const spGames = sp.matchesPlayed ?? 0;
      if (lpGames > spGames) baseWinner = { ...lp };
      else if (spGames > lpGames) baseWinner = { ...sp };
      else {
        // No entity-level timestamps and identical stats.
        // Prefer server as source of truth. Never use whole-state lastModified
        // for entity-level conflict resolution — an offline admin's unrelated
        // local activity (e.g., queue changes) can make localTime newer even
        // though this specific player was never touched locally.
        baseWinner = { ...sp };
      }
    }

    // Step 2: overlay newer stats if the loser has fresher stats
    const other = baseWinner === lp ? sp : lp;
    const baseStatsAt = baseWinner.statsUpdatedAt ?? 0;
    const otherStatsAt = other.statsUpdatedAt ?? 0;
    if (otherStatsAt > baseStatsAt) {
      baseWinner.matchesPlayed = other.matchesPlayed;
      baseWinner.wins = other.wins;
      baseWinner.losses = other.losses;
      baseWinner.history = other.history ? { ...other.history } : undefined;
      baseWinner.statsUpdatedAt = otherStatsAt;
    }

    // Step 3: overlay newer rating if the loser has a fresher rating
    const baseRatingAt = baseWinner.ratingUpdatedAt ?? 0;
    const otherRatingAt = other.ratingUpdatedAt ?? 0;
    if (otherRatingAt > baseRatingAt) {
      baseWinner.rating = other.rating;
      baseWinner.ratingUpdatedAt = otherRatingAt;
    }

    mergedPlayers[username] = baseWinner;
  }

  // Handle player deletions using tombstone (deletedAt) instead of top-level lastModified.
  for (const username of Object.keys(mergedPlayers)) {
    const lp = localPlayers[username];
    const sp = serverPlayers[username];
    const localDeleted = lp?.deletedAt ?? 0;
    const serverDeleted = sp?.deletedAt ?? 0;
    if (localDeleted > 0 || serverDeleted > 0) {
      const localTime = Math.max(lp?.updatedAt ?? 0, localDeleted);
      const serverTime = Math.max(sp?.updatedAt ?? 0, serverDeleted);
      const winner = localTime > serverTime ? lp! : sp!;
      const loser = localTime > serverTime ? sp! : lp!;

      // Even if the tombstone/liveness winner is chosen by updatedAt,
      // still overlay fresher stats from the loser if available.
      const winnerStatsAt = winner.statsUpdatedAt ?? 0;
      const loserStatsAt = loser.statsUpdatedAt ?? 0;
      if (loserStatsAt > winnerStatsAt) {
        winner.matchesPlayed = loser.matchesPlayed;
        winner.wins = loser.wins;
        winner.losses = loser.losses;
        winner.history = loser.history ? { ...loser.history } : undefined;
        winner.statsUpdatedAt = loserStatsAt;
      }
      const winnerRatingAt = winner.ratingUpdatedAt ?? 0;
      const loserRatingAt = loser.ratingUpdatedAt ?? 0;
      if (loserRatingAt > winnerRatingAt) {
        winner.rating = loser.rating;
        winner.ratingUpdatedAt = loserRatingAt;
      }

      mergedPlayers[username] = winner;
    }
  }

  // Merge queues using pure per-entry Last-Write-Wins.
  // Each key is (username, queueType). For each key, keep the version with the
  // highest updatedAt, regardless of which side has a newer top-level
  // lastModified. Tombstones (deletedAt) are simply versions with a deletion
  // flag — the latest updatedAt wins, so a newer tombstone overrides an older
  // live copy, and a newer live copy overrides an older tombstone. This removes
  // the whole-side lastModified bias that previously let stale data win.
  const mergedQueues: typeof local.queues = [];
  const allQueues = new Map<
    string,
    { entry: QueueEntry; source: 'local' | 'server' }
  >();

  localQueues.forEach((q) =>
    allQueues.set(`${q.username}-${q.queueType}`, {
      entry: q,
      source: 'local',
    }),
  );

  serverQueues.forEach((q) => {
    const key = `${q.username}-${q.queueType}`;
    const existing = allQueues.get(key);
    if (!existing) {
      allQueues.set(key, { entry: q, source: 'server' });
    } else {
      const localTime = existing.entry.updatedAt ?? 0;
      const serverTimeEntry = q.updatedAt ?? 0;
      if (serverTimeEntry > localTime) {
        allQueues.set(key, { entry: q, source: 'server' });
      }
    }
  });

  // Deduplicate: a player should only appear in one queue at a time.
  // Use queuedAt vs deletedAt to decide whether a player is in the queue.
  // A tombstone with a newer deletedAt than any live queuedAt means the
  // player was removed after being queued — old live entries must not resurrect.
  const latestPerPlayer = new Map<string, QueueEntry>();
  const entriesByPlayer = new Map<string, QueueEntry[]>();
  allQueues.forEach(({ entry }) => {
    const arr = entriesByPlayer.get(entry.username) || [];
    arr.push(entry);
    entriesByPlayer.set(entry.username, arr);
  });

  entriesByPlayer.forEach((entries) => {
    const live = entries.filter((e) => !e.deletedAt);
    const tombstones = entries.filter((e) => e.deletedAt);
    const maxLiveQueuedAt =
      live.length > 0
        ? Math.max(
            ...live.map((e) => e.queuedAt ?? e.createdAt ?? e.updatedAt ?? 0),
          )
        : 0;
    const maxTombstoneDeletedAt =
      tombstones.length > 0
        ? Math.max(...tombstones.map((e) => e.deletedAt ?? 0))
        : 0;

    let candidates: QueueEntry[];
    if (maxTombstoneDeletedAt > maxLiveQueuedAt) {
      // Player was removed after the latest queue-add: tombstone wins
      candidates = tombstones;
    } else if (maxLiveQueuedAt > maxTombstoneDeletedAt) {
      // Player was added after the latest removal: live entry wins
      candidates = live;
    } else {
      // No conflict or equal — fall back to all entries
      candidates = entries;
    }

    // Pick the candidate with the highest queuedAt first,
    // then updatedAt / createdAt fallback. This prevents a stale live entry
    // with a coincidentally high updatedAt (e.g. wrong clock on offline admin)
    // from resurrecting over a more recently queued live entry.
    const winner = candidates.reduce((best, e) => {
      const bestQueued = best.queuedAt ?? best.createdAt ?? 0;
      const eQueued = e.queuedAt ?? e.createdAt ?? 0;
      if (eQueued !== bestQueued) return eQueued > bestQueued ? e : best;

      const bestTime = best.updatedAt ?? best.createdAt ?? 0;
      const eTime = e.updatedAt ?? e.createdAt ?? 0;
      return eTime > bestTime ? e : best;
    }, candidates[0]!);

    latestPerPlayer.set(winner.username, winner);
  });

  latestPerPlayer.forEach((entry) => mergedQueues.push(entry));

  // Merge matches using per-match updatedAt (or createdAt as fallback)
  const mergedMatches: typeof local.activeMatches = [];
  const allMatches = new Map<
    string,
    { match: ActiveMatch; source: 'local' | 'server' }
  >();

  localMatches.forEach((m) =>
    allMatches.set(m.matchId, { match: m, source: 'local' }),
  );
  serverMatches.forEach((m) => {
    const existing = allMatches.get(m.matchId);
    if (!existing) {
      allMatches.set(m.matchId, { match: m, source: 'server' });
    } else {
      // Both have this match - use updatedAt LWW
      const localTime =
        existing.match.updatedAt ?? existing.match.createdAt ?? 0;
      const serverTime = m.updatedAt ?? m.createdAt ?? 0;
      if (serverTime > localTime) {
        allMatches.set(m.matchId, { match: m, source: 'server' });
      }
    }
  });

  // Handle match deletions using tombstone (deletedAt).
  // A match missing on one side but present on the other is NOT auto-deleted;
  // only an explicit tombstone (deletedAt) propagates the deletion.
  for (const matchId of allMatches.keys()) {
    const lm = localMatches.find((m) => m.matchId === matchId);
    const sm = serverMatches.find((m) => m.matchId === matchId);
    const localDeleted = lm?.deletedAt ?? 0;
    const serverDeleted = sm?.deletedAt ?? 0;
    if (localDeleted > 0 || serverDeleted > 0) {
      // At least one side deleted: the later deletion wins
      allMatches.set(
        matchId,
        localDeleted > serverDeleted
          ? { match: lm!, source: 'local' }
          : { match: sm!, source: 'server' },
      );
    }
  }

  // Only keep non-deleted matches in the merged result
  allMatches.forEach(({ match }) => {
    if (!match.deletedAt) {
      mergedMatches.push(match);
    }
  });

  // Enforce constraint: no player can be in both queue and an active match.
  // IMPORTANT: this must run on the MERGED matches (not the raw per-side
  // arrays). A stale admin may still have a just-completed match flagged as
  // active locally; the merge above tombstones it via LWW, so using
  // mergedMatches prevents that stale match from incorrectly removing queue
  // entries the other admin re-added on completion.
  const playersInMatches = new Set<string>();
  mergedMatches.forEach((m) => {
    m.teamA.forEach((username) => playersInMatches.add(username));
    m.teamB.forEach((username) => playersInMatches.add(username));
  });

  const filteredQueues = mergedQueues.filter(
    (q) => !q.deletedAt && !playersInMatches.has(q.username),
  );

  console.log(
    '[mergeAppState] local queues:',
    local.queues?.length,
    'server queues:',
    server.queues?.length,
    'merged queues:',
    mergedQueues.length,
    'after removing players in matches:',
    filteredQueues.length,
    'winning side:',
    serverTime > localTime ? 'server' : 'local',
  );

  // Merge completedMatches by matchId using updatedAt LWW
  const mergedCompletedMatches: CompletedMatch[] = [];
  const allCompleted = new Map<
    string,
    { match: CompletedMatch; source: 'local' | 'server' }
  >();

  (local.completedMatches || []).forEach((m) =>
    allCompleted.set(m.matchId, { match: m, source: 'local' }),
  );
  (server.completedMatches || []).forEach((m) => {
    const existing = allCompleted.get(m.matchId);
    if (!existing) {
      allCompleted.set(m.matchId, { match: m, source: 'server' });
    } else if (m.updatedAt > existing.match.updatedAt) {
      allCompleted.set(m.matchId, { match: m, source: 'server' });
    }
  });

  // Determine winning settings side for completedMatchesResetAt / lastExportedAt
  const settingsSource =
    localSettingsTime > serverSettingsTime ? local : server;
  const winningResetAt = settingsSource.completedMatchesResetAt ?? 0;

  allCompleted.forEach(({ match }) => {
    if (match.completedAt > winningResetAt) {
      mergedCompletedMatches.push(match);
    }
  });

  // If a match exists in completedMatches, it must not remain active
  // (in-progress or waiting). Tombstone stale active copies so the merge
  // never resurrects a match that has already been reported.
  const completedMatchIds = new Set(
    mergedCompletedMatches.map((m) => m.matchId),
  );
  mergedMatches.forEach((m) => {
    if (!m.deletedAt && completedMatchIds.has(m.matchId)) {
      m.deletedAt = Date.now();
      m.updatedAt = Date.now();
    }
  });
  const activeMatchesAfterCleanup = mergedMatches.filter((m) => !m.deletedAt);

  const mergedState: AppState = {
    ...settingsSource,
    players: mergedPlayers,
    queues: filteredQueues,
    activeMatches: activeMatchesAfterCleanup,
    completedMatches: mergedCompletedMatches,
    lastModified: Math.max(localTime, serverTime),
    settingsUpdatedAt: Math.max(localSettingsTime, serverSettingsTime),
    playersResetAt: effectivePlayersResetAt,
    queuesResetAt: effectiveQueuesResetAt,
    matchesResetAt: effectiveMatchesResetAt,
  };

  // Ensure no player ends up in multiple active matches after merge.
  // Losing matches are tombstoned and their players returned to queue.
  enforceOneMatchPerPlayerOnState(mergedState);

  return mergedState;
}

// Export a singleton instance so it can be easily imported into any Vue Component
export const MatchmakingApp = new LocalMatchmakingSystem(2); // Initialize for Doubles by default
