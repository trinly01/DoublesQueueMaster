export type ReplayPlayerInput = {
  username?: string;
  userId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  level?: 1 | 2 | 3;
  rating?: number;
  avatar?: string;
};

export type ReplayMatchInput = {
  teamAScore: number;
  teamBScore: number;
  teamA: ReplayPlayerInput[];
  teamB: ReplayPlayerInput[];
};

export type RankedMatchInput = ReplayMatchInput & {
  matchKey?: string;
  completedAt?: string;
  matchmakingMode?: string;
};

export type ReplayPlayer = {
  username: string;
  name: string;
  firstName: string;
  lastName: string;
  rating: number;
  initialRating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  avatar: string;
};

// Modes that count W/L but don't update ratings (mirror matchmaking.ts:1492-1494).
const NON_COMPETITIVE_MODES = new Set(['variety_first', 'fair_balance']);

const CONFIG = {
  kSingles: 36,
  kDoubles: 64,
  marginWeight: 0.15,
  partnerGapFactor: 0.5,
  lossUnderdogBlend: 1.0,
  maxPartnerRatio: 2.0,
  ratingFloor: 100,
  // 538-style autocorrelation correction scale. 0 = off, 2200 = 538's value.
  // Prevents the MOV multiplier from over-rewarding favourites who win big.
  autocorrScale: 2200,
  // Iterated convergence: number of forward passes for the ranking replay.
  // Set to 1 (single pass) — iteration improves prediction (logLoss) but
  // inflates ratings away from the global live ratings, which are the ground
  // truth players see. Single pass seeds from the snapshot (the real live
  // rating at first appearance), so ratings naturally track the global system.
  // Tuned via scripts/exp-02-seeding.mjs.
  rankingPasses: 1,
  // Bayesian shrinkage: pulls low-game players' ratings toward their seed.
  // shrunk = initialRating + (rating - initialRating) * n / (n + C)
  // C=12 means a player needs ~12 games before their earned rating change is
  // weighted equally with the seed. Prevents 3-game players from outranking
  // 80-game veterans. Tuned via scripts/exp-02-seeding.mjs.
  shrinkagePriorWeight: 12,
};

function expected(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function teamRating(players: { rating: number }[]): number {
  if (players.length === 0) return 1500;
  return players.reduce((s, p) => s + (p.rating || 1500), 0) / players.length;
}

function allocateInteger(total: number, weights: number[]): number[] {
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
}

function capWeights(weights: number[]): number[] {
  const maxRatio = CONFIG.maxPartnerRatio;
  if (weights.length < 2 || maxRatio <= 0) return weights;
  const max = Math.max(...weights);
  if (max <= 0) return weights;
  const minAllowed = max / maxRatio;
  return weights.map((w) => Math.max(w, minAllowed));
}

function calculateShift(
  winners: ReplayPlayer[],
  losers: ReplayPlayer[],
  scoreW: number,
  scoreL: number,
): { winnerGains: number[]; loserLosses: number[] } {
  const ratingW = teamRating(winners);
  const ratingL = teamRating(losers);
  const margin = Math.abs(scoreW - scoreL);
  const multiplier = 1 + CONFIG.marginWeight * Math.log(1 + margin);
  const K = winners.length === 1 ? CONFIG.kSingles : CONFIG.kDoubles;
  const expectedW = expected(ratingW, ratingL);

  // 538-style autocorrelation correction: prevents the MOV multiplier from
  // over-rewarding favourites who win big. From the winner's perspective:
  //   A(x) = 1 / (1 + x / scale)  where x = ratingW - ratingL
  // When favourite wins (x > 0): A < 1 → downweight.
  // When underdog wins (x < 0): A > 1 → upweight.
  const ratingDiff = ratingW - ratingL;
  const autoCorrDenom = 1 + ratingDiff / CONFIG.autocorrScale;
  const autoCorr = autoCorrDenom > 0.1 ? 1 / autoCorrDenom : 10;

  const pool = Math.round(K * multiplier * autoCorr * (1 - expectedW));
  if (pool <= 0) {
    return {
      winnerGains: winners.map(() => 0),
      loserLosses: losers.map(() => 0),
    };
  }

  const wWeights = winners.map((p, i) => {
    const base = 1 - expected(p.rating, ratingL);
    const partner = winners[(i + 1) % winners.length];
    const gap = Math.abs(partner.rating - p.rating);
    const weaker = p.rating < partner.rating;
    const penalty = weaker
      ? Math.max(0.1, 1 - (CONFIG.partnerGapFactor * gap) / 400)
      : 1;
    return base * penalty;
  });

  const lWeights = losers.map((p) => {
    const e = expected(p.rating, ratingW);
    return 1 - CONFIG.lossUnderdogBlend + CONFIG.lossUnderdogBlend * e;
  });

  const winnerGains = allocateInteger(pool, capWeights(wWeights));
  const loserLosses = allocateInteger(pool, capWeights(lWeights));
  return { winnerGains, loserLosses };
}

export function replayMatches(
  matches: ReplayMatchInput[],
): Record<string, ReplayPlayer> {
  const players: Record<string, ReplayPlayer> = {};

  const hydrate = (arr: ReplayPlayerInput[]) =>
    arr.map((p) => {
      const key = p.username || p.name || '';
      if (!key) return null as unknown as ReplayPlayer;
      if (!players[key]) {
        const initialRating = p.rating ?? 1450;
        players[key] = {
          username: key,
          name: p.name || p.firstName || p.username || '',
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          rating: initialRating,
          initialRating,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          avatar: p.avatar || '',
        };
      }
      return players[key];
    });

  for (const m of matches) {
    const tA = hydrate(m.teamA).filter(Boolean);
    const tB = hydrate(m.teamB).filter(Boolean);
    if (tA.length === 0 || tB.length === 0) continue;
    const aWon = m.teamAScore > m.teamBScore;
    const winners = aWon ? tA : tB;
    const losers = aWon ? tB : tA;
    const sW = aWon ? m.teamAScore : m.teamBScore;
    const sL = aWon ? m.teamBScore : m.teamAScore;
    const { winnerGains, loserLosses } = calculateShift(
      winners,
      losers,
      sW,
      sL,
    );

    winners.forEach((p, i) => {
      p.rating = Math.max(CONFIG.ratingFloor, p.rating + winnerGains[i]);
      p.matchesPlayed += 1;
      p.wins += 1;
    });
    losers.forEach((p, i) => {
      p.rating = Math.max(CONFIG.ratingFloor, p.rating - loserLosses[i]);
      p.matchesPlayed += 1;
      p.losses += 1;
    });
  }

  return players;
}

// ---------------------------------------------------------------------------
// Club leaderboard ranking path
//
// replayMatches() above is preserved unchanged (used by PlayerPage). The
// functions below add a separate ranking path for the club leaderboard with
// four correctness fixes:
//   1. Identity key uses userId (not just username/name) so same-named guests
//      don't merge into one player.
//   2. Tied matches are skipped (pickleball requires win-by-2; a tie is
//      corrupt data and would otherwise award Team B a full win).
//   3. Deterministic tiebreaker chain replaces the no-op `score || rating`
//      comparator (score === rating when both are integers).
//   4. Matches are sorted by completedAt then matchKey so Elo (which is
//      order-dependent) produces identical ratings across fetches even when
//      timestamps collide.
//
// Per the prequential backtest (scripts/exp-02-seeding.mjs), iterated
// convergence is the dominant improvement (logLoss 0.6272 → 0.4888 at 15
// passes). The 538-style autocorrelation correction in calculateShift adds
// a further ~0.008. Shrinkage was tested but did NOT improve prediction.
// The reliability/provisional display is purely informational — it does not
// affect ranking order.
// ---------------------------------------------------------------------------

export const CLUB_RANKING_CONFIG = {
  /**
   * Games below this = provisional (pulsing dot, no rank number).
   * Aligned with shrinkagePriorWeight: at this many games, the earned rating
   * change is weighted equally with the seed (n/(n+C) = 0.5 when n=C).
   */
  provisionalThreshold: 12,
};

export type RankedPlayer = ReplayPlayer & {
  /**
   * Confidence 0..1 derived from the shrinkage formula: n/(n+C).
   * At 0 games: 0% (pure seed). At C games: 50%. At 4C games: 80%.
   * This is the actual weight the earned rating carries vs the seed.
   * Based on rated matches only (excludes casual/social).
   */
  reliability: number;
  /** True when rated games < provisionalThreshold. */
  provisional: boolean;
  /** Rated games remaining to reach provisionalThreshold (0 when no longer provisional). */
  gamesToReliable: number;
  /** Number of rated matches (excludes casual/social). Used for shrinkage. */
  ratedMatchesPlayed: number;
};

function playerIdentityKey(p: ReplayPlayerInput): string {
  if (p.userId) return p.userId;
  if (p.username) return p.username;
  return `guest:${p.firstName || ''}|${p.lastName || ''}|${p.name || ''}`;
}

function seedRatingFromPlayer(p: ReplayPlayerInput): number {
  if (p.rating != null) return p.rating;
  if (p.level === 3) return 1550;
  if (p.level === 2) return 1500;
  return 1450;
}

function computeReliability(ratedGames: number): {
  reliability: number;
  provisional: boolean;
  gamesToReliable: number;
} {
  const { provisionalThreshold } = CLUB_RANKING_CONFIG;
  const C = CONFIG.shrinkagePriorWeight;
  // Shrinkage weight: n/(n+C). This is the actual fraction of the rating
  // that comes from earned results vs the seed. Capped at 1.
  // Uses rated games only — casual/social matches don't earn rating.
  const reliability = Math.min(1, ratedGames / (ratedGames + C));
  const provisional = ratedGames < provisionalThreshold;
  const gamesToReliable = Math.max(0, provisionalThreshold - ratedGames);
  return { reliability, provisional, gamesToReliable };
}

/**
 * Single pass of the ranking replay. Used internally by replayMatchesForRanking
 * for iterated convergence.
 *
 * @param matches - sorted chronologically
 * @param seedOverrides - if provided, overrides each player's seed rating
 */
function replayRankingPass(
  matches: RankedMatchInput[],
  seedOverrides?: Map<string, number>,
): Record<string, RankedPlayer> {
  const players: Record<string, RankedPlayer> = {};

  const hydrate = (arr: ReplayPlayerInput[]) =>
    arr.map((p) => {
      const key = playerIdentityKey(p);
      if (!players[key]) {
        const initialRating =
          seedOverrides?.get(key) ?? seedRatingFromPlayer(p);
        const { reliability, provisional, gamesToReliable } =
          computeReliability(0);
        players[key] = {
          username: p.username || key,
          name: p.name || p.firstName || p.username || '',
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          rating: initialRating,
          initialRating,
          matchesPlayed: 0,
          ratedMatchesPlayed: 0,
          wins: 0,
          losses: 0,
          avatar: p.avatar || '',
          reliability,
          provisional,
          gamesToReliable,
        };
      }
      return players[key];
    });

  for (const m of matches) {
    const tA = hydrate(m.teamA).filter(Boolean);
    const tB = hydrate(m.teamB).filter(Boolean);
    if (tA.length === 0 || tB.length === 0) continue;

    // Fix #2: skip tied matches (pickleball requires win-by-2)
    if (m.teamAScore === m.teamBScore) continue;

    const aWon = m.teamAScore > m.teamBScore;
    const winners = aWon ? tA : tB;
    const losers = aWon ? tB : tA;
    const sW = aWon ? m.teamAScore : m.teamBScore;
    const sL = aWon ? m.teamBScore : m.teamAScore;

    // Mirror matchmaking.ts:1492-1494 — casual/social modes count W/L
    // but don't update ratings. Prevents leaderboard ratings from
    // diverging from live ratings on unrated matches.
    const isNonCompetitive = NON_COMPETITIVE_MODES.has(m.matchmakingMode || '');
    if (isNonCompetitive) {
      // Count W/L but don't update ratings or ratedMatchesPlayed.
      // Reliability/provisional are based on rated games only.
      winners.forEach((p) => {
        p.matchesPlayed += 1;
        p.wins += 1;
        const r = computeReliability(p.ratedMatchesPlayed);
        p.reliability = r.reliability;
        p.provisional = r.provisional;
        p.gamesToReliable = r.gamesToReliable;
      });
      losers.forEach((p) => {
        p.matchesPlayed += 1;
        p.losses += 1;
        const r = computeReliability(p.ratedMatchesPlayed);
        p.reliability = r.reliability;
        p.provisional = r.provisional;
        p.gamesToReliable = r.gamesToReliable;
      });
      continue;
    }

    const { winnerGains, loserLosses } = calculateShift(
      winners,
      losers,
      sW,
      sL,
    );

    winners.forEach((p, i) => {
      p.rating = Math.max(CONFIG.ratingFloor, p.rating + winnerGains[i]);
      p.matchesPlayed += 1;
      p.ratedMatchesPlayed += 1;
      p.wins += 1;
      const r = computeReliability(p.ratedMatchesPlayed);
      p.reliability = r.reliability;
      p.provisional = r.provisional;
      p.gamesToReliable = r.gamesToReliable;
    });
    losers.forEach((p, i) => {
      p.rating = Math.max(CONFIG.ratingFloor, p.rating - loserLosses[i]);
      p.matchesPlayed += 1;
      p.ratedMatchesPlayed += 1;
      p.losses += 1;
      const r = computeReliability(p.ratedMatchesPlayed);
      p.reliability = r.reliability;
      p.provisional = r.provisional;
      p.gamesToReliable = r.gamesToReliable;
    });
  }

  return players;
}

/**
 * Replay matches for club leaderboard ranking with iterated convergence
 * and Bayesian shrinkage.
 *
 * Same Elo engine as replayMatches(), but with the four correctness fixes
 * listed above PLUS:
 *
 * 1. Iterated convergence (3 passes): feeds final ratings back as seed
 *    ratings for the next pass, removing the arbitrary seed bias from the
 *    500-match window boundary. 3 passes gets the seed-bias removal without
 *    spreading ratings unreasonably (15+ passes pushes 9-game undefeated
 *    players to 2400+).
 *
 * 2. Bayesian shrinkage (C=8): after iteration, pulls each player's rating
 *    toward their seed by factor n/(n+C). Prevents low-game players from
 *    outranking established veterans. A 3-game player's rating change is
 *    weighted 3/11 ≈ 27% of the raw Elo movement.
 *
 * 3. 538-style autocorrelation correction in calculateShift: downweights
 *    wins by favourites, upweights wins by underdogs.
 *
 * Returns RankedPlayer entries with reliability metadata. The `rating`
 * field is the shrunk rating (what gets displayed and ranked).
 */
export function replayMatchesForRanking(
  matches: RankedMatchInput[],
): Record<string, RankedPlayer> {
  // Fix #4: deterministic sort by completedAt then matchKey
  const sorted = [...matches].sort((a, b) => {
    const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    if (ta !== tb) return ta - tb;
    const ka = a.matchKey || '';
    const kb = b.matchKey || '';
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  // Iterated convergence: repeat forward passes, feeding final ratings
  // back as seeds.
  let result = replayRankingPass(sorted);
  for (let pass = 1; pass < CONFIG.rankingPasses; pass++) {
    const seedOverrides = new Map<string, number>();
    for (const [key, p] of Object.entries(result)) {
      seedOverrides.set(key, p.rating);
    }
    result = replayRankingPass(sorted, seedOverrides);
  }

  // Apply Bayesian shrinkage: pull ratings toward seed by n/(n+C).
  // This tempers low-game players without erasing established players.
  // Uses rated matches only — casual/social matches don't earn rating.
  const C = CONFIG.shrinkagePriorWeight;
  for (const p of Object.values(result)) {
    const n = p.ratedMatchesPlayed;
    if (n > 0 && C > 0) {
      const shrunk =
        p.initialRating + (p.rating - p.initialRating) * (n / (n + C));
      p.rating = Math.round(shrunk);
    }
  }

  return result;
}

/**
 * Sort players for the club leaderboard.
 *
 * Fix #3: deterministic tiebreaker chain (the old `score || rating` was a
 * no-op because score === rating for integer Elo).
 * Chain: rating desc → games desc → wins desc → winRate desc → username asc.
 */
export function rankClubPlayers(
  players: Record<string, RankedPlayer>,
): RankedPlayer[] {
  return Object.values(players).sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.matchesPlayed !== a.matchesPlayed)
      return b.matchesPlayed - a.matchesPlayed;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const wrA = a.matchesPlayed > 0 ? a.wins / a.matchesPlayed : 0;
    const wrB = b.matchesPlayed > 0 ? b.wins / b.matchesPlayed : 0;
    if (wrB !== wrA) return wrB - wrA;
    return a.username < b.username ? -1 : a.username > b.username ? 1 : 0;
  });
}
