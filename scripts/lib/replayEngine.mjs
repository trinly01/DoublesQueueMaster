/**
 * Shared Elo replay engine — mirrors src/utils/ratingReplay.ts exactly.
 *
 * All tuning scripts import from here so there is one source of truth.
 * The engine is parameterised so experiments can toggle features.
 */

export const DEFAULT_PARAMS = {
  kSingles: 36,
  kDoubles: 32,
  marginWeight: 0,
  partnerGapFactor: 0.5,
  lossUnderdogBlend: 1.0,
  maxPartnerRatio: 2.0,
  ratingFloor: 100,
  // MOV mode: 'log' (current), 'none', 'dominance', 'winnerShare', 'normalized', 'jointAdditive'
  movMode: 'none',
  // Autocorrelation correction (538-style): 0 = off, 1000 = tuned for pickleball
  autocorrScale: 1000,
  // Provisional K schedule: null = off, {highK, threshold, normalK} = on
  provisionalK: null,
  // Recency decay half-life in days: 0 = off
  recencyHalfLifeDays: 0,
};

export function expected(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function teamRating(players) {
  if (players.length === 0) return 1450;
  return players.reduce((s, p) => s + (p.rating || 1450), 0) / players.length;
}

function allocateInteger(total, weights) {
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

function capWeights(weights, maxRatio) {
  if (weights.length < 2 || maxRatio <= 0) return weights;
  const max = Math.max(...weights);
  if (max <= 0) return weights;
  const minAllowed = max / maxRatio;
  return weights.map((w) => Math.max(w, minAllowed));
}

/**
 * Compute the margin-of-victory multiplier.
 */
function movMultiplier(scoreW, scoreL, ratingW, ratingL, params) {
  const margin = Math.abs(scoreW - scoreL);
  const totalPoints = scoreW + scoreL;
  const winningScore = scoreW;

  switch (params.movMode) {
    case 'none':
      return 1;
    case 'dominance':
      // dominance share: margin relative to total points, rescaled to 11
      if (totalPoints === 0) return 1;
      return (
        1 + params.marginWeight * Math.log(1 + (margin / totalPoints) * 11)
      );
    case 'winnerShare':
      // margin relative to winning score, rescaled to 11
      if (winningScore === 0) return 1;
      return (
        1 + params.marginWeight * Math.log(1 + (margin / winningScore) * 11)
      );
    case 'normalized': {
      // Infer target (nearest of 7/11/15/21), normalise margin to 11-pt equivalent
      const targets = [7, 11, 15, 21];
      const target = targets.reduce((best, t) =>
        Math.abs(winningScore - t) < Math.abs(winningScore - best) ? t : best,
      );
      const normalizedMargin = (margin / target) * 11;
      return 1 + params.marginWeight * Math.log(1 + normalizedMargin);
    }
    case 'jointAdditive': {
      // Kovalchik joint additive: add margin term to the pool directly
      // rather than as a multiplier. We return the multiplier as 1 here
      // and handle the additive term in calculateShift.
      return 1;
    }
    case 'log':
    default:
      return 1 + params.marginWeight * Math.log(1 + margin);
  }
}

/**
 * 538-style autocorrelation correction (from winner's perspective).
 * A(x) = 1 / (1 + x / scale)  where x = ratingW - ratingL
 * When favourite wins (x > 0): A < 1 → downweight.
 * When underdog wins (x < 0): A > 1 → upweight.
 */
function autocorrAdjustment(ratingDiff, scale) {
  if (scale <= 0) return 1;
  const denom = 1 + ratingDiff / scale;
  if (denom <= 0.1) return 10; // cap to avoid blowup
  return 1 / denom;
}

export function calculateShift(
  winners,
  losers,
  scoreW,
  scoreL,
  params,
  matchDate,
  playerGameCounts,
) {
  const ratingW = teamRating(winners);
  const ratingL = teamRating(losers);
  const margin = Math.abs(scoreW - scoreL);
  const baseMultiplier = movMultiplier(
    scoreW,
    scoreL,
    ratingW,
    ratingL,
    params,
  );

  // Provisional K: higher K for players with few games
  let K = winners.length === 1 ? params.kSingles : params.kDoubles;
  if (params.provisionalK) {
    const avgGames =
      winners.reduce(
        (s, p) => s + (playerGameCounts?.get(p.username) || 0),
        0,
      ) / winners.length;
    if (avgGames < params.provisionalK.threshold) {
      K = params.provisionalK.highK;
    }
  }

  const expectedW = expected(ratingW, ratingL);

  // Autocorrelation correction
  const ratingDiff = ratingW - ratingL;
  const autoCorr = autocorrAdjustment(ratingDiff, params.autocorrScale);

  let pool;
  if (params.movMode === 'jointAdditive') {
    // Joint additive: pool = K * (1 - expectedW) + marginWeight * margin
    pool = Math.round(
      K * (1 - expectedW) + params.marginWeight * margin * (1 - expectedW),
    );
  } else {
    pool = Math.round(K * baseMultiplier * autoCorr * (1 - expectedW));
  }

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
      ? Math.max(0.1, 1 - (params.partnerGapFactor * gap) / 400)
      : 1;
    return base * penalty;
  });

  const lWeights = losers.map((p) => {
    const e = expected(p.rating, ratingW);
    return 1 - params.lossUnderdogBlend + params.lossUnderdogBlend * e;
  });

  const winnerGains = allocateInteger(
    pool,
    capWeights(wWeights, params.maxPartnerRatio),
  );
  const loserLosses = allocateInteger(
    pool,
    capWeights(lWeights, params.maxPartnerRatio),
  );
  return { winnerGains, loserLosses };
}

/**
 * Identity key — uses userId when available to avoid same-name guest collisions.
 */
export function playerKey(p) {
  if (p.userId) return p.userId;
  if (p.username) return p.username;
  return `guest:${p.firstName || ''}|${p.lastName || ''}|${p.name || ''}`;
}

/**
 * Seed rating from player's snapshot rating, level, or default.
 */
export function seedRating(p, mode = 'snapshot') {
  switch (mode) {
    case 'flat':
      return 1450;
    case 'level':
      if (p.level === 3) return 1550;
      if (p.level === 2) return 1500;
      return 1450;
    case 'snapshot':
    default:
      if (p.rating != null) return p.rating;
      if (p.level === 3) return 1550;
      if (p.level === 2) return 1500;
      return 1450;
  }
}

/**
 * Replay matches with given params and seeding mode.
 * Returns { players, predictions } where predictions is the prequential log.
 *
 * @param {Array} matches - sorted chronologically
 * @param {Object} params - engine params
 * @param {Object} options - { seedMode, includeNonCompetitive, recencyRefDate }
 */
export function replay(matches, params = DEFAULT_PARAMS, options = {}) {
  const {
    seedMode = 'snapshot',
    includeNonCompetitive = false,
    recencyRefDate = null,
  } = options;

  const players = {};
  const gameCounts = new Map(); // username -> games played (for provisional K)
  const predictions = [];

  const hydrate = (arr) =>
    arr.map((p) => {
      const key = playerKey(p);
      if (!players[key]) {
        const init = seedRating(p, seedMode);
        players[key] = {
          username: p.username || key,
          name: p.name || p.firstName || '',
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          rating: init,
          initialRating: init,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          avatar: p.avatar || '',
          lastPlayedDate: null,
        };
      }
      return players[key];
    });

  for (const m of matches) {
    const isNonComp = NON_COMPETITIVE_MODES.has(m.matchmakingMode);
    const affectsRating = !isNonComp || includeNonCompetitive;

    const tA = hydrate(m.teamA);
    const tB = hydrate(m.teamB);
    if (tA.length === 0 || tB.length === 0) continue;

    // Skip ties (shouldn't happen after cleaning, but defensive)
    if (m.teamAScore === m.teamBScore) continue;

    const aWon = m.teamAScore > m.teamBScore;
    const winners = aWon ? tA : tB;
    const losers = aWon ? tB : tA;
    const sW = aWon ? m.teamAScore : m.teamBScore;
    const sL = aWon ? m.teamBScore : m.teamAScore;

    // Prequential prediction: use current ratings BEFORE the update
    const rA = teamRating(tA);
    const rB = teamRating(tB);
    const probA = expected(rA, rB);
    predictions.push({
      matchKey: m.matchKey,
      probA,
      actual: aWon ? 1 : 0,
      club: m.club,
      date: m.date,
      isNonCompetitive: isNonComp,
    });

    // Update game counts (always, even for non-competitive)
    for (const p of [...tA, ...tB]) {
      gameCounts.set(p.username, (gameCounts.get(p.username) || 0) + 1);
      p.lastPlayedDate = m.date;
    }

    if (!affectsRating) {
      // Still count W/L
      winners.forEach((p) => {
        p.matchesPlayed++;
        p.wins++;
      });
      losers.forEach((p) => {
        p.matchesPlayed++;
        p.losses++;
      });
      continue;
    }

    // Recency decay: if half-life is set, decay ratings toward initialRating
    if (params.recencyHalfLifeDays > 0 && recencyRefDate) {
      const refTime = new Date(recencyRefDate).getTime();
      for (const p of Object.values(players)) {
        if (p.lastPlayedDate && p.matchesPlayed > 0) {
          const daysSince =
            (refTime - new Date(p.lastPlayedDate).getTime()) / 86400000;
          if (daysSince > 0) {
            const decay = Math.pow(0.5, daysSince / params.recencyHalfLifeDays);
            p.rating = p.initialRating + (p.rating - p.initialRating) * decay;
          }
        }
      }
    }

    const { winnerGains, loserLosses } = calculateShift(
      winners,
      losers,
      sW,
      sL,
      params,
      m.date,
      gameCounts,
    );

    winners.forEach((p, i) => {
      p.rating = Math.max(params.ratingFloor, p.rating + winnerGains[i]);
      p.matchesPlayed++;
      p.wins++;
    });
    losers.forEach((p, i) => {
      p.rating = Math.max(params.ratingFloor, p.rating - loserLosses[i]);
      p.matchesPlayed++;
      p.losses++;
    });
  }

  return { players, predictions };
}

const NON_COMPETITIVE_MODES = new Set(['variety_first', 'fair_balance']);
