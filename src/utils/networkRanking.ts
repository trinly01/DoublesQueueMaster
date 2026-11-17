// Network-centrality leaderboard — personalized PageRank over the club's
// match graph. NOT a rating and NOT wins/losses: ranks players by how
// embedded they are in the network of teammates and opponents, weighted
// by those players' performances.
//
//   r = (1−λ)·p̃ + λ·Pᵀr        (power iteration, λ = 0.8)
//   p̃_i = (perfSum_i + C·p̄) / (games_i + C)   shrunk own-performance
//   P_ij = A_ij / Σ_k A_ik                    row-normalized co-play credit
//
// p̃ is deliberately opponent-blind (what you did); Pᵀr is the only
// strength-of-schedule term (who you did it with/against). λ=0.8 keeps
// ~20% own-performance weight even in near-complete graphs where the
// network term degenerates toward the mean. (λ sweep 0.5–0.8 on synthetic
// clubs showed orderings are λ-invariant — it rescales scores, not ranks.)
//
// Known emergent properties of degree-normalized credit flow (verified on
// synthetic graphs — inherent to PageRank, not bugs):
//   - Hub accumulation: the most-connected player tops the board even with
//     a losing record (they ARE the club's network center).
//   - Winless connectors can outrank winners: recurring opponents who
//     everyone faces aggregate inflow from many players.
//   - Closed weak cliques self-inflate: insular groups reinforce each
//     other — ranks within the observed network, not absolute skill.
//   - Leaf dilution: for players with a single connection, "beat a strong
//     opponent" ≈ "beat a weak one" — the strong player's credit diffuses
//     across their larger out-degree. Strength-of-schedule shows up in
//     aggregate, not reliably per-leaf.
//
// Pure functions only — safe inside the leaderboard Web Worker.

import {
  CLUB_RANKING_CONFIG,
  playerIdentityKey,
  type RankedMatchInput,
  type ReplayPlayerInput,
} from './ratingReplay';

export type NetworkRankedPlayer = {
  /** playerIdentityKey — same keyspace as the rating leaderboard. */
  key: string;
  username: string;
  name: string;
  firstName: string;
  lastName: string;
  avatar: string;
  /** Latest match-embedded rating snapshot — display color only, not rank basis. */
  rating: number;
  /** Matches participated, ties included. */
  matchesPlayed: number;
  /** Decisive-match wins only (ties are neither win nor loss). */
  wins: number;
  losses: number;
  ties: number;
  /** 0–100 display score: centrality as a percentage of the top player. */
  networkScore: number;
  /** Fixed-point centrality before display normalization. */
  rawScore: number;
  /** Shrunk own-performance p̃_i — attribution: own-results component. */
  ownPerformance: number;
  /** λ·Σ P_ji·r_j at convergence — attribution: network-inflow component. */
  networkFlow: number;
  /** n/(n+C) shrinkage confidence, same family as rating reliability. */
  reliability: number;
  provisional: boolean;
  gamesToReliable: number;
};

const LAMBDA = 0.8;
// Mirrors ratingReplay's shrinkagePriorWeight — a player needs ~C matches
// before their own-performance term outweighs the club-mean prior.
const SHRINKAGE_C = 12;
const MAX_ITERS = 500;
const EPSILON = 1e-10;

// Outcome-gated margin performance — outcome classes can never overlap;
// margin modulates within class only. A narrow loss can never outscore a
// narrow win (raw score-share had that pathology).
const matchPerformance = (
  ownScore: number,
  oppScore: number,
): { perf: number; outcome: 'win' | 'loss' | 'tie' } => {
  if (ownScore === oppScore) return { perf: 0.5, outcome: 'tie' };
  const total = ownScore + oppScore;
  const mu = total > 0 ? (ownScore - oppScore) / total : 0;
  return ownScore > oppScore
    ? { perf: 1 + 0.25 * mu, outcome: 'win' }
    : { perf: 0.25 * -mu, outcome: 'loss' };
};

type PlayerAcc = {
  key: string;
  username: string;
  name: string;
  firstName: string;
  lastName: string;
  avatar: string;
  rating: number | undefined;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  perfSum: number;
  /** Raw co-participation credit A_ij — row-normalized after all matches. */
  credit: Map<string, number>;
};

const accFor = (
  accs: Map<string, PlayerAcc>,
  key: string,
  p: ReplayPlayerInput,
): PlayerAcc => {
  let acc = accs.get(key);
  if (!acc) {
    acc = {
      key,
      username: '',
      name: '',
      firstName: '',
      lastName: '',
      avatar: '',
      rating: undefined,
      games: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      perfSum: 0,
      credit: new Map(),
    };
    accs.set(key, acc);
  }
  // Latest non-empty display fields win (matches processed chronologically).
  if (p.username) acc.username = p.username;
  if (p.name) acc.name = p.name;
  if (p.firstName) acc.firstName = p.firstName;
  if (p.lastName) acc.lastName = p.lastName;
  if (p.avatar) acc.avatar = p.avatar;
  if (typeof p.rating === 'number') acc.rating = p.rating;
  return acc;
};

/**
 * Resolve a team's identity keys WITHOUT mutating accumulators — skip
 * checks must run before accFor creates entries, or skipped matches would
 * leave phantom players with games=0 (NaN in the prior mean).
 * Dedupe within the side: the same identity listed twice is one node.
 */
const sideKeys = (
  team: ReplayPlayerInput[],
): Map<string, ReplayPlayerInput> => {
  const out = new Map<string, ReplayPlayerInput>();
  for (const p of team) {
    const key = playerIdentityKey(p);
    if (!out.has(key)) out.set(key, p);
  }
  return out;
};

/**
 * Compute network-centrality scores for a club's completed matches.
 * Input is the already-decoded RankedMatchInput[] (toRankedInputs output).
 * Deterministic: matches are re-sorted internally, accumulation uses Maps
 * with stable keys, and the power iteration converges to a unique fixed
 * point regardless of initialization.
 */
export function computeNetworkScores(
  matches: RankedMatchInput[],
): NetworkRankedPlayer[] {
  const accs = new Map<string, PlayerAcc>();

  // Fixed accumulation order — float sums stay bit-identical across runs.
  const ordered = [...matches].sort((a, b) => {
    const ta = a.completedAt || '';
    const tb = b.completedAt || '';
    if (ta !== tb) return ta < tb ? -1 : 1;
    const ka = a.matchKey || '';
    const kb = b.matchKey || '';
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  for (const m of ordered) {
    const mapA = sideKeys(m.teamA);
    const mapB = sideKeys(m.teamB);
    if (mapA.size === 0 || mapB.size === 0) continue;

    // Identity collision across teams (e.g. two guests named "John Smith"
    // merged into one node) — the match can't be attributed, skip it.
    let collision = false;
    for (const k of mapB.keys()) {
      if (mapA.has(k)) {
        collision = true;
        break;
      }
    }
    if (collision) continue;

    // Skip checks passed — now safe to create/update accumulators.
    const sideA = [...mapA.entries()].map(([key, p]) => ({
      key,
      acc: accFor(accs, key, p),
    }));
    const sideB = [...mapB.entries()].map(([key, p]) => ({
      key,
      acc: accFor(accs, key, p),
    }));

    const participants = [...sideA, ...sideB];
    const n = participants.length;
    if (n < 2) continue;
    const edgeW = 1 / (n - 1);

    // Outcome + performance from each side's perspective.
    for (const side of [sideA, sideB] as const) {
      const own = side === sideA ? m.teamAScore : m.teamBScore;
      const opp = side === sideA ? m.teamBScore : m.teamAScore;
      const { perf, outcome } = matchPerformance(own, opp);
      for (const { acc } of side) {
        acc.games += 1;
        acc.perfSum += perf;
        if (outcome === 'win') acc.wins += 1;
        else if (outcome === 'loss') acc.losses += 1;
        else acc.ties += 1;
      }
    }

    // Co-participation credit: every ordered pair (i,j), i≠j, teammate or
    // opponent — symmetric by construction, outcome-independent.
    for (const { acc: from } of participants) {
      for (const { key: to } of participants) {
        if (to === from.key) continue;
        from.credit.set(to, (from.credit.get(to) || 0) + edgeW);
      }
    }
  }

  const players = [...accs.values()];
  if (players.length === 0) return [];

  // Club-mean prior for shrinkage — mean of per-player mean performance.
  let perfMeanSum = 0;
  for (const p of players) perfMeanSum += p.perfSum / p.games;
  const priorMean = perfMeanSum / players.length;

  // p̃_i — shrunk own performance, floored at 0 (formula is nonnegative;
  // clamp guards float noise).
  const pTilde = new Map<string, number>();
  for (const p of players) {
    pTilde.set(
      p.key,
      Math.max(0, (p.perfSum + SHRINKAGE_C * priorMean) / (p.games + SHRINKAGE_C)),
    );
  }

  // Row-normalize credit into P implicitly during iteration:
  // inflow_i = Σ_j (A_ji / outSum_j) · r_j — computed by distributing each
  // r_j across j's out-edges, O(E) per iteration.
  const outSums = new Map<string, number>();
  for (const p of players) {
    let s = 0;
    for (const w of p.credit.values()) s += w;
    outSums.set(p.key, s);
  }

  const r = new Map<string, number>();
  for (const p of players) r.set(p.key, pTilde.get(p.key) ?? 0);

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const inflow = new Map<string, number>();
    for (const p of players) {
      const outSum = outSums.get(p.key) ?? 0;
      if (outSum <= 0) continue; // dangling — teleport covers it
      const factor = (r.get(p.key) ?? 0) / outSum;
      for (const [to, w] of p.credit) {
        inflow.set(to, (inflow.get(to) || 0) + w * factor);
      }
    }
    let maxDelta = 0;
    for (const p of players) {
      const pt = pTilde.get(p.key) ?? 0;
      const next = (1 - LAMBDA) * pt + LAMBDA * (inflow.get(p.key) || 0);
      maxDelta = Math.max(maxDelta, Math.abs(next - (r.get(p.key) ?? 0)));
      r.set(p.key, next);
    }
    if (maxDelta < EPSILON) break;
  }

  // Display normalization: centrality as % of the top player (0–100).
  let rMax = 0;
  for (const p of players) rMax = Math.max(rMax, r.get(p.key) ?? 0);

  const { provisionalThreshold } = CLUB_RANKING_CONFIG;
  const result: NetworkRankedPlayer[] = players.map((p) => {
    const raw = r.get(p.key) ?? 0;
    const pt = pTilde.get(p.key) ?? 0;
    // networkFlow = λ·inflow at convergence = r − (1−λ)·p̃.
    const networkFlow = Math.max(0, raw - (1 - LAMBDA) * pt);
    return {
      key: p.key,
      username: p.username || p.key,
      name: p.name || p.firstName || p.username || p.key,
      firstName: p.firstName,
      lastName: p.lastName,
      avatar: p.avatar,
      rating: p.rating ?? 1450,
      matchesPlayed: p.games,
      wins: p.wins,
      losses: p.losses,
      ties: p.ties,
      networkScore: rMax > 0 ? Math.round((100 * raw) / rMax) : 0,
      rawScore: raw,
      ownPerformance: pt,
      networkFlow,
      reliability: p.games / (p.games + SHRINKAGE_C),
      provisional: p.games < provisionalThreshold,
      gamesToReliable: Math.max(0, provisionalThreshold - p.games),
    };
  });

  // Deterministic final order: centrality desc → matches desc → name asc.
  result.sort((a, b) => {
    if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
    if (b.matchesPlayed !== a.matchesPlayed)
      return b.matchesPlayed - a.matchesPlayed;
    const na = a.name || a.username;
    const nb = b.name || b.username;
    return na < nb ? -1 : na > nb ? 1 : 0;
  });

  return result;
}
