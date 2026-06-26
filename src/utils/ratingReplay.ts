export type ReplayPlayerInput = {
  username?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  rating?: number;
  avatar?: string;
};

export type ReplayMatchInput = {
  teamAScore: number;
  teamBScore: number;
  teamA: ReplayPlayerInput[];
  teamB: ReplayPlayerInput[];
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

const CONFIG = {
  kSingles: 36,
  kDoubles: 64,
  marginWeight: 0.15,
  partnerGapFactor: 0.5,
  lossUnderdogBlend: 1.0,
  maxPartnerRatio: 2.0,
  ratingFloor: 100,
  teamMetric: 'arithmetic',
  winnerMode: 'antiCarry',
  loserMode: 'softUnderdog',
};

function expected(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function teamRating(players: { rating: number }[]): number {
  if (players.length === 0) return 1500;
  return (
    players.reduce((s, p) => s + (p.rating || 1500), 0) / players.length
  );
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
  const pool = Math.round(K * multiplier * (1 - expectedW));
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
