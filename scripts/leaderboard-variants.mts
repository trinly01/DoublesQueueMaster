/**
 * SCRATCH — empirical ranking-variant comparison on the live Siklab club
 * leaderboard. NOT committed.
 *
 * Fetches the same window the app fetches (club filter + last 30 days,
 * sort -completed_at, limit 1000), mirrors filterCompetitive(false) +
 * toRankedInputs, then runs four ranking variants over the identical
 * match set:
 *
 *   base — computeNetworkScores (imported, bit-identical reference) plus a
 *          local re-implementation used as the engine for the variants.
 *   V2   — same graph; inflow divided by games_i and rescaled by meanGames:
 *          r = (1-λ)p̃ + λ·(Pᵀr)_i/games_i·meanGames, λ=0.8.
 *   V3   — identical algorithm, λ=0.45.
 *   V4   — directed opponent edges: teammate edges symmetric; opponent
 *          credit only loser→winner (loser emits edgeW to EACH winner,
 *          winners emit nothing to opponents); ties fully symmetric.
 *          Row-normalize by actual emitted outSum, λ=0.8.
 *   V5   — two-way complementary margin-weighted opponent edges
 *          (GeM WinnersAndLosersVotePoint / Power-Rank family):
 *          μw = |sA−sB|/(sA+sB); per ordered cross-side pair i→j,
 *          weight = edgeW·(1+μw) when i's side LOST, edgeW·(1−μw)
 *          when i's side WON (complementary, sums to 2·edgeW per
 *          unordered opponent pair). Teammate edges stay edgeW
 *          symmetric. T<=0 or tie → fully symmetric edgeW (status quo).
 *          Row-normalize by actual emitted outSum, λ=0.8.
 *
 * Per variant prints top-20, positions of tracked names, Spearman
 * ρ(scoreRank, gamesRank), and V4/V5 outSum diagnostics. Also prints the
 * μw distribution over usable matches and a fixed-duo inflation check.
 *
 * Run:  npx esbuild scripts/leaderboard-variants.mts --bundle --platform=node --format=esm --outfile=.tmp-analysis/lb-variants.mjs && node .tmp-analysis/lb-variants.mjs
 */
import { computeNetworkScores } from '../src/utils/networkRanking';
import {
  playerIdentityKey,
  type RankedMatchInput,
  type ReplayPlayerInput,
} from '../src/utils/ratingReplay';
import { detectFixedDuos } from '../src/utils/duoStats';

// ---------- fetch (same contract as useLeaderboard.ts:80-91) ----------
const CLUB = '22e52ef0-bf60-4bd1-bea8-ef66193edf35';
const BASE = 'https://api.dinkmatch.club';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  /* env may already be loaded */
}
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) {
  console.error('BOOKING_ADMIN_TOKEN missing from .env');
  process.exit(1);
}

async function api(path: string): Promise<any> {
  for (const auth of [`Bearer ${TOKEN}`, TOKEN as string]) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: auth },
    });
    if (res.status === 401 || res.status === 403) continue;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  }
  throw new Error('auth failed');
}

const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
const path =
  `/items/completed_match?` +
  `filter%5Bclub%5D%5B_eq%5D=${CLUB}` +
  `&filter%5Bcompleted_at%5D%5B_gte%5D=${encodeURIComponent(since)}` +
  `&fields=*` +
  `&sort=-completed_at&limit=1000`;

const fetched = await api(path);
const rawMatches: any[] = fetched.data || [];
console.log(`fetched ${rawMatches.length} completed_match rows (30d window, limit 1000)`);
if (rawMatches.length === 1000) console.log('WARNING: hit limit=1000 — app fetch would truncate identically');

// ---------- mirror filterCompetitive(false) + toRankedInputs ----------
const NON_COMPETITIVE = new Set(['fair_balance', 'variety_first']);
const competitive = rawMatches.filter(
  (m) => !NON_COMPETITIVE.has(m.meta?.matchmakingMode || ''),
);
console.log(`competitive matches after filterCompetitive(false): ${competitive.length}`);

const mapSide = (arr: any[] = []) =>
  arr.map((p) => ({
    userId: p.userId,
    username: p.username,
    name: p.firstName,
    firstName: p.firstName,
    lastName: p.lastName,
    level: p.level,
    rating: p.rating,
    avatar: p.avatar,
    linkedTo: p.linkedTo,
  }));

const inputs: RankedMatchInput[] = competitive.map((m) => ({
  teamAScore: m.team_a_score,
  teamBScore: m.team_b_score,
  matchKey: m.match_key,
  completedAt: m.completed_at,
  matchmakingMode: m.meta?.matchmakingMode,
  teamA: mapSide(m.team_a),
  teamB: mapSide(m.team_b),
}));

// ---------- engine (mirrors computeNetworkScores structure) ----------
const SHRINKAGE_C = 12;
const MAX_ITERS = 500;
const EPSILON = 1e-10;

type EdgeMode = 'base' | 'v4' | 'v5';
type IterMode = 'base' | 'v2' | 'v3' | 'v6' | 'v7';

type MarginStats = {
  ties: number;
  nonPositive: number;
  bad: number;
  samples: number[]; // μw per decisive positive-total usable match
};

type TeammatePairs = Map<string, { games: number; k1: string; k2: string }>;

type Acc = {
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
  credit: Map<string, number>;
};

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

const sideKeys = (team: ReplayPlayerInput[]): Map<string, ReplayPlayerInput> => {
  const out = new Map<string, ReplayPlayerInput>();
  for (const p of team) {
    const key = playerIdentityKey(p);
    if (!out.has(key)) out.set(key, p);
  }
  return out;
};

const accFor = (accs: Map<string, Acc>, key: string, p: ReplayPlayerInput): Acc => {
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
  if (p.username) acc.username = p.username;
  if (p.name) acc.name = p.name;
  if (p.firstName) acc.firstName = p.firstName;
  if (p.lastName) acc.lastName = p.lastName;
  if (p.avatar) acc.avatar = p.avatar;
  if (typeof p.rating === 'number') acc.rating = p.rating;
  return acc;
};

type VariantResult = {
  key: string;
  display: string;
  username: string;
  firstName: string;
  lastName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  networkScore: number;
  rawScore: number;
  ownPerformance: number;
};

function runVariant(
  matches: RankedMatchInput[],
  edgeMode: EdgeMode,
  iterMode: IterMode,
): {
  players: VariantResult[];
  matchesUsed: number;
  iters: number;
  meanGames: number;
  outSumStats: { min: number; max: number; zero: number };
  margin: MarginStats;
  teammatePairs: TeammatePairs;
} {
  const accs = new Map<string, Acc>();
  const margin: MarginStats = { ties: 0, nonPositive: 0, bad: 0, samples: [] };
  const teammatePairs: TeammatePairs = new Map();
  let matchesUsed = 0;

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
    let collision = false;
    for (const k of mapB.keys()) {
      if (mapA.has(k)) {
        collision = true;
        break;
      }
    }
    if (collision) continue;

    const sideA = [...mapA.entries()].map(([key, p]) => ({ key, acc: accFor(accs, key, p) }));
    const sideB = [...mapB.entries()].map(([key, p]) => ({ key, acc: accFor(accs, key, p) }));

    const participants = [...sideA, ...sideB];
    const n = participants.length;
    if (n < 2) continue;
    matchesUsed += 1;
    const edgeW = 1 / (n - 1);

    // μw margin stats + teammate-pair co-occurrence (usable matches only).
    const sA = m.teamAScore;
    const sB = m.teamBScore;
    const T = sA + sB;
    if (!Number.isFinite(T)) margin.bad++;
    else if (T <= 0) margin.nonPositive++;
    else if (sA === sB) margin.ties++;
    else margin.samples.push(Math.abs(sA - sB) / T);
    for (const side of [sideA, sideB] as const) {
      for (let i = 0; i < side.length; i++) {
        for (let j = i + 1; j < side.length; j++) {
          const ka = side[i].key < side[j].key ? side[i].key : side[j].key;
          const kb = side[i].key < side[j].key ? side[j].key : side[i].key;
          const pk = `${ka}|${kb}`;
          const rec = teammatePairs.get(pk);
          if (rec) rec.games++;
          else teammatePairs.set(pk, { games: 1, k1: ka, k2: kb });
        }
      }
    }

    // Outcome + performance per side.
    const outcomes = new Map<string, 'win' | 'loss' | 'tie'>();
    for (const side of [sideA, sideB] as const) {
      const own = side === sideA ? m.teamAScore : m.teamBScore;
      const opp = side === sideA ? m.teamBScore : m.teamAScore;
      const { perf, outcome } = matchPerformance(own, opp);
      for (const { key, acc } of side) {
        acc.games += 1;
        acc.perfSum += perf;
        if (outcome === 'win') acc.wins += 1;
        else if (outcome === 'loss') acc.losses += 1;
        else acc.ties += 1;
        outcomes.set(key, outcome);
      }
    }

    if (edgeMode === 'base') {
      // All ordered pairs i≠j among all participants — symmetric.
      for (const { acc: from } of participants) {
        for (const { key: to } of participants) {
          if (to === from.key) continue;
          from.credit.set(to, (from.credit.get(to) || 0) + edgeW);
        }
      }
    } else {
      // V4/V5: teammate edges symmetric; opponent-edge policy differs.
      const isTie = m.teamAScore === m.teamBScore;
      const aOutcome = outcomes.get(sideA[0].key)!;
      const winners = isTie ? [] : aOutcome === 'win' ? sideA : sideB;
      const losers = isTie ? [] : aOutcome === 'win' ? sideB : sideA;

      // Teammate edges (within each side), both directions.
      for (const side of [sideA, sideB] as const) {
        for (const { acc: from } of side) {
          for (const { key: to } of side) {
            if (to === from.key) continue;
            from.credit.set(to, (from.credit.get(to) || 0) + edgeW);
          }
        }
      }
      if (edgeMode === 'v4') {
        if (isTie) {
          // Fully symmetric opponent edges as baseline.
          for (const { acc: from } of participants) {
            const inA = sideA.some((s) => s.acc === from);
            const opp = inA ? sideB : sideA;
            for (const { key: to } of opp) {
              from.credit.set(to, (from.credit.get(to) || 0) + edgeW);
            }
          }
        } else {
          // Directed: each loser emits edgeW to EACH winner; winners emit
          // nothing to opponents.
          for (const { acc: from } of losers) {
            for (const { key: to } of winners) {
              from.credit.set(to, (from.credit.get(to) || 0) + edgeW);
            }
          }
        }
      } else {
        // V5: complementary margin-weighted opponent edges.
        // μw = |sA−sB|/(sA+sB); loser side emits edgeW·(1+μw), winner
        // side emits edgeW·(1−μw) per ordered cross-side pair — sums to
        // 2·edgeW per unordered opponent pair. T<=0 or tie → symmetric.
        const sAv = m.teamAScore;
        const sBv = m.teamBScore;
        const Tv = sAv + sBv;
        const symmetric = Tv <= 0 || isTie;
        const muw = symmetric ? 0 : Math.min(1, Math.abs(sAv - sBv) / Tv);
        if (symmetric) {
          for (const { acc: from } of participants) {
            const inA = sideA.some((s) => s.acc === from);
            const opp = inA ? sideB : sideA;
            for (const { key: to } of opp) {
              from.credit.set(to, (from.credit.get(to) || 0) + edgeW);
            }
          }
        } else {
          const aLost = sBv > sAv;
          for (const [fromSide, toSide] of [
            [sideA, sideB],
            [sideB, sideA],
          ] as const) {
            const fromLost = fromSide === sideA ? aLost : !aLost;
            const w = edgeW * (fromLost ? 1 + muw : 1 - muw);
            for (const { acc: from } of fromSide) {
              for (const { key: to } of toSide) {
                from.credit.set(to, (from.credit.get(to) || 0) + w);
              }
            }
          }
        }
      }
    }
  }

  const players = [...accs.values()];
  if (players.length === 0)
    return { players: [], matchesUsed, iters: 0, meanGames: 0, outSumStats: { min: 0, max: 0, zero: 0 }, margin, teammatePairs };

  let perfMeanSum = 0;
  for (const p of players) perfMeanSum += p.perfSum / p.games;
  const priorMean = perfMeanSum / players.length;

  const pTilde = new Map<string, number>();
  for (const p of players) {
    pTilde.set(p.key, Math.max(0, (p.perfSum + SHRINKAGE_C * priorMean) / (p.games + SHRINKAGE_C)));
  }

  const outSums = new Map<string, number>();
  for (const p of players) {
    let s = 0;
    for (const w of p.credit.values()) s += w;
    outSums.set(p.key, s);
  }

  const totalGames = players.reduce((s, p) => s + p.games, 0);
  const meanGames = totalGames / players.length;

  // v6: adaptive per-player lambda — λ_i = 0.8·games/(games+12), so
  // low-game players rank ~pure own-performance (no network mass yet)
  // while veterans keep full network weight. Empirical-Bayes style.
  const lambdaOf = (games: number) =>
    (iterMode === 'v6' || iterMode === 'v7')
      ? (0.8 * games) / (games + SHRINKAGE_C)
      : iterMode === 'v3' ? 0.45 : 0.8;
  // v7: also scale the teleport vector into flow units — p̃∈[0,1.25] vs
  // r∈[0,~3]; κ=3 makes own-performance comparable to network inflow so
  // low-game players' scores aren't structurally capped below veterans'.
  const KAPPA = iterMode === 'v7' ? 3 : 1;
  const useGameNorm = iterMode === 'v2';

  const r = new Map<string, number>();
  for (const p of players) r.set(p.key, pTilde.get(p.key) ?? 0);

  let iters = 0;
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    iters = iter + 1;
    const inflow = new Map<string, number>();
    for (const p of players) {
      const outSum = outSums.get(p.key) ?? 0;
      if (outSum <= 0) continue;
      const factor = (r.get(p.key) ?? 0) / outSum;
      for (const [to, w] of p.credit) {
        inflow.set(to, (inflow.get(to) || 0) + w * factor);
      }
    }
    let maxDelta = 0;
    for (const p of players) {
      const pt = pTilde.get(p.key) ?? 0;
      const raw = inflow.get(p.key) || 0;
      const normed = useGameNorm ? (raw / p.games) * meanGames : raw;
      const lam = lambdaOf(p.games);
      const next = (1 - lam) * pt * KAPPA + lam * normed;
      maxDelta = Math.max(maxDelta, Math.abs(next - (r.get(p.key) ?? 0)));
      r.set(p.key, next);
    }
    if (maxDelta < EPSILON) break;
  }

  let rMax = 0;
  for (const p of players) rMax = Math.max(rMax, r.get(p.key) ?? 0);

  const result: VariantResult[] = players.map((p) => {
    const raw = r.get(p.key) ?? 0;
    const pt = pTilde.get(p.key) ?? 0;
    return {
      key: p.key,
      display: p.name || p.firstName || p.username || p.key,
      username: p.username,
      firstName: p.firstName,
      lastName: p.lastName,
      matchesPlayed: p.games,
      wins: p.wins,
      losses: p.losses,
      ties: p.ties,
      networkScore: rMax > 0 ? Math.round((100 * raw) / rMax) : 0,
      rawScore: raw,
      ownPerformance: pt,
    };
  });

  result.sort((a, b) => {
    if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
    if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
    return a.display < b.display ? -1 : a.display > b.display ? 1 : 0;
  });

  const outVals = players.map((p) => outSums.get(p.key) ?? 0);
  const outSumStats = {
    min: Math.min(...outVals),
    max: Math.max(...outVals),
    zero: outVals.filter((v) => v <= 0).length,
  };

  return { players: result, matchesUsed, iters, meanGames, outSumStats, margin, teammatePairs };
}

// ---------- stats helpers ----------
function ranksBy<T>(items: T[], scoreOf: (t: T) => number, desc: boolean): number[] {
  // Average ranks for ties; rank 1 = best (highest score when desc).
  const order = items
    .map((t, i) => ({ t, i, s: scoreOf(t) }))
    .sort((a, b) => (desc ? b.s - a.s || a.i - b.i : a.s - b.s || a.i - b.i));
  const ranks = new Array<number>(items.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].s === order[i].s) j++;
    const avg = (i + 1 + j + 1) / 2; // ranks i+1..j+1 → average
    for (let k = i; k <= j; k++) ranks[order[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

function spearmanRankVsGames(players: VariantResult[]): number {
  const scoreRanks = ranksBy(players, (p) => p.rawScore, true);
  const gameRanks = ranksBy(players, (p) => p.matchesPlayed, false);
  return pearson(scoreRanks, gameRanks);
}

const TRACKED = ['marivic', 'jowinski', 'jeo', 'rands', 'cara'];

function report(name: string, res: ReturnType<typeof runVariant>) {
  console.log(`\n================ ${name} ================`);
  console.log(`players=${res.players.length} matchesUsed=${res.matchesUsed} iters=${res.iters} meanGames=${res.meanGames.toFixed(2)} outSum[min=${res.outSumStats.min.toFixed(3)},max=${res.outSumStats.max.toFixed(3)},zero=${res.outSumStats.zero}]`);
  console.log('rank  name                                   net  rawScore   games  W-L(-T)');
  res.players.slice(0, 20).forEach((p, i) => {
    const wl = `${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ''}`;
    console.log(
      `${String(i + 1).padStart(3)}  ${p.display.padEnd(38)} ${String(p.networkScore).padStart(3)}  ${p.rawScore.toFixed(5)}  ${String(p.matchesPlayed).padStart(5)}  ${wl}`,
    );
  });
  // Tracked players — match on display name, first+last, username.
  for (const t of TRACKED) {
    const hits = res.players
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) =>
        `${p.display} ${p.firstName} ${p.lastName} ${p.username}`.toLowerCase().includes(t),
      );
    if (hits.length === 0) {
      console.log(`  tracked '${t}': NOT FOUND`);
    } else {
      for (const { p, idx } of hits) {
        const wl = `${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ''}`;
        console.log(
          `  tracked '${t}': #${idx + 1} ${p.display} (@${p.username || '?'}) net=${p.networkScore} raw=${p.rawScore.toFixed(5)} g=${p.matchesPlayed} ${wl}`,
        );
      }
    }
  }
  const rho = spearmanRankVsGames(res.players);
  const top20games = res.players.slice(0, 20).reduce((s, p) => s + p.matchesPlayed, 0) / Math.min(20, res.players.length);
  const allGames = res.players.reduce((s, p) => s + p.matchesPlayed, 0) / res.players.length;
  console.log(`  Spearman ρ(scoreRank, gamesRank) = ${rho.toFixed(4)}   top20 meanGames=${top20games.toFixed(1)} vs all=${allGames.toFixed(1)}`);
}

// ---------- baseline cross-check ----------
const ref = computeNetworkScores(inputs);
const refByKey = new Map(ref.map((p) => [p.key, p.rawScore]));
const base = runVariant(inputs, 'base', 'base');
let maxDiff = 0;
for (const p of base.players) {
  const rv = refByKey.get(p.key);
  if (rv !== undefined) maxDiff = Math.max(maxDiff, Math.abs(rv - p.rawScore));
}
console.log(`\nBASE engine vs computeNetworkScores: players=${base.players.length} ref=${ref.length} max|ΔrawScore|=${maxDiff.toExponential(3)}`);

report('BASE (λ=0.8, symmetric edges) — reference', base);
report('V2 (in-degree normalization, λ=0.8)', runVariant(inputs, 'base', 'v2'));
report('V3 (λ=0.45 only)', runVariant(inputs, 'base', 'v3'));
report('V4 (directed loser→winner edges, λ=0.8)', runVariant(inputs, 'v4', 'base'));
const v5 = runVariant(inputs, 'v5', 'base');
report('V5 (complementary margin-weighted opponent edges, λ=0.8)', v5);
report('V6 (V5 edges + adaptive λ_i = 0.8·games/(games+12))', runVariant(inputs, 'v5', 'v6'));
report('V7 (V6 + teleport κ=3)', runVariant(inputs, 'v5', 'v7'));

// ---------- μw distribution on live data ----------
{
  const mg = base.margin;
  const samp = mg.samples.filter(Number.isFinite).sort((a, b) => a - b);
  const n = samp.length;
  const q = (p: number) =>
    n ? samp[Math.min(n - 1, Math.floor(p * n))] : NaN;
  const mean = n ? samp.reduce((a, b) => a + b, 0) / n : NaN;
  const frac = (f: (x: number) => boolean) => (n ? (samp.filter(f).length / n) * 100 : NaN);
  console.log(`\n================ μw = |sA−sB|/(sA+sB) distribution ================`);
  console.log(
    `usable matches=${base.matchesUsed}  decisive(T>0,sA≠sB)=${n}  ties=${mg.ties}  nonPositiveT=${mg.nonPositive}  bad=${mg.bad}`,
  );
  console.log(
    `mean=${mean.toFixed(3)}  median=${q(0.5).toFixed(3)}  p10=${q(0.1).toFixed(3)}  p25=${q(0.25).toFixed(3)}  p75=${q(0.75).toFixed(3)}  p90=${q(0.9).toFixed(3)}`,
  );
  console.log(
    `share μw<0.3: ${frac((x) => x < 0.3).toFixed(1)}%   0.3–0.6: ${frac((x) => x >= 0.3 && x < 0.6).toFixed(1)}%   ≥0.6: ${frac((x) => x >= 0.6).toFixed(1)}%`,
  );
}

// ---------- fixed-duo inflation check ----------
{
  const v5rank = new Map(v5.players.map((p, i) => [p.key, i + 1]));
  const baseRank = new Map(base.players.map((p, i) => [p.key, i + 1]));
  const ptSorted = [...v5.players].sort(
    (a, b) => b.ownPerformance - a.ownPerformance || (a.key < b.key ? -1 : 1),
  );
  const ptRank = new Map(ptSorted.map((p, i) => [p.key, i + 1]));
  const v5ByKey = new Map(v5.players.map((p) => [p.key, p]));
  const userOf = new Map<string, string>();
  for (const p of v5.players) if (p.username) userOf.set(p.key, p.username);

  // linkedTo observations across the competitive window (username space).
  const linkedTargets = new Map<string, Set<string>>();
  for (const m of inputs) {
    for (const p of [...m.teamA, ...m.teamB]) {
      if (p.username && p.linkedTo) {
        let s = linkedTargets.get(p.username);
        if (!s) linkedTargets.set(p.username, (s = new Set()));
        s.add(p.linkedTo);
      }
    }
  }
  const detectedDuos = detectFixedDuos(inputs);

  const pairRows = [...base.teammatePairs.entries()]
    .map(([pk, rec]) => ({ pk, ...rec }))
    .sort((a, b) => b.games - a.games || (a.pk < b.pk ? -1 : 1));

  console.log(`\n================ fixed-duo check (top teammate pairs) ================`);
  console.log(`teammate pairs seen=${pairRows.length}; showing top ${Math.min(12, pairRows.length)}`);
  const wl = (p?: VariantResult) =>
    p ? `${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ''}` : '?';
  for (const rec of pairRows.slice(0, 12)) {
    const p1 = v5ByKey.get(rec.k1);
    const p2 = v5ByKey.get(rec.k2);
    const u1 = userOf.get(rec.k1);
    const u2 = userOf.get(rec.k2);
    const declared = !!(
      u1 &&
      u2 &&
      linkedTargets.get(u1)?.has(u2) &&
      linkedTargets.get(u2)?.has(u1)
    );
    const det = detectedDuos.get(rec.pk);
    const status = declared
      ? 'DECLARED'
      : det
        ? `detected:${det.reason}`
        : '—';
    const mem = (k: string) => {
      const p = v5ByKey.get(k);
      if (!p) return `${k}:?`;
      const d = (ptRank.get(k) ?? 0) - (v5rank.get(k) ?? 0);
      return `${p.display} g${p.matchesPlayed} ${wl(p)} v5=#${v5rank.get(k)} pt=#${ptRank.get(k)} base=#${baseRank.get(k)} dPT=${d >= 0 ? '+' : ''}${d}`;
    };
    const maxD = Math.max(
      (ptRank.get(rec.k1) ?? 0) - (v5rank.get(rec.k1) ?? 0),
      (ptRank.get(rec.k2) ?? 0) - (v5rank.get(rec.k2) ?? 0),
    );
    const flag = maxD >= 15 ? '  <== rank >> performance rank' : '';
    console.log(
      `  ${rec.games}x ${p1?.display ?? rec.k1} + ${p2?.display ?? rec.k2}  [${status}${rec.games >= 8 ? ' ≥8' : ''}]${flag}`,
    );
    console.log(`      ${mem(rec.k1)}`);
    console.log(`      ${mem(rec.k2)}`);
  }
}


// ---------- suppression analysis: ownPerformance vs V5+V6 network rank ----------
{
  const v6 = runVariant(inputs, 'v5', 'v6');
  console.log('\n================ V6 TOP 25 (adaptive lambda) ================');
  v6.players.slice(0, 25).forEach((p, i) => {
    const wl = `${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ''}`;
    console.log(` ${String(i + 1).padStart(3)}  ${p.display.padEnd(38)} net=${p.networkScore}  g=${p.matchesPlayed}  ${wl}  | v5=#${v5.players.findIndex(q => q.key === p.key) + 1}`);
  });
  // key movers: previously-suppressed strong performers
  const movers = ['jeo', 'shirwin', 'atthan', 'sandro', 'juha', 'trin', 'louis', 'obat', 'obal', 'kay tan'];
  for (const t of movers) {
    const hits = v6.players.filter(p =>
      `${p.display} ${p.firstName} ${p.lastName} ${p.username}`.toLowerCase().includes(t));
    for (const p of hits) {
      const i6 = v6.players.indexOf(p) + 1;
      const i5 = v5.players.findIndex(q => q.key === p.key) + 1;
      console.log(`  mover '${t}': v5=#${i5} -> v6=#${i6}  ${p.display} g=${p.matchesPlayed} pt=${p.ownPerformance.toFixed(3)}`);
    }
  }
}

// ---------- suppression analysis: ownPerformance vs V5 network rank ----------
{
  const v5rank = new Map(v5.players.map((p, i) => [p.key, i + 1]));
  const baseRank = new Map(base.players.map((p, i) => [p.key, i + 1]));
  const ptSorted = [...v5.players].sort(
    (a, b) => b.ownPerformance - a.ownPerformance || (a.key < b.key ? -1 : 1),
  );
  const ptRank = new Map(ptSorted.map((p, i) => [p.key, i + 1]));

  // Spearman rho between pTilde rank and V5 rawScore rank (all players)
  const scoreRanks = ranksBy(v5.players, (p) => p.rawScore, true);
  const ptRanksArr = ranksBy(v5.players, (p) => p.ownPerformance, true);
  const rhoPT = pearson(scoreRanks, ptRanksArr);

  console.log('\n================ SUPPRESSION ANALYSIS (pTilde-rank vs V5 network-rank) ================');
  console.log('Spearman rho(V5 scoreRank, pTildeRank) over all players = ' + rhoPT.toFixed(4));

  const rows = v5.players.map((p) => ({
    p,
    v5r: v5rank.get(p.key)!,
    ptr: ptRank.get(p.key)!,
    br: baseRank.get(p.key)!,
    delta: (ptRank.get(p.key) ?? 0) - (v5rank.get(p.key) ?? 0), // + = network UNDER-rates vs performance
  }));
  const wl = (p: VariantResult) => `${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ''}`;

  console.log('\n--- TOP 20 by pure ownPerformance (pTilde) ---');
  ptSorted.slice(0, 20).forEach((p, i) => {
    console.log(` ${String(i + 1).padStart(3)}  ${p.display.padEnd(38)} pt=${p.ownPerformance.toFixed(3)}  g=${p.matchesPlayed}  ${wl(p)}  | v5=#${v5rank.get(p.key)} base=#${baseRank.get(p.key)}`);
  });

  console.log('\n--- TOP 20 by V5 networkScore ---');
  v5.players.slice(0, 20).forEach((p, i) => {
    console.log(` ${String(i + 1).padStart(3)}  ${p.display.padEnd(38)} net=${p.networkScore}  g=${p.matchesPlayed}  ${wl(p)}  | pt=#${ptRank.get(p.key)}`);
  });

  const suppressed = [...rows].sort((a, b) => b.delta - a.delta).slice(0, 15);
  console.log('\n--- MOST SUPPRESSED by network term (high pTilde rank, low network rank) ---');
  for (const r of suppressed) {
    console.log(`  pt=#${r.ptr} -> v5=#${r.v5r} (d=${r.delta >= 0 ? '+' : ''}${r.delta})  ${r.p.display}  pt=${r.p.ownPerformance.toFixed(3)} g=${r.p.matchesPlayed} ${wl(r.p)}`);
  }

  const boosted = [...rows].sort((a, b) => a.delta - b.delta).slice(0, 15);
  console.log('\n--- MOST BOOSTED by network term (low pTilde rank, high network rank) ---');
  for (const r of boosted) {
    console.log(`  pt=#${r.ptr} -> v5=#${r.v5r} (d=${r.delta >= 0 ? '+' : ''}${r.delta})  ${r.p.display}  pt=${r.p.ownPerformance.toFixed(3)} g=${r.p.matchesPlayed} ${wl(r.p)}`);
  }
}
