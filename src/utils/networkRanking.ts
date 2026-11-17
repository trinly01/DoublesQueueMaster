// Network-centrality leaderboard — personalized PageRank over the club's
// match graph. NOT a rating and NOT wins/losses: ranks players by how
// embedded they are in the network of teammates and opponents, weighted
// by those players' performances.
//
//   r_i = (1−λ_i)·p̃_i + λ_i·(Pᵀr)_i   (power iteration)
//   λ_i = 0.8·games_i/(games_i+C)   adaptive — small samples lean on p̃
//   p̃_i = (perfSum_i + C·p̄) / (games_i + C)   shrunk own-performance
//   P_ij = A_ij / Σ_k A_ik                    row-normalized co-play credit
//
// p̃ is deliberately opponent-blind (what you did); Pᵀr is the only
// strength-of-schedule term (who you did it with/against). λ_i adapts to
// sample size: a 3-game player's rank is mostly their own performance —
// they have no network mass yet — while a 60-game veteran approaches full
// network weight. Verified on live data: lifts small-sample strong
// performers without disturbing the established top board.
//
// Opponent edges are outcome-directed and margin-weighted (GeM /
// Power-Rank family): for each cross-side pair, the loser→winner edge
// carries edgeW·(1+μw) and winner→loser carries edgeW·(1−μw), where
// μw = |sA−sB|/(sA+sB) is the margin share. Close games approach the
// symmetric co-play graph; blowouts approach one-way credit. Teammate
// edges stay symmetric. This is what makes "who you beat and by how
// much" the network signal instead of raw co-presence volume — without
// it, symmetric edges make the stationary distribution proportional to
// games played (π ∝ degree), collapsing the board to an activity list.
//
// Known emergent properties (inherent to centrality, not bugs):
//   - Hub accumulation: the most-connected player tends to top the board.
//   - Closed weak cliques partially self-inflate: insular groups still
//     reinforce each other, dampened by two-way opponent edges.
//   - Leaf dilution: "beat a strong opponent" ≈ "beat a weak one" for
//     players with a single connection — SoS shows up in aggregate.
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

// Adaptive damping: λ_i = LAMBDA·games/(games+C). A player's network term
// can only accumulate from matches they played, so few-game players get
// mostly own-performance weight (their p̃ is the best available evidence)
// while veterans approach full network weight. Empirical-Bayes style —
// same C as the p̃ shrinkage. Verified on live club data: lifts
// small-sample strong performers without disturbing the top board.
const lambdaFor = (games: number): number =>
  (LAMBDA * games) / (games + SHRINKAGE_C);

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
  /** Outcome-directed credit A_ij — row-normalized after all matches. */
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
      side: 'A' as const,
      acc: accFor(accs, key, p),
    }));
    const sideB = [...mapB.entries()].map(([key, p]) => ({
      key,
      side: 'B' as const,
      acc: accFor(accs, key, p),
    }));

    const participants = [...sideA, ...sideB];
    const n = participants.length;
    if (n < 2) continue;
    const edgeW = 1 / (n - 1);

    // Outcome + performance from each side's perspective — computed once;
    // the directed edge weights below reuse the same outcomes.
    const sideOut = {
      A: matchPerformance(m.teamAScore, m.teamBScore),
      B: matchPerformance(m.teamBScore, m.teamAScore),
    };
    const sides = [
      { tag: 'A' as const, members: sideA },
      { tag: 'B' as const, members: sideB },
    ];
    for (const { tag, members } of sides) {
      const { perf, outcome } = sideOut[tag];
      for (const { acc } of members) {
        acc.games += 1;
        acc.perfSum += perf;
        if (outcome === 'win') acc.wins += 1;
        else if (outcome === 'loss') acc.losses += 1;
        else acc.ties += 1;
      }
    }

    // Co-participation credit — teammate edges stay symmetric; opponent
    // edges are outcome-directed with complementary margin weights (GeM /
    // Power-Rank family): each cross-side pair emits edgeW·(1+μw) on the
    // loser→winner direction and edgeW·(1−μw) on winner→loser, conserving
    // 2·edgeW per unordered pair. Ties and μw→0 reduce to the old
    // symmetric graph; blowouts approach one-way credit.
    const totalScore = m.teamAScore + m.teamBScore;
    const muW =
      totalScore > 0 && m.teamAScore !== m.teamBScore
        ? Math.min(1, Math.abs(m.teamAScore - m.teamBScore) / totalScore)
        : 0;
    const wUp = edgeW * (1 + muW);
    const wDown = edgeW * (1 - muW);
    const oppW = {
      A:
        sideOut.A.outcome === 'loss'
          ? wUp
          : sideOut.A.outcome === 'win'
            ? wDown
            : edgeW,
      B:
        sideOut.B.outcome === 'loss'
          ? wUp
          : sideOut.B.outcome === 'win'
            ? wDown
            : edgeW,
    };
    for (const from of participants) {
      for (const to of participants) {
        if (to.key === from.key) continue;
        const w = from.side === to.side ? edgeW : oppW[from.side];
        if (w > 0) {
          from.acc.credit.set(
            to.key,
            (from.acc.credit.get(to.key) || 0) + w,
          );
        }
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
      const lam = lambdaFor(p.games);
      const next = (1 - lam) * pt + lam * (inflow.get(p.key) || 0);
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
    // networkFlow = λ_i·inflow at convergence = r − (1−λ_i)·p̃.
    const networkFlow = Math.max(
      0,
      raw - (1 - lambdaFor(p.games)) * pt,
    );
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
