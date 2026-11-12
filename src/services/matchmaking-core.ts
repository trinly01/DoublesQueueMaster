import type { MatchMeta } from '../types/matchMeta';

/**
 * ==========================================
 * 1. PWA LOCAL STORAGE ENTITIES
 * ==========================================
 */

/**
 * True when a stored DUPR entitlements snapshot includes PREMIUM_L1.
 * Snapshot shape written by the Connect flow onto directus_users /
 * dupr_connection: { entitlements: { <category>: string[] }, eligible }.
 */
export function hasPremiumL1(entitlements: unknown): boolean {
  const ent = (entitlements as { entitlements?: Record<string, unknown[]> })
    ?.entitlements;
  if (!ent || typeof ent !== 'object') return false;
  return Object.values(ent).some(
    (arr) => Array.isArray(arr) && arr.includes('PREMIUM_L1'),
  );
}

export interface Player {
  username: string; // Unique identifier
  name?: string; // Optional alias for UI compatibility
  firstName?: string; // First name from Directus
  lastName?: string; // Last name from Directus
  level: 1 | 2 | 3; // Added for manual matchmaking and UI labels
  rating: number; // Defaults to levelSeedRating(level) on check-in
  matchesPlayed: number; // Defaults to 0
  wins: number;
  losses: number;
  priority?: string;
  userId?: string; // Directus user ID — present only for registered club members
  duprId?: string; // DUPR player ID for CSV export
  duprPlus?: boolean; // Hydrated from directus_users.dupr_entitlements — holds PREMIUM_L1
  ratingUpdatedAt?: number; // Epoch ms of the last rating change (LWW token vs directus_users.rating_updated_at)
  statsUpdatedAt?: number; // Epoch ms of the last matchesPlayed/wins/losses/history change
  updatedAt?: number; // Epoch ms of the last any field change (for per-field LWW)
  createdAt?: number; // Epoch ms when player was first created (for checkpoint purge)
  avatar?: string; // Avatar URL from Directus
  linkedTo?: string; // Username of the fixed-duo partner (session-scoped). Enforced only when mutual.
  linkedAt?: number; // Epoch ms when the link was created (display).
  linkUpdatedAt?: number; // Epoch ms of the last link/unlink write (dedicated LWW token — isolates link state from other player edits)
  avoids?: Record<string, 'partner' | 'match'>; // Session-scoped avoid map: target username → 'match' (legacy 'partner' entries are treated the same). Semantics: prefer different matches (soft), and when forced into the same match the pair must sit on opposite teams (hard).
  avoidUpdatedAt?: number; // Epoch ms of the last avoid write (dedicated LWW token — isolates avoid state from other player edits)
  deletedAt?: number; // Epoch ms of deletion (tombstone). If present, player is logically deleted.
  addedAt?: number; // Epoch ms when player was last made live (add / re-add). Analogous to QueueEntry.queuedAt; decides resurrection vs tombstone.
  history?: {
    playedWith: Record<string, number>;
    playedAgainst: Record<string, number>;
  };
}

/**
 * Max simultaneous avoids per player. 1 = "the one person I won't share a
 * court with" — keeps avoids a remedy, not a field-shaping tool. Raise to
 * allow several; the map already supports multiple entries.
 */
export const MAX_AVOIDS_PER_PLAYER = 1;
/**
 * Max incoming avoids a target can accumulate, as a fraction of the live
 * queue. Prevents a coordinated soft-ban (half the club refusing to share a
 * court with one player). 0.5 = at most half the queue may avoid one target.
 */
export const MAX_INCOMING_AVOID_RATIO = 0.5;

export interface QueueEntry {
  username: string;
  queueType: 'GENERAL' | 'WINNERS' | 'LOSERS';
  enteredAt: number; // Sort-priority value for FIFO ordering (can be 0 = "jump to front"). NOT a creation time.
  createdAt?: number; // Epoch ms when the entry was actually created (used for reset checkpoints).
  updatedAt?: number; // Epoch ms of last change (for per-field LWW)
  deletedAt?: number; // Epoch ms of deletion (tombstone). If present, entry is logically deleted.
  queuedAt?: number; // Epoch ms when the player was last placed into the queue (add / re-queue).
  lockedAt?: number; // Epoch ms when locked out of auto-draft. Absent = unlocked.
  lockUpdatedAt?: number; // Epoch ms of the last lock/unlock write (dedicated LWW token — isolates lock state from other entry changes)
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
  generatedBy?: string; // Username of the admin who generated this match
  editedBy?: string; // Username of the admin who last edited this match
  scoredBy?: string; // Username of the admin who scored this match
  cancelledBy?: string; // Username of the admin who cancelled this match
  matchmakingMode?: string; // Matchmaking mode used at generation time
  generationType?: 'auto' | 'manual'; // Whether match was auto-drafted or manually created
  isEdited?: boolean; // True if match was edited after initial creation
  editedAt?: number; // Epoch ms when match was last edited
  originalMatchup?: string; // Original team pairing before edit, e.g. "A & B -VS- C & D"
  originalTeamA?: string; // Original team A names before edit, e.g. "A & B"
  originalTeamB?: string; // Original team B names before edit, e.g. "C & D"
}

export interface CompletedMatchPlayer {
  username: string;
  name?: string; // firstName + lastName, for display in CSV
  duprId?: string;
  userId?: string; // Directus user ID for junction records
  firstName?: string;
  lastName?: string;
  level?: 1 | 2 | 3;
  rating?: number;
  avatar?: string;
  linkedTo?: string; // Fixed-duo partner at completion — session tag, must be snapshotted so rating replays can exclude duo matches
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
  club: string; // Directus club UUID
  meta?: MatchMeta;
}

export interface ActionLog {
  id: string;
  action: string;
  performedBy: string;
  performedById: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface AppState {
  teamSize: number;
  players: Record<string, Player>; // Dictionary of all players ever registered
  queues: QueueEntry[]; // Players currently waiting to play
  activeMatches: ActiveMatch[]; // Matches currently happening on the court
  completedMatches: CompletedMatch[]; // Persisted completed matches for DUPR export (capped at COMPLETED_MATCHES_CAP)
  completedMatchIds?: string[]; // matchIds of recent completions incl. entries trimmed off completedMatches — keeps their activeMatches tombstones out of the "cancelled" list
  actionLogs?: ActionLog[]; // Admin action logs (capped at ACTION_LOG_CAP, synced)
  actionLogsResetAt?: number; // Epoch ms — action logs at/before this are excluded from admin stat counts

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
  sortBy?:
    | 'matchesPlayed'
    | 'rating'
    | 'winRate'
    | 'wins'
    | 'losses'
    | 'name'
    | 'queueStatus';
  matchType?: 'singles' | 'doubles';
  allStarSortDirection?: 'desc' | 'asc'; // Pro Pick draft direction
  matchesFilterBy?:
    | 'all'
    | 'in-progress'
    | 'waiting'
    | 'cancelled'
    | 'completed'
    | 'edited';
  scoreType?: 'RALLY' | 'SIDEOUT'; // For DUPR CSV export
  duprPlusOnly?: boolean; // DUPR+ session — queue check-in requires PREMIUM_L1 entitlement
  duprOnly?: boolean; // DUPR-only session — queue check-in requires a linked DUPR account
  ttsEnabled?: boolean; // Text-to-speech announcements
  qrContinueScan?: boolean; // Continue QR scanning after each successful add
  completedMatchesResetAt?: number; // Epoch ms — drops completedMatches older than this
  lastExportedAt?: number; // Epoch ms of last export
  settingsUpdatedAt?: number; // Epoch ms of last settings change (for per-field LWW)
  settingsFieldTimestamps?: Record<string, number>; // Per-field epoch ms for granular LWW
  playersResetAt?: number; // Epoch ms — drops players created before this checkpoint
  statsResetAt?: number; // Epoch ms — stat blocks statted before this checkpoint are treated as absent
  queuesResetAt?: number; // Epoch ms — drops queue entries entered before this checkpoint
  matchesResetAt?: number; // Epoch ms — drops matches created before this checkpoint
  lastModified?: number;
  clubId?: string; // Which club this local state belongs to (slug)
  clubUUID?: string; // Directus club UUID
}

/**
 * Single source of truth for cloud-synced setting defaults.
 * Used by: constructor seeding, resetState(), mergeAppState, and ClubPage copy blocks.
 * Adding a new setting = add one entry here; all sync sites pick it up automatically.
 */
export const CLUB_SETTINGS: Record<string, unknown> = {
  availableCourts: 1,
  autoAdvanceMatches: true,
  queueReturnMethod: 'fairness_first',
  autoSortQueue: true,
  queuePriorityMode: 'gamesPlayed',
  matchmakingMode: 'strict_balance',
  sortBy: 'matchesPlayed',
  matchType: 'doubles',
  allStarSortDirection: 'desc',
  matchesFilterBy: 'all',
  scoreType: 'SIDEOUT',
  duprPlusOnly: false,
  duprOnly: false,
  ttsEnabled: true,
  qrContinueScan: true,
  teamSize: 2,
  completedMatchesResetAt: 0,
  lastExportedAt: 0,
  actionLogs: [],
};

// completedMatches rides inside the synced appState blob — every admin write
// serializes it and every client parses it per realtime event. Cap it so
// payload size stays bounded; authoritative history lives in the
// completed_match table. 500 also matches the fetchCompletedMatchKeys limit
// that already bounds DUPR export.
export const COMPLETED_MATCHES_CAP = 500;
// Ids of completions are ~20 bytes each — a generous cap covers tombstones
// (GC'd after 7 days) for even very high-volume clubs.
export const COMPLETED_MATCH_IDS_CAP = 2000;

/**
 * Copy ids of entries present in `before` but dropped from `kept` into
 * state.completedMatchIds (deduped). Used when entries are removed for
 * reasons other than the cap (checkpoint purges) — enforceCompletedCaps
 * handles cap-evicted ids itself.
 */
export function rememberCompletedIds(
  state: { completedMatchIds?: string[] },
  before: CompletedMatch[],
  kept: CompletedMatch[],
) {
  const keptIds = new Set(kept.map((m) => m.matchId));
  const ids = (state.completedMatchIds ??= []);
  const seen = new Set(ids);
  for (const m of before) {
    if (!keptIds.has(m.matchId) && !seen.has(m.matchId)) {
      seen.add(m.matchId);
      ids.push(m.matchId);
    }
  }
}

/**
 * Enforce the completedMatches cap: keep the newest COMPLETED_MATCHES_CAP
 * entries by completedAt (array order preserved), record evicted ids in
 * completedMatchIds, and bound that list too. Mutates state in place;
 * only reassigns the arrays when something actually changes.
 */
export function enforceCompletedCaps(state: {
  completedMatches: CompletedMatch[];
  completedMatchIds?: string[];
}) {
  const list = state.completedMatches;
  if (list && list.length > COMPLETED_MATCHES_CAP) {
    const keepIds = new Set(
      [...list]
        .sort((a, b) => b.completedAt - a.completedAt)
        .slice(0, COMPLETED_MATCHES_CAP)
        .map((m) => m.matchId),
    );
    const ids = (state.completedMatchIds ??= []);
    const seen = new Set(ids);
    for (const m of list) {
      if (!keepIds.has(m.matchId) && !seen.has(m.matchId)) {
        seen.add(m.matchId);
        ids.push(m.matchId);
      }
    }
    state.completedMatches = list.filter((m) => keepIds.has(m.matchId));
  }
  const ids = state.completedMatchIds;
  if (ids && ids.length > COMPLETED_MATCH_IDS_CAP) {
    state.completedMatchIds = ids.slice(-COMPLETED_MATCH_IDS_CAP);
  }
}

export const STORAGE_KEY = 'matchmaking_state';
const PER_CLUB_KEY_PREFIX = 'matchmaking_state_';

// Hard cap on retained action logs. Beyond this, oldest logs are permanently
// dropped (slice in both addActionLog and mergeAppState). Reset-type logs are
// exempt from eviction in mergeAppState to preserve the audit trail.
export const ACTION_LOG_CAP = 200;

// Action types that are exempt from cap eviction in mergeAppState.
export const RESET_LOG_ACTIONS = new Set([
  'reset_all',
  'reset_session',
  'reset_stats',
  'clear_matches',
  'clear_queue',
]);

export function getStorageKey(clubId?: string): string {
  if (clubId) return `${PER_CLUB_KEY_PREFIX}${clubId}`;
  return STORAGE_KEY;
}

// ---------------------------------------------------------------------------
// Reset-checkpoint predicates — the SINGLE rule for "did this entity see a
// write at/after its collection's reset checkpoint". Shared by mergeAppState's
// pre-filters and saveState's local purge so the two can never disagree
// (merge-keeps / saveState-drops flap). Entity stamps beyond the skew
// allowance count as `now`: a fast-clock write is still a write, just not
// "newer than everything". Real skew is minutes, so 5 min is a safe allowance.
// ---------------------------------------------------------------------------

export const ENTITY_STAMP_SKEW_ALLOWANCE_MS = 5 * 60 * 1000;

const clampStampForCheckpoint = (t: number | undefined, now: number): number =>
  t != null && t > now + ENTITY_STAMP_SKEW_ALLOWANCE_MS ? now : (t ?? 0);

/** Latest entity timestamp that counts for the playersResetAt checkpoint. */
export const playerCheckpointTime = (p: Player, now: number): number =>
  Math.max(
    clampStampForCheckpoint(p.createdAt, now),
    clampStampForCheckpoint(p.updatedAt, now),
    clampStampForCheckpoint(p.deletedAt, now),
    clampStampForCheckpoint(p.statsUpdatedAt, now),
    clampStampForCheckpoint(p.linkUpdatedAt, now),
    clampStampForCheckpoint(p.avoidUpdatedAt, now),
  );

/** Latest entity timestamp that counts for the queuesResetAt checkpoint. */
export const queueCheckpointTime = (q: QueueEntry, now: number): number =>
  Math.max(
    clampStampForCheckpoint(q.createdAt, now),
    clampStampForCheckpoint(q.updatedAt, now),
    clampStampForCheckpoint(q.deletedAt, now),
    clampStampForCheckpoint(q.lockUpdatedAt, now),
  );

/** Latest entity timestamp that counts for the matchesResetAt checkpoint. */
export const matchCheckpointTime = (m: ActiveMatch, now: number): number =>
  Math.max(
    clampStampForCheckpoint(m.createdAt, now),
    clampStampForCheckpoint(m.updatedAt, now),
    clampStampForCheckpoint(m.deletedAt, now),
  );

/** Entity timestamp that counts for the completedMatchesResetAt checkpoint. */
export const completedMatchCheckpointTime = (
  m: CompletedMatch,
  now: number,
): number => clampStampForCheckpoint(m.completedAt, now);

// Standalone helper: enforce one-match-per-player on any AppState.
// Losing matches are tombstoned and their players returned to queue.
export function gcTombstones(state: AppState, now: number) {
  // Tombstones are the only durable record that a deletion happened — once
  // they age out, a stale device that never saw the delete can push a live
  // copy that merges back in and resurrects the entity. 30 days keeps the
  // resurrection window small; live entries are never dropped here.
  const TOMBSTONE_RETENTION = 30 * 24 * 60 * 60 * 1000;
  // Assign only when entries were actually dropped — a fresh array with
  // identical content would needlessly invalidate every dependent computed.
  const queues = state.queues.filter(
    (q) => !q.deletedAt || now - q.deletedAt < TOMBSTONE_RETENTION,
  );
  if (queues.length !== state.queues.length) state.queues = queues;
  const matches = state.activeMatches.filter(
    (m) => !m.deletedAt || now - m.deletedAt < TOMBSTONE_RETENTION,
  );
  if (matches.length !== state.activeMatches.length)
    state.activeMatches = matches;
}

export function enforceOneMatchPerPlayerOnState(state: AppState) {
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

// Standalone helper: enforce one-match-per-court on any AppState.
// Losing matches are tombstoned and their players returned to queue.
export function enforceOneMatchPerCourtOnState(state: AppState) {
  const courtToMatches = new Map<number, ActiveMatch[]>();
  state.activeMatches.forEach((m) => {
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
    `[enforceOneMatchPerCourt] Removed ${matchesToRemove.size} conflicting match(es) from courts, returned players to queue`,
  );
}

// Standalone helper: enforce the concurrency cap (availableCourts).
// If there are more in-progress matches than the cap, the newest matches are
// demoted to 'waiting' (court and startedAt cleared). Teams stay intact —
// players are NOT returned to the queue. Returns the list of demoted matchIds
// so callers can notify the admin.
export function enforceConcurrencyLimitOnState(state: AppState): string[] {
  const cap = state.availableCourts ?? 1;

  const inProgress = state.activeMatches
    .filter((m) => !m.deletedAt && m.status === 'in-progress')
    .sort((a, b) => {
      // Oldest startedAt first (longest-running stays)
      const diff = (a.startedAt ?? 0) - (b.startedAt ?? 0);
      if (diff !== 0) return diff;
      return (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
    });

  if (inProgress.length <= cap) return [];

  const toDemote = inProgress.slice(cap);
  const demotedIds: string[] = [];
  const now = Date.now();

  for (const m of toDemote) {
    m.status = 'waiting';
    m.court = undefined;
    delete m.startedAt;
    m.updatedAt = now;
    demotedIds.push(m.matchId);
  }

  // Compact surviving in-progress matches onto slots 1..cap.
  // Keep a survivor's existing court when it's in range and unclaimed —
  // renumbering a live match would make its displayed court diverge
  // from the physical court it's actually being played on.
  const survivors = inProgress.slice(0, cap);
  const claimedCourts = new Set<number>();
  survivors.forEach((m) => {
    if (
      m.court !== undefined &&
      m.court <= cap &&
      !claimedCourts.has(m.court)
    ) {
      claimedCourts.add(m.court);
      return;
    }
    let newSlot = 1;
    while (claimedCourts.has(newSlot)) newSlot++;
    m.court = newSlot;
    claimedCourts.add(newSlot);
    m.updatedAt = now;
  });

  console.log(
    `[enforceConcurrencyLimit] Demoted ${demotedIds.length} match(es) to waiting, cap is ${cap}`,
  );

  return demotedIds;
}

/**
 * ==========================================
 * 2. INDIVIDUAL RATING ALGORITHM
 * ==========================================
 * Zero-sum per-player Elo. A single rating pool is transferred from the
 * losing team to the winning team (so total rating is strictly conserved —
 * no inflation/deflation, ever). The pool is then distributed AMONG each
 * team's players by their individual expectation, so gains/losses still
 * strictly reflect each player's own rating vs the opponents:
 *   - winners: lower-rated partner earns more (underdog credit)
 *   - losers:  higher-rated partner pays more (favorite blame)
 *
 * Constants chosen by backtesting 245 real doubles matches on calibration
 * (calMAE), partner-differentiation, and long-term rating conservation:
 * - K_DOUBLES = 32, K_SINGLES = 36
 * - MARGIN_WEIGHT = 0 (MOV is noise — removed per exp-04-comprehensive.mjs)
 * - AUTOCORR_SCALE = 1000 (538-style correction, tuned for pickleball)
 * High K is safe here precisely because the model is zero-sum: ratings stay
 * calibrated long-term while still separating players (~82% partner diff).
 *
 * Anti-carry tweak: when a player is the weaker of the two partners, their
 * WIN share is reduced as the partner gap grows. This keeps the lower-rated
 * partner from getting a free boost when paired with a much stronger teammate.
 * Losses use a pure underdog blend: the higher-rated partner loses more.
 * A partner ratio cap (MAX_PARTNER_RATIO) prevents extreme partner gaps from
 * creating huge swings. This keeps the ratings calibrated while protecting
 * strong partners. Values chosen from synthetic + real-data backtesting.
 */
const K_DOUBLES = 32;
const K_SINGLES = 36;
const MARGIN_WEIGHT = 0;
const PARTNER_GAP_FACTOR = 0.5;
const LOSS_UNDERDOG_BLEND = 1.0;
const RATING_FLOOR = 100;
// 538-style autocorrelation correction: downweights wins by favourites,
// upweights wins by underdogs. 1000 is tuned for pickleball doubles
// (538's chess-tuned 2200 is too strong). Tuned via exp-04-comprehensive.mjs.
const AUTOCORR_SCALE = 1000;
// Cap the ratio between any two partners' rating changes so huge gaps don't
// create extreme swings. A value of 2.0 means the strong partner can never get
// more than 2x the weak partner's gain/loss.
const MAX_PARTNER_RATIO = 2.0;

/**
 * Distribute an integer `total` across `weights` proportionally, guaranteeing
 * the rounded parts sum EXACTLY to `total` (largest-remainder method). This is
 * what makes the transfer strictly zero-sum.
 */
const allocateInteger = (total: number, weights: number[]): number[] => {
  const sum = weights.reduce((s, w) => s + w, 0);
  const norm =
    sum > 0
      ? weights.map((w) => w / sum)
      : weights.map(() => 1 / weights.length);
  const raw = norm.map((n) => n * total);
  const floors = raw.map((r) => Math.floor(r));
  const remainder = total - floors.reduce((s, f) => s + f, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder; k++) result[order[k % order.length].i] += 1;
  return result;
};

// Prevent huge partner-gaps from creating extreme point swings. If the largest
// weight is more than MAX_PARTNER_RATIO times the smallest, lift the smallest
// weight so the ratio is capped.
const capWeights = (weights: number[], maxRatio: number): number[] => {
  if (weights.length < 2) return weights;
  const max = Math.max(...weights);
  if (max <= 0) return weights;
  const minAllowed = max / maxRatio;
  return weights.map((w) => Math.max(w, minAllowed));
};

export const RatingEngine = {
  calculateShift: (
    winners: Player[],
    losers: Player[],
    scoreW: number,
    scoreL: number,
    applyRatingChange: boolean = true,
  ) => {
    if (!applyRatingChange) {
      const updatedWinners = winners.map((player) => ({
        ...player,
        matchesPlayed: player.matchesPlayed + 1,
        wins: (player.wins || 0) + 1,
        statsUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      }));
      const updatedLosers = losers.map((player) => ({
        ...player,
        matchesPlayed: player.matchesPlayed + 1,
        losses: (player.losses || 0) + 1,
        statsUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      }));
      return { updatedWinners, updatedLosers };
    }

    // Team strengths via arithmetic mean for the rating-update expectation.
    // (Harmonic mean is kept only for matchmaking balance, not rating changes.)
    const ratingW = computeArithmeticMean(winners);
    const ratingL = computeArithmeticMean(losers);

    const margin = Math.abs(scoreW - scoreL);
    const multiplier = 1 + MARGIN_WEIGHT * Math.log(1 + margin);

    const K = winners.length === 1 ? K_SINGLES : K_DOUBLES;

    // Single zero-sum pool, sized by the winning team's expectation
    // (smaller pool when the favorite wins, larger on an upset).
    const expectedW = 1 / (1 + Math.pow(10, (ratingL - ratingW) / 400));

    // 538-style autocorrelation correction: prevents the MOV multiplier from
    // over-rewarding favourites who win big. From the winner's perspective:
    //   A(x) = 1 / (1 + x / scale)  where x = ratingW - ratingL
    // When favourite wins (x > 0): A < 1 → downweight.
    // When underdog wins (x < 0): A > 1 → upweight.
    const ratingDiff = ratingW - ratingL;
    const autoCorrDenom = 1 + ratingDiff / AUTOCORR_SCALE;
    const autoCorr = autoCorrDenom > 0.1 ? 1 / autoCorrDenom : 10;

    const pool = Math.round(K * multiplier * autoCorr * (1 - expectedW));

    // WINS: anti-carry partner-gap penalty. A weaker partner in a large-gap
    // pair gets less credit, so strong players cannot pull up weak players.
    const winnerCredits = winners.map((p, i) => {
      const partner = winners[(i + 1) % winners.length];
      const gap = Math.abs(partner.rating - p.rating);
      const base = 1 - 1 / (1 + Math.pow(10, (ratingL - p.rating) / 400));
      const weaker = p.rating < partner.rating;
      const penalty = weaker
        ? Math.max(0.1, 1 - (PARTNER_GAP_FACTOR * gap) / 400)
        : 1;
      return base * penalty;
    });
    const winnerGains = allocateInteger(
      pool,
      capWeights(winnerCredits, MAX_PARTNER_RATIO),
    );

    // LOSSES: soft underdog blend. Higher-rated partner pays a bit more than the
    // lower-rated partner, but the split is closer to equal than the old pure
    // underdog rule. blend = 0 => equal split; blend = 1 => pure underdog.
    const loserBlames = losers.map((p) => {
      const expectedVsWinners =
        1 / (1 + Math.pow(10, (ratingW - p.rating) / 400));
      return 1 - LOSS_UNDERDOG_BLEND + LOSS_UNDERDOG_BLEND * expectedVsWinners;
    });
    const loserLosses = allocateInteger(
      pool,
      capWeights(loserBlames, MAX_PARTNER_RATIO),
    );

    const updatedWinners = winners.map((player, i) => ({
      ...player,
      rating: Math.max(RATING_FLOOR, player.rating + winnerGains[i]),
      matchesPlayed: player.matchesPlayed + 1,
      wins: (player.wins || 0) + 1,
      ratingUpdatedAt: Date.now(),
      statsUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    }));

    const updatedLosers = losers.map((player, i) => ({
      ...player,
      rating: Math.max(RATING_FLOOR, player.rating - loserLosses[i]),
      matchesPlayed: player.matchesPlayed + 1,
      losses: (player.losses || 0) + 1,
      ratingUpdatedAt: Date.now(),
      statsUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    }));

    return { updatedWinners, updatedLosers };
  },
};

// Pure Harmonic Mean (heavily weights the weakest player)
/**
 * Initial matchmaking seed for a self-declared skill level. Calibrated to the
 * established-player rating distribution (players >= 12 games): beginners land
 * ~p25 (1400), intermediates at the median (~1485), advanced ~p75-p90 (1600).
 * Matchmaking only — leaderboard replay always seeds flat 1450.
 */
export const levelSeedRating = (level: 1 | 2 | 3): number =>
  level === 1 ? 1400 : level === 2 ? 1485 : 1600;

export const computeHarmonicMean = (team: Player[]): number => {
  if (team.length === 0) return 1450;
  const sumReciprocal = team.reduce(
    (sum, p) => sum + 1 / Math.max(1, p.rating || 1450),
    0,
  );
  return team.length / sumReciprocal;
};

// Pure Arithmetic Mean (simple average)
export const computeArithmeticMean = (team: Player[]): number => {
  if (team.length === 0) return 1450;
  return team.reduce((sum, p) => sum + (p.rating || 1450), 0) / team.length;
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
    pinnedPairs?: string[][],
    avoidTeammates?: [string, string][],
  ) => {
    let allMatchups = MatchmakerEngine.getCombinations(players, teamSize);

    // Fixed-duo constraint: each pinned pair must stay on the same team.
    if (pinnedPairs?.length) {
      const onSameTeam = (matchup: { teamA: Player[]; teamB: Player[] }) =>
        pinnedPairs.every((pair) => {
          const inA = pair.every((u) =>
            matchup.teamA.some((p) => p.username === u),
          );
          const inB = pair.every((u) =>
            matchup.teamB.some((p) => p.username === u),
          );
          return inA || inB;
        });
      const constrained = allMatchups.filter(onSameTeam);
      if (constrained.length > 0) allMatchups = constrained;
    }

    // Hard avoid constraint (partner scope): these pairs must NEVER share a
    // team. Unlike pinnedPairs there is no silent fallback — when no matchup
    // satisfies the constraint the caller is told via the empty-evaluated
    // guard below, so unit selection can try a different combination.
    if (avoidTeammates?.length) {
      const onDifferentTeams = (matchup: {
        teamA: Player[];
        teamB: Player[];
      }) =>
        avoidTeammates.every(([a, b]) => {
          const aInA = matchup.teamA.some((p) => p.username === a);
          const bInA = matchup.teamA.some((p) => p.username === b);
          return aInA !== bInA;
        });
      allMatchups = allMatchups.filter(onDifferentTeams);
      if (allMatchups.length === 0) {
        return {
          teamA: [],
          teamB: [],
          expectedDifference: 0,
          infeasible: true,
        };
      }
    }

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
