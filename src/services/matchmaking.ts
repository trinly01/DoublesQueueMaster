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
  enteredAt: number; // Timestamp for FIFO ordering
  updatedAt?: number; // Epoch ms of last change (for per-field LWW)
  deletedAt?: number; // Epoch ms of deletion (tombstone). If present, entry is logically deleted.
}

export interface ActiveMatch {
  matchId: string; // Simple random string to identify the court/game
  queueSource: 'GENERAL' | 'WINNERS' | 'LOSERS' | 'MANUAL';
  teamA: string[]; // Array of usernames
  teamB: string[]; // Array of usernames
  expectedDifference: number;
  status: 'waiting' | 'in-progress' | 'completed';
  court?: number;
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
  level?: number;
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
  matchmakingMode?: 'variety_first' | 'balance_first';
  sortBy?: 'matchesPlayed' | 'rating' | 'winRate' | 'wins' | 'losses' | 'name';
  matchType?: 'singles' | 'doubles';
  matchesFilterBy?: 'all' | number;
  scoreType?: 'RALLY' | 'SIDEOUT'; // For DUPR CSV export
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
  state.activeMatches.forEach((m) => {
    if (matchesToRemove.has(m.matchId)) {
      // Return all players from this match to the queue
      [...m.teamA, ...m.teamB].forEach((username) => {
        if (
          !state.queues.some((q) => !q.deletedAt && q.username === username)
        ) {
          state.queues.push({
            username,
            queueType:
              m.originalQueueTypes?.[username] ||
              (m.queueSource === 'MANUAL' ? 'GENERAL' : m.queueSource) ||
              'GENERAL',
            enteredAt: now,
            updatedAt: now,
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
        updatedAt: Date.now(),
      };
    };

    return {
      updatedWinners: winners.map((p) => applyToPlayer(p, true, winners)),
      updatedLosers: losers.map((p) => applyToPlayer(p, false, losers)),
    };
  },
};

// Harmonic Mean of team ratings (same logic used in draftBalancedMatch)
export const computeTeamRating = (team: Player[]) => {
  if (team.length === 0) return 1500;
  const sumReciprocal = team.reduce(
    (sum, p) => sum + 1 / Math.max(1, p.rating),
    0,
  );
  return team.length / sumReciprocal;
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
    mode: 'variety_first' | 'balance_first' = 'variety_first',
  ) => {
    const allMatchups = MatchmakerEngine.getCombinations(players, teamSize);

    // Calculate team strength using Harmonic Mean
    const harmonicMean = (team: Player[]) => {
      if (team.length === 0) return 1500;
      const sumReciprocal = team.reduce(
        (sum, p) => sum + 1 / Math.max(1, p.rating),
        0,
      );
      return team.length / sumReciprocal;
    };

    const evaluated = allMatchups.map((matchup) => {
      const ratingA = harmonicMean(matchup.teamA);
      const ratingB = harmonicMean(matchup.teamB);
      const expectedDifference = Math.abs(ratingA - ratingB);

      if (mode === 'balance_first') {
        // Original combined-score behavior
        let noveltyPenalty = 0;
        const addTeamPenalty = (team: Player[]) => {
          for (let i = 0; i < team.length; i++) {
            for (let j = i + 1; j < team.length; j++) {
              const historyCount =
                team[i].history?.playedWith?.[team[j].username] || 0;
              noveltyPenalty += historyCount * 50;
            }
          }
        };
        addTeamPenalty(matchup.teamA);
        addTeamPenalty(matchup.teamB);
        for (const pA of matchup.teamA) {
          for (const pB of matchup.teamB) {
            const historyCount = pA.history?.playedAgainst?.[pB.username] || 0;
            noveltyPenalty += historyCount * 15;
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

    if (mode === 'balance_first') {
      type ScoreItem = { combinedScore: number };
      evaluated.sort(
        (a, b) =>
          (a as unknown as ScoreItem).combinedScore -
          (b as unknown as ScoreItem).combinedScore,
      );
      const poolSize = Math.min(3, evaluated.length);
      return evaluated[Math.floor(Math.random() * poolSize)];
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
      initialState.matchmakingMode = 'variety_first';
    if (initialState.sortBy === undefined)
      initialState.sortBy = 'matchesPlayed';
    if (initialState.matchType === undefined)
      initialState.matchType = 'doubles';
    if (initialState.matchesFilterBy === undefined)
      initialState.matchesFilterBy = 'all';
    if (initialState.scoreType === undefined)
      initialState.scoreType = 'SIDEOUT';
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

    // Deduplicate queues by username (keep newest updatedAt/enteredAt,
    // including tombstones so a newer deletion can win over an older live entry)
    const uniqueQueues = new Map<string, QueueEntry>();
    this.state.queues.forEach((q) => {
      const existing = uniqueQueues.get(q.username);
      if (!existing) {
        uniqueQueues.set(q.username, q);
      } else {
        const existingTime = existing.updatedAt ?? existing.enteredAt ?? 0;
        const entryTime = q.updatedAt ?? q.enteredAt ?? 0;
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
        if ((player.createdAt ?? 0) >= playersCheckpoint) {
          keptPlayers[key] = player;
        }
      }
      this.state.players = keptPlayers;
    }

    if (queuesCheckpoint > 0) {
      this.state.queues = this.state.queues.filter(
        (q) => (q.enteredAt ?? 0) >= queuesCheckpoint,
      );
    }

    if (matchesCheckpoint > 0) {
      this.state.activeMatches = this.state.activeMatches.filter(
        (m) => (m.createdAt ?? 0) >= matchesCheckpoint,
      );
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
    this.state.matchmakingMode = 'variety_first';
    this.state.sortBy = 'matchesPlayed';
    this.state.matchType = 'doubles';
    this.state.matchesFilterBy = 'all';
    this.state.scoreType = 'SIDEOUT';
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
      updatedAt: Date.now(),
    });

    this.saveState();
    return 'added';
  }

  public removeFromQueue(username: string) {
    this.state.queues = this.state.queues.filter(
      (q) => q.username !== username,
    );
    this.saveState();
  }

  // 2. Draft the next round of matches from waiting players
  public draftNextMatches(priorityMode: string = 'timestamp') {
    const playersNeeded = this.state.teamSize * 2;

    const sortFn = (a: QueueEntry, b: QueueEntry) => {
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

    const prioritizedQueue = [...this.state.queues].sort(sortFn);

    while (prioritizedQueue.length >= playersNeeded) {
      let draftedEntries: QueueEntry[] = [];

      const winners = prioritizedQueue.filter((q) => q.queueType === 'WINNERS');
      const losers = prioritizedQueue.filter((q) => q.queueType === 'LOSERS');
      const general = prioritizedQueue.filter((q) => q.queueType === 'GENERAL');

      // Find all groups that have enough players to form a match
      const validGroups = [];
      if (winners.length >= playersNeeded) validGroups.push(winners);
      if (losers.length >= playersNeeded) validGroups.push(losers);
      if (general.length >= playersNeeded) validGroups.push(general);

      if (validGroups.length > 0) {
        // Find the group that contains the player who has been waiting longest in prioritizedQueue
        let bestGroup = validGroups[0];
        let bestIndex = prioritizedQueue.length;

        for (const group of validGroups) {
          const index = prioritizedQueue.findIndex(
            (q) => q.username === group[0].username,
          );
          if (index < bestIndex) {
            bestIndex = index;
            bestGroup = group;
          }
        }
        // In balance-first, sort by rating so closest-rated players are adjacent
        if (this.state.matchmakingMode === 'balance_first') {
          bestGroup.sort((a, b) => {
            const rA = this.state.players[a.username]?.rating || 1500;
            const rB = this.state.players[b.username]?.rating || 1500;
            return rB - rA;
          });
        }
        draftedEntries = bestGroup.slice(0, playersNeeded);
      } else {
        // Fallback to drafting from top of queue if no pure group has enough
        if (this.state.matchmakingMode === 'balance_first') {
          prioritizedQueue.sort((a, b) => {
            const rA = this.state.players[a.username]?.rating || 1500;
            const rB = this.state.players[b.username]?.rating || 1500;
            return rB - rA;
          });
        }
        draftedEntries = prioritizedQueue.slice(0, playersNeeded);
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

      // Remove these players from the global queue
      this.state.queues = this.state.queues.filter(
        (q) => !draftedUsernames.includes(q.username),
      );

      // Generate the match
      const match = MatchmakerEngine.draftBalancedMatch(
        playersToBalance,
        this.state.teamSize,
        this.state.matchmakingMode || 'variety_first',
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
    if (matchIndex === -1) return;

    const match = this.state.activeMatches[matchIndex];

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
      completedAt: now,
      updatedAt: now,
    };
    this.state.completedMatches.push(completedMatch);

    let winnerEnteredAt = Date.now();
    let loserEnteredAt = Date.now();

    if (returnMethod === 'fairness_first') {
      winnerEnteredAt = 0;
      loserEnteredAt = 0;
    }

    // Send Winners back to Winners Queue (only if they aren't somehow already there)
    updatedWinners.forEach((p) => {
      if (
        !this.state.queues.some(
          (q) => !q.deletedAt && q.username === p.username,
        )
      ) {
        this.state.queues.push({
          username: p.username,
          queueType: 'WINNERS',
          enteredAt: winnerEnteredAt,
          updatedAt: Date.now(),
        });
      }
    });

    // Send Losers back to Losers Queue
    updatedLosers.forEach((p) => {
      if (
        !this.state.queues.some(
          (q) => !q.deletedAt && q.username === p.username,
        )
      ) {
        this.state.queues.push({
          username: p.username,
          queueType: 'LOSERS',
          enteredAt: loserEnteredAt,
          updatedAt: Date.now(),
        });
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
    const filtered: Record<string, Player> = {};
    for (const [key, p] of Object.entries(players)) {
      if ((p.createdAt ?? 0) >= checkpoint) {
        filtered[key] = p;
      }
    }
    return filtered;
  };

  const filterQueues = (queues: QueueEntry[], checkpoint: number) => {
    if (checkpoint === 0) return queues;
    return queues.filter((q) => (q.enteredAt ?? 0) >= checkpoint);
  };

  const filterMatches = (matches: ActiveMatch[], checkpoint: number) => {
    if (checkpoint === 0) return matches;
    return matches.filter((m) => (m.createdAt ?? 0) >= checkpoint);
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

  // Merge players using per-player updatedAt (or matchesPlayed as fallback)
  const mergedPlayers: Record<string, Player> = { ...serverPlayers };
  for (const [username, lp] of Object.entries(localPlayers)) {
    const sp = mergedPlayers[username];
    if (!sp) {
      mergedPlayers[username] = lp;
      continue;
    }
    // Use updatedAt if available, otherwise fall back to matchesPlayed
    const lpTime = lp.updatedAt ?? 0;
    const spTime = sp.updatedAt ?? 0;
    if (lpTime > 0 || spTime > 0) {
      // Both have updatedAt - use LWW
      mergedPlayers[username] = lpTime > spTime ? lp : sp;
    } else {
      // Fallback to matchesPlayed for backward compatibility
      const lpGames = lp.matchesPlayed ?? 0;
      const spGames = sp.matchesPlayed ?? 0;
      if (lpGames > spGames) mergedPlayers[username] = lp;
      else if (lpGames < spGames) mergedPlayers[username] = sp;
      else mergedPlayers[username] = localTime > serverTime ? lp : sp;
    }
  }

  // Handle player deletions using tombstone (deletedAt) instead of top-level lastModified.
  // A player missing on one side but present on the other is NOT auto-deleted;
  // only an explicit tombstone (deletedAt) propagates the deletion.
  for (const username of Object.keys(mergedPlayers)) {
    const lp = localPlayers[username];
    const sp = serverPlayers[username];
    const localDeleted = lp?.deletedAt ?? 0;
    const serverDeleted = sp?.deletedAt ?? 0;
    if (localDeleted > 0 || serverDeleted > 0) {
      // Use the latest effective timestamp (updatedAt or deletedAt) so a
      // newer live copy can win over an older tombstone (LWW).
      const localTime = Math.max(lp?.updatedAt ?? 0, localDeleted);
      const serverTime = Math.max(sp?.updatedAt ?? 0, serverDeleted);
      mergedPlayers[username] = localTime > serverTime ? lp! : sp!;
    }
  }

  // Merge queues using per-queue updatedAt (or enteredAt as fallback)
  const mergedQueues: typeof local.queues = [];
  const allQueues = new Map<
    string,
    { entry: QueueEntry; source: 'local' | 'server' }
  >();

  // If server state is newer overall, start with server queue entries
  // This ensures queue deletions (when players are drafted into matches) propagate
  if (serverTime > localTime) {
    serverQueues.forEach((q) =>
      allQueues.set(`${q.username}-${q.queueType}`, {
        entry: q,
        source: 'server',
      }),
    );
    localQueues.forEach((q) => {
      const key = `${q.username}-${q.queueType}`;
      const existing = allQueues.get(key);
      if (!existing) {
        // Entry exists locally but not on server
        // If server state is newer, this entry was likely deleted on server
        // Only add it if local entry is newer than server's lastModified
        const localEntryTime = q.updatedAt ?? q.enteredAt ?? 0;
        if (localEntryTime > serverTime) {
          allQueues.set(key, { entry: q, source: 'local' });
        }
      } else {
        // Both have this queue entry - use updatedAt LWW
        const localTime = q.updatedAt ?? q.enteredAt ?? 0;
        const serverEntryTime =
          existing.entry.updatedAt ?? existing.entry.enteredAt ?? 0;
        if (localTime > serverEntryTime) {
          allQueues.set(key, { entry: q, source: 'local' });
        }
      }
    });
  } else {
    // Local state is newer or equal - start with local queue entries
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
        // Entry exists on server but not locally
        // If local state is newer, this entry was likely deleted locally
        // Only add it if server entry is newer than local's lastModified
        const serverEntryTime = q.updatedAt ?? q.enteredAt ?? 0;
        if (serverEntryTime > localTime) {
          allQueues.set(key, { entry: q, source: 'server' });
        }
      } else {
        // Both have this queue entry - use updatedAt LWW
        const localEntryTime =
          existing.entry.updatedAt ?? existing.entry.enteredAt ?? 0;
        const serverEntryTime = q.updatedAt ?? q.enteredAt ?? 0;
        if (serverEntryTime > localEntryTime) {
          allQueues.set(key, { entry: q, source: 'server' });
        }
      }
    });
  }

  // Deduplicate: a player should only appear in one queue at a time.
  // Keep the entry with the latest updatedAt (or enteredAt) per username.
  const latestPerPlayer = new Map<string, QueueEntry>();
  allQueues.forEach(({ entry }) => {
    const existing = latestPerPlayer.get(entry.username);
    if (!existing) {
      latestPerPlayer.set(entry.username, entry);
    } else {
      const existingTime = existing.updatedAt ?? existing.enteredAt ?? 0;
      const entryTime = entry.updatedAt ?? entry.enteredAt ?? 0;
      if (entryTime > existingTime) {
        latestPerPlayer.set(entry.username, entry);
      }
    }
  });
  latestPerPlayer.forEach((entry) => mergedQueues.push(entry));

  // Enforce constraint: no player can be in both queue and active matches
  // Only consider matches from the winning side (newer state) to avoid
  // removing queue entries that were added by the newer state
  const playersInMatches = new Set<string>();
  const winningMatches = serverTime > localTime ? serverMatches : localMatches;

  winningMatches.forEach((m) => {
    if (!m.deletedAt) {
      m.teamA.forEach((username) => playersInMatches.add(username));
      m.teamB.forEach((username) => playersInMatches.add(username));
    }
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

  const mergedState: AppState = {
    ...settingsSource,
    players: mergedPlayers,
    queues: filteredQueues,
    activeMatches: mergedMatches,
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
