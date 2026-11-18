/**
 * SCRATCH — V8 rating-aware network ranking evaluation. NOT committed.
 *
 * Dataset: live all-matches fetch (club 22e52ef0…, last 30d, limit 1000) —
 * the includeNonCompetitive=true set that matched the user's screenshot.
 *
 * BASE = production v6: V5 directed margin-weighted opponent edges +
 * adaptive λ_i = 0.8·g/(g+12) + shrunk p̃ teleport.
 *
 * ADD A — rating-aware teleport prior:
 *   q_i = priorMean + S·(E_i − 0.5), E_i = 1/(1+10^((r̄−rating_i)/400)),
 *   S=1.0, clamp q_i∈[0,1.3]; unrated → q_i=priorMean.
 *   π_i = (perfSum_i + C·q_i)/(g_i+C), C=12  (replaces C·priorMean pseudo-count).
 *   Sources: (a) latest snapshot, (b) mean snapshot, (c) replayed rating.
 * ADD B — rating-surprise opponent edges (per-match embedded ratings):
 *   û = clamp((r_source − r_target)/800, −1, 1), missing → 0, κ=0.4.
 *   Every directed opponent edge weight = V5 base · (1+κ·û).
 *   (Convention: ties/T≤0 keep symmetric edgeW base, still ×(1+κ·û) per
 *   direction — the μw=0 special case of the same formula.)
 *
 * Variants: V8a=A(latest)+B, V8b=A(mean)+B, V8c=A(replay)+B, V8d=B only.
 * V6 recomputed in-script as baseline for rank-move deltas.
 *
 * Run: npx esbuild scripts/lb-v8.mts --bundle --platform=node --format=esm --outfile=.tmp-analysis/lb-v8.mjs && node .tmp-analysis/lb-v8.mjs | tee .tmp-analysis/lb-v8-out.txt
 */
import {
  playerIdentityKey,
  replayMatchesForRanking,
  type RankedMatchInput,
  type ReplayPlayerInput,
} from '../src/utils/ratingReplay';

const CLUB = '22e52ef0-bf60-4bd1-bea8-ef66193edf35';
const BASE = 'https://api.dinkmatch.club';
const SHRINKAGE_C = 12;
const MAX_ITERS = 500;
const EPSILON = 1e-10;
const KAPPA = 0.4;
const S_SCALE = 1.0;

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch { /* already loaded */ }
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) { console.error('BOOKING_ADMIN_TOKEN missing'); process.exit(1); }

async function api(path: string): Promise<any> {
  for (const auth of [`Bearer ${TOKEN}`, TOKEN as string]) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: auth } });
    if (res.status === 401 || res.status === 403) continue;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  }
  throw new Error('auth failed');
}

const filter = {
  _and: [
    { club: { _eq: CLUB } },
    { completed_at: { _gte: '$NOW(-30 days)' } },
  ],
};
const url =
  `/items/completed_match?filter=${encodeURIComponent(JSON.stringify(filter))}` +
  `&sort=-completed_at&limit=1000` +
  `&fields=${encodeURIComponent('*,players.directus_users_id.*')}`;
const fetched = await api(url);
const rawMatches: any[] = fetched.data || [];
console.log(`fetched ${rawMatches.length} completed_match rows (all modes — includeNonCompetitive=true dataset)`);

// ---------- toRankedInputs mirror (all matches, no competitive filter) ----------
const mapSide = (arr: any[] = []) =>
  (arr || []).map((p) => ({
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
const inputs: RankedMatchInput[] = rawMatches.map((m) => ({
  teamAScore: m.team_a_score,
  teamBScore: m.team_b_score,
  matchKey: m.match_key,
  completedAt: m.completed_at,
  matchmakingMode: m.meta?.matchmakingMode,
  teamA: mapSide(m.team_a),
  teamB: mapSide(m.team_b),
}));

// ---------- rating aggregates per identity key ----------
// Chrono order for "latest" semantics.
const orderedForRatings = [...inputs].sort((a, b) => {
  const ta = a.completedAt || '';
  const tb = b.completedAt || '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  const ka = a.matchKey || '';
  const kb = b.matchKey || '';
  return ka < kb ? -1 : ka > kb ? 1 : 0;
});
type RatingAgg = { vals: number[]; latest?: number };
const ratingAgg = new Map<string, RatingAgg>();
for (const m of orderedForRatings) {
  const seen = new Set<string>();
  for (const p of [...m.teamA, ...m.teamB]) {
    const key = playerIdentityKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    let rec = ratingAgg.get(key);
    if (!rec) ratingAgg.set(key, (rec = { vals: [] }));
    if (typeof p.rating === 'number' && Number.isFinite(p.rating)) {
      rec.vals.push(p.rating);
      rec.latest = p.rating; // chrono order → last write wins = most recent
    }
  }
}

// replayed ratings (source c)
let replayed: Record<string, { rating: number }> = {};
let replayOk = true;
try {
  replayed = replayMatchesForRanking(inputs, true) as Record<string, { rating: number }>;
  console.log(`replayMatchesForRanking: ${Object.keys(replayed).length} players`);
} catch (e) {
  replayOk = false;
  console.log(`replayMatchesForRanking FAILED: ${(e as Error).message} — proceeding with sources (a)/(b) only`);
}

// ---------- engine ----------
type Acc = {
  key: string; username: string; name: string; firstName: string; lastName: string;
  games: number; wins: number; losses: number; ties: number;
  perfSum: number; credit: Map<string, number>;
};
type SideEntry = { key: string; acc: Acc; rating?: number };

const matchPerformance = (own: number, opp: number) => {
  if (own === opp) return { perf: 0.5, outcome: 'tie' as const };
  const total = own + opp;
  const mu = total > 0 ? (own - opp) / total : 0;
  return own > opp
    ? { perf: 1 + 0.25 * mu, outcome: 'win' as const }
    : { perf: 0.25 * -mu, outcome: 'loss' as const };
};
const sideKeys = (team: ReplayPlayerInput[]) => {
  const out = new Map<string, ReplayPlayerInput>();
  for (const p of team) {
    const k = playerIdentityKey(p);
    if (!out.has(k)) out.set(k, p);
  }
  return out;
};

function runVariant(
  matches: RankedMatchInput[],
  opts: {
    surpriseEdges: boolean;
    priorQ: Map<string, number> | null;
    lambdaCap?: number;      // default 0.8 — V9a tests 0.6
    flowGamesNorm?: boolean; // V9b: inflow × meanGames/games (per-game SoS)
    flowPerGameK?: number;   // V10: inflow/games × K — per-game endorsement, volume-free
    relSoSOmega?: number;    // V12: score = prior · relSoS^ω (designer formula)
    relSoSCF?: number;       // V12b: relSoS shrinkage constant (default 12)
  },
) {
  const accs = new Map<string, Acc>();
  const accFor = (key: string, p: ReplayPlayerInput): Acc => {
    let a = accs.get(key);
    if (!a) {
      a = { key, username: '', name: '', firstName: '', lastName: '',
        games: 0, wins: 0, losses: 0, ties: 0, perfSum: 0, credit: new Map() };
      accs.set(key, a);
    }
    if (p.username) a.username = p.username;
    if (p.name) a.name = p.name;
    if (p.firstName) a.firstName = p.firstName;
    if (p.lastName) a.lastName = p.lastName;
    return a;
  };
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
    for (const k of mapB.keys()) if (mapA.has(k)) { collision = true; break; }
    if (collision) continue;
    const sideA: SideEntry[] = [...mapA.entries()].map(([key, p]) => ({
      key, acc: accFor(key, p),
      rating: typeof p.rating === 'number' ? p.rating : undefined,
    }));
    const sideB: SideEntry[] = [...mapB.entries()].map(([key, p]) => ({
      key, acc: accFor(key, p),
      rating: typeof p.rating === 'number' ? p.rating : undefined,
    }));
    const participants = [...sideA, ...sideB];
    const n = participants.length;
    if (n < 2) continue;
    matchesUsed++;
    const edgeW = 1 / (n - 1);

    const sideOut = {
      A: matchPerformance(m.teamAScore, m.teamBScore),
      B: matchPerformance(m.teamBScore, m.teamAScore),
    };
    for (const [tag, members] of [['A', sideA], ['B', sideB]] as const) {
      const { perf, outcome } = sideOut[tag];
      for (const { acc } of members) {
        acc.games += 1;
        acc.perfSum += perf;
        if (outcome === 'win') acc.wins += 1;
        else if (outcome === 'loss') acc.losses += 1;
        else acc.ties += 1;
      }
    }

    const totalScore = m.teamAScore + m.teamBScore;
    const muW =
      totalScore > 0 && m.teamAScore !== m.teamBScore
        ? Math.min(1, Math.abs(m.teamAScore - m.teamBScore) / totalScore)
        : 0;
    const wUp = edgeW * (1 + muW);
    const wDown = edgeW * (1 - muW);
    const oppW = {
      A: sideOut.A.outcome === 'loss' ? wUp : sideOut.A.outcome === 'win' ? wDown : edgeW,
      B: sideOut.B.outcome === 'loss' ? wUp : sideOut.B.outcome === 'win' ? wDown : edgeW,
    };
    for (const from of participants) {
      for (const to of participants) {
        if (to.key === from.key) continue;
        let w = from === sideA[0] || sideA.includes(from as SideEntry)
          ? (sideB.includes(to as SideEntry) ? oppW.A : edgeW)
          : (sideA.includes(to as SideEntry) ? oppW.B : edgeW);
        // ^ same-side → edgeW; cross-side → oppW[fromSide]
        if (opts.surpriseEdges && w > 0) {
          // ADD B: û from THIS match's embedded ratings, source→target.
          const rs = from.rating;
          const rt = to.rating;
          const u =
            typeof rs === 'number' && typeof rt === 'number'
              ? Math.max(-1, Math.min(1, (rs - rt) / 800))
              : 0;
          w = w * (1 + KAPPA * u);
        }
        if (w > 0) from.acc.credit.set(to.key, (from.acc.credit.get(to.key) || 0) + w);
      }
    }
  }

  const players = [...accs.values()];
  if (players.length === 0) return { players: [], matchesUsed, iters: 0, priorMean: 0 };

  let perfMeanSum = 0;
  for (const p of players) perfMeanSum += p.perfSum / p.games;
  const priorMean = perfMeanSum / players.length;

  const pTilde = new Map<string, number>();
  const prior = new Map<string, number>();
  for (const p of players) {
    const pt = Math.max(0, (p.perfSum + SHRINKAGE_C * priorMean) / (p.games + SHRINKAGE_C));
    pTilde.set(p.key, pt);
    // ADD A: π_i = (perfSum + C·q_i)/(g+C); unrated q=priorMean → = p̃.
    const q = opts.priorQ?.get(p.key) ?? priorMean;
    prior.set(p.key, (p.perfSum + SHRINKAGE_C * q) / (p.games + SHRINKAGE_C));
  }

  const outSums = new Map<string, number>();
  for (const p of players) {
    let s = 0;
    for (const w of p.credit.values()) s += w;
    outSums.set(p.key, s);
  }
  const r = new Map<string, number>();
  for (const p of players) r.set(p.key, prior.get(p.key) ?? 0);

  const meanG = players.reduce((sm, pp) => sm + pp.games, 0) / players.length;
  const lastRelSoS = new Map<string, number>();
  let iters = 0, converged = false;
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    iters = iter + 1;
    const inflow = new Map<string, number>();
    for (const p of players) {
      const os = outSums.get(p.key) ?? 0;
      if (os <= 0) continue;
      const f = (r.get(p.key) ?? 0) / os;
      for (const [to, w] of p.credit) inflow.set(to, (inflow.get(to) || 0) + w * f);
    }
    let maxDelta = 0;
    if (opts.relSoSOmega !== undefined) {
      // V12 designer formula: score = prior · relSoS^ω
      // relSoS = shrunk per-game credit rate / club mean per-game credit rate
      let sumInfl = 0, sumG = 0;
      for (const p of players) { sumInfl += inflow.get(p.key) || 0; sumG += p.games; }
      const phiBar = sumG > 0 ? sumInfl / sumG : 0;
      const CF = opts.relSoSCF ?? 12;
      for (const p of players) {
        const infl = inflow.get(p.key) || 0;
        const phiHat = (infl + CF * phiBar) / (p.games + CF);
        const relSoS = phiBar > 1e-12 ? phiHat / phiBar : 1;
        lastRelSoS.set(p.key, relSoS);
        const next = (prior.get(p.key) ?? 0) * Math.pow(Math.max(0.05, relSoS), opts.relSoSOmega);
        maxDelta = Math.max(maxDelta, Math.abs(next - (r.get(p.key) ?? 0)));
        r.set(p.key, next);
      }
    } else {
      const lamCap = opts.lambdaCap ?? 0.8;
      for (const p of players) {
        const lam = (lamCap * p.games) / (p.games + SHRINKAGE_C);
        let infl = inflow.get(p.key) || 0;
        if (opts.flowPerGameK) infl = (infl / Math.max(1, p.games)) * opts.flowPerGameK;
        else if (opts.flowGamesNorm) infl = infl * (meanG / Math.max(1, p.games));
        const next = (1 - lam) * (prior.get(p.key) ?? 0) + lam * infl;
        maxDelta = Math.max(maxDelta, Math.abs(next - (r.get(p.key) ?? 0)));
        r.set(p.key, next);
      }
    }
    if (maxDelta < EPSILON) { converged = true; break; }
  }

  let rMax = 0;
  for (const p of players) rMax = Math.max(rMax, r.get(p.key) ?? 0);
  const result = players.map((p) => {
    const raw = r.get(p.key) ?? 0;
    const pt = pTilde.get(p.key) ?? 0;
    const lam = ((opts.lambdaCap ?? 0.8) * p.games) / (p.games + SHRINKAGE_C);
    return {
      key: p.key,
      display: p.name || p.firstName || p.username || p.key,
      username: p.username,
      matchesPlayed: p.games,
      wins: p.wins, losses: p.losses, ties: p.ties,
      networkScore: rMax > 0 ? Math.round((100 * raw) / rMax) : 0,
      rawScore: raw,
      ownPerformance: pt,
      priorScore: prior.get(p.key) ?? 0,
      relSoS: lastRelSoS.get(p.key),
      networkFlow: opts.relSoSOmega !== undefined
        ? Math.max(0, raw - (prior.get(p.key) ?? 0))
        : Math.max(0, raw - (1 - lam) * pt),
    };
  });
  result.sort((a, b) => {
    if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
    if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
    return a.display < b.display ? -1 : a.display > b.display ? 1 : 0;
  });
  const nanCount = result.filter((p) => !Number.isFinite(p.rawScore)).length;
  const uniqScores = new Set(result.map((p) => p.networkScore)).size;
  return { players: result, matchesUsed, iters, converged, priorMean, nanCount, uniqScores };
}

// ---------- rating_i per source → q_i map ----------
function buildQ(
  source: 'latest' | 'mean' | 'replay',
  playerKeys: Set<string>,
  priorMeanForQ: number,
  replayOverride?: Record<string, { rating: number }>,
  aggOverride?: Map<string, { vals: number[]; latest?: number }>,
) {
  // rating_i per key
  const ratingOf = new Map<string, number>();
  const replaySrc = replayOverride ?? replayed;
  const aggSrc = aggOverride ?? ratingAgg;
  for (const key of playerKeys) {
    if (source === 'replay') {
      const rv = replaySrc[key]?.rating;
      if (typeof rv === 'number' && Number.isFinite(rv)) ratingOf.set(key, rv);
    } else {
      const agg = aggSrc.get(key);
      if (agg && agg.vals.length) {
        if (source === 'latest') ratingOf.set(key, agg.latest ?? agg.vals[agg.vals.length - 1]);
        else ratingOf.set(key, agg.vals.reduce((a, b) => a + b, 0) / agg.vals.length);
      }
    }
  }
  const rated = [...ratingOf.values()];
  const rBar = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
  const q = new Map<string, number>();
  let missing = 0;
  for (const key of playerKeys) {
    const ri = ratingOf.get(key);
    if (ri === undefined) { q.set(key, priorMeanForQ); missing++; continue; }
    const E = 1 / (1 + Math.pow(10, (rBar - ri) / 400));
    const qv = Math.max(0, Math.min(1.3, priorMeanForQ + S_SCALE * (E - 0.5)));
    q.set(key, qv);
  }
  return { q, ratingOf, rBar, missing, ratedCount: rated.length };
}

// ---------- stats ----------
function ranksBy<T>(items: T[], scoreOf: (t: T) => number): number[] {
  const order = items.map((t, i) => ({ t, i, s: scoreOf(t) }))
    .sort((a, b) => b.s - a.s || a.i - b.i);
  const ranks = new Array<number>(items.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].s === order[i].s) j++;
    const avg = (i + 1 + j + 1) / 2;
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
const spearman = (players: { rawScore: number; matchesPlayed: number }[]) =>
  pearson(ranksBy(players, (p) => p.rawScore), ranksBy(players, (p) => p.matchesPlayed));

const TRACKED = ['jeo', 'shirwin', 'atthan', 'sandro', 'juha', 'trin', 'marivic', 'jowinski', 'cara', 'ednalyn'];

function report(
  name: string,
  res: ReturnType<typeof runVariant>,
  v6rank: Map<string, number>,
) {
  const players = res.players;
  console.log(`\n================ ${name} ================`);
  console.log(
    `players=${players.length} matchesUsed=${res.matchesUsed} iters=${res.iters} converged=${res.converged} priorMean=${res.priorMean.toFixed(4)} NaN=${res.nanCount} uniqNetScores=${res.uniqScores}`,
  );
  console.log('rank  name                                   net  rawScore   games  W-L');
  players.slice(0, 15).forEach((p, i) => {
    console.log(
      `${String(i + 1).padStart(3)}  ${p.display.padEnd(38)} ${String(p.networkScore).padStart(3)}  ${p.rawScore.toFixed(5)}  ${String(p.matchesPlayed).padStart(5)}  ${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ''}`,
    );
  });
  console.log(`  Spearman ρ(scoreRank, gamesRank) = ${spearman(players).toFixed(4)}`);
  for (const t of TRACKED) {
    const hits = players.filter((p) =>
      `${p.display} ${p.username} ${p.key}`.toLowerCase().includes(t),
    );
    for (const p of hits) {
      const idx = players.findIndex((q) => q.key === p.key) + 1;
      console.log(
        `  tracked '${t}': #${idx} ${p.display} (@${p.username || '?'}) net=${p.networkScore} g=${p.matchesPlayed} ${p.wins}-${p.losses}`,
      );
    }
  }
  // movers vs V6 (engine rank)
  let moved = 0;
  const moverRows: { d: number; name: string; v6: number; v8: number }[] = [];
  players.forEach((p, i) => {
    const v6 = v6rank.get(p.key);
    if (v6 === undefined) return;
    const d = Math.abs((i + 1) - v6);
    if (d > 10) {
      moved++;
      moverRows.push({ d, name: p.display, v6, v8: i + 1 });
    }
  });
  moverRows.sort((a, b) => b.d - a.d);
  console.log(`  players with |Δrank|>10 vs V6: ${moved}`);
  for (const m of moverRows.slice(0, 10)) {
    console.log(`    ${m.name}: v6=#${m.v6} -> #${m.v8} (Δ${m.d})`);
  }
}

// ---------- run variants ----------
// Need player key universe first — run V6 (no prior) to enumerate keys.
const v6 = runVariant(inputs, { surpriseEdges: false, priorQ: null });
console.log(`\nV6 baseline: players=${v6.players.length} matchesUsed=${v6.matchesUsed} priorMean=${v6.priorMean.toFixed(4)}`);
const allKeys = new Set(v6.players.map((p) => p.key));
const v6rank = new Map(v6.players.map((p, i) => [p.key, i + 1]));

// Build q maps per source (priorMean from V6 — same for all variants).
const qSources: Record<string, ReturnType<typeof buildQ>> = {};
for (const src of ['latest', 'mean', 'replay'] as const) {
  if (src === 'replay' && !replayOk) { qSources[src] = { q: new Map(), ratingOf: new Map(), rBar: 0, missing: allKeys.size, ratedCount: 0 }; continue; }
  const b = buildQ(src, allKeys, v6.priorMean);
  qSources[src] = b;
  const rv = [...b.ratingOf.values()].sort((a, c) => a - c);
  const qv = [...b.q.values()].sort((a, c) => a - c);
  console.log(
    `\n[source ${src}] rating_i: n=${b.ratingOf.size}/${allKeys.size} rated, missing→neutral=${b.missing}, ` +
    `r̄=${b.rBar.toFixed(1)} rating[min=${rv[0] ?? '—'}, med=${rv[Math.floor(rv.length / 2)] ?? '—'}, max=${rv[rv.length - 1] ?? '—'}] ` +
    `q[min=${qv[0]?.toFixed(3) ?? '—'}, med=${qv[Math.floor(qv.length / 2)]?.toFixed(3) ?? '—'}, max=${qv[qv.length - 1]?.toFixed(3) ?? '—'}]`,
  );
}
if (replayOk) {
  const covKeys = new Set(Object.keys(replayed));
  const graphOnly = [...allKeys].filter((k) => !covKeys.has(k));
  console.log(`replay coverage: ${covKeys.size} replayed players; graph keys missing from replay (→neutral q): ${graphOnly.length}`);
  if (graphOnly.length) console.log(`  e.g. ${graphOnly.slice(0, 8).map((k) => k.slice(0, 40)).join(' | ')}`);
}

report('V6 BASELINE (V5 edges + adaptive λ, p̃ teleport)', v6, v6rank);
report('V8a (teleport=latest + surprise edges)', runVariant(inputs, { surpriseEdges: true, priorQ: qSources.latest.q }), v6rank);
report('V8b (teleport=mean + surprise edges)', runVariant(inputs, { surpriseEdges: true, priorQ: qSources.mean.q }), v6rank);
if (replayOk) report('V8c (teleport=replayed + surprise edges)', runVariant(inputs, { surpriseEdges: true, priorQ: qSources.replay.q }), v6rank);
report('V8d (surprise edges only, p̃ teleport)', runVariant(inputs, { surpriseEdges: true, priorQ: null }), v6rank);

// ============================================================
// COMPETITIVE-ONLY section — matches the user's screenshot dataset
// (toggle OFF: excludes fair_balance + variety_first modes)
// ============================================================
const NON_COMP = new Set(['fair_balance', 'variety_first']);
const compInputs = inputs.filter((m) => !NON_COMP.has(m.matchmakingMode || ''));
console.log(`
##### COMPETITIVE-ONLY: ${compInputs.length} matches #####`);

const compV6 = runVariant(compInputs, { surpriseEdges: false, priorQ: null });
const compKeys = new Set(compV6.players.map((p) => p.key));
console.log(`compV6: players=${compV6.players.length} priorMean=${compV6.priorMean.toFixed(4)}`);

let compReplayed: Record<string, { rating: number }> = {};
try {
  compReplayed = replayMatchesForRanking(compInputs, false) as Record<string, { rating: number }>;
  console.log(`comp replay: ${Object.keys(compReplayed).length} players`);
} catch (e) {
  console.log(`comp replay FAILED: ${(e as Error).message}`);
}
const compQ = buildQ('replay', compKeys, compV6.priorMean, compReplayed);
const compQLatest = buildQ('latest', compKeys, compV6.priorMean); // career-memory prior (TASK: V8a on competitive)

const COMP_TRACKED = ['jeo', 'trin', 'angelo', 'obal', 'shirwin', 'atthan', 'sandro', 'juha', 'marivic', 'jowinski', 'cara', 'ednalyn', 'mark', 'rands', 'aira', 'jaymar', 'cyyy'];
function compReport(name: string, res: ReturnType<typeof runVariant>) {
  const players = res.players;
  console.log(`
================ ${name} ================`);
  console.log(`players=${players.length} iters=${res.iters} converged=${res.converged} NaN=${res.nanCount} uniqNet=${res.uniqScores} rho=${spearman(players).toFixed(4)}`);
  players.slice(0, 15).forEach((p, i) => {
    const wl = `${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ''}`;
    console.log(` ${String(i + 1).padStart(3)}  ${p.display.padEnd(36)} net=${String(p.networkScore).padStart(3)} raw=${p.rawScore.toFixed(3)} g=${String(p.matchesPlayed).padStart(3)} ${wl} prior=${p.priorScore.toFixed(3)}${p.relSoS !== undefined ? ` relSoS=${p.relSoS.toFixed(2)}` : ''}`);
  });
  for (const t of COMP_TRACKED) {
    const hits = players.filter((p) =>
      (`${p.display} ${p.username} ${p.key}`.toLowerCase()).includes(t));
    for (const p of hits) {
      const idx = players.findIndex((q) => q.key === p.key) + 1;
      console.log(`  tracked '${t}': #${idx} ${p.display} g=${p.matchesPlayed} ${p.wins}-${p.losses} net=${p.networkScore} prior=${p.priorScore.toFixed(3)} flow=${p.networkFlow.toFixed(3)}${p.relSoS !== undefined ? ` relSoS=${p.relSoS.toFixed(2)}` : ''}`);
    }
  }
}

const prodV8c = runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q });
compReport('PROD-V8c competitive (current live algo)', prodV8c);
compReport('V8a-competitive (latest-rating prior + surprise edges)', runVariant(compInputs, { surpriseEdges: true, priorQ: compQLatest.q }));
compReport('V9a lambda-cap=0.6 + rating', runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, lambdaCap: 0.6 }));
compReport('V9b flow/games (meanG norm) + rating', runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, flowGamesNorm: true }));
compReport('V9d lambda0.6 + flow/games + rating', runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, lambdaCap: 0.6, flowGamesNorm: true }));
// V10: per-game endorsement — inflow/games × K removes volume, K rescales to prior units.
// inflow/games ≈ 0.04 typical → K≈12-15 puts flow term on prior scale (~0.5).
for (const K of [8, 12, 16, 20]) {
  compReport(`V10 flowPerGame K=${K} + rating`, runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, flowPerGameK: K }));
}
// V11: lambda-cap sweep — lower cap = prior (perf+rating) dominates more,
// total flow kept (volume regularizes small samples via lambda_i->0).
for (const cap of [0.25, 0.3, 0.35, 0.4, 0.5]) {
  compReport(`V11 lambdaCap=${cap} + rating`, runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, lambdaCap: cap }));
}
// V12: designer formula score = prior · relSoS^ω — network as bounded SoS multiplier
for (const w of [0.3, 0.5, 0.7]) {
  compReport(`V12 relSoS omega=${w} + rating`, runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, relSoSOmega: w }));
}
// V12b: relSoS with stronger small-sample damping (CF=30,50) at omega=0.3
for (const cf of [30, 50]) {
  compReport(`V12b relSoS w=0.3 CF=${cf} + rating`, runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, relSoSOmega: 0.3, relSoSCF: cf }));
}
// V13: relSoS + CAREER-memory prior (latest stored rating) — fixes Angelo/Jaymar tail
compReport('V13 relSoS w=0.3 CF=30 + LATEST-rating prior (career)', runVariant(compInputs, { surpriseEdges: true, priorQ: compQLatest.q, relSoSOmega: 0.3, relSoSCF: 30 }));
compReport('V13b relSoS w=0.3 CF=30 + REPLAY prior (control)', runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, relSoSOmega: 0.3, relSoSCF: 30 }));

// ============================================================
// RATING-BOARD check — what rankClubPlayers (Global/My Matches tabs)
// produces on the SAME competitive dataset. This is the DUPR-style
// opponent-adjusted rating the user wants the Club tab to match.
// ============================================================
{
  const rated = Object.values(compReplayed as Record<string, {
    rating: number; ratedMatchesPlayed: number; matchesPlayed: number;
    wins: number; losses: number; username: string; name: string; firstName: string;
    provisional: boolean;
  }>);
  const sorted = [...rated].sort((a, b) =>
    b.rating - a.rating || b.ratedMatchesPlayed - a.ratedMatchesPlayed ||
    (b.matchesPlayed > 0 ? b.wins / b.matchesPlayed : 0) - (a.matchesPlayed > 0 ? a.wins / a.matchesPlayed : 0) ||
    a.username.localeCompare(b.username));
  console.log(`
================ RATING-BOARD (rankClubPlayers / DUPR-style) ================`);
  console.log('rank  name                                   rating  games  W-L   prov');
  sorted.slice(0, 20).forEach((p, i) => {
    console.log(` ${String(i + 1).padStart(3)}  ${(p.name || p.firstName || p.username).padEnd(38)} ${String(Math.round(p.rating)).padStart(5)}  ${String(p.matchesPlayed).padStart(3)}  ${p.wins}-${p.losses}  ${p.provisional ? 'PROV' : ''}`);
  });
  for (const t of COMP_TRACKED) {
    const p = sorted.find((q) =>
      (`${q.name} ${q.username}`.toLowerCase()).includes(t));
    if (p) {
      const idx = sorted.indexOf(p) + 1;
      console.log(`  rating-board '${t}': #${idx} ${p.name || p.username} rating=${Math.round(p.rating)} g=${p.matchesPlayed} ${p.wins}-${p.losses}${p.provisional ? ' PROV' : ''}`);
    }
  }
}

// DIAG: pure prior (perf+rating, no network) ordering
{
  const byPrior = [...prodV8c.players].sort((a, b) => b.priorScore - a.priorScore || b.matchesPlayed - a.matchesPlayed);
  console.log('\n================ DIAG prior-only (perf+rating, no network) ================');
  byPrior.slice(0, 15).forEach((p, i) => {
    console.log(` ${String(i + 1).padStart(3)}  ${p.display.padEnd(36)} prior=${p.priorScore.toFixed(3)} g=${String(p.matchesPlayed).padStart(3)} ${p.wins}-${p.losses}`);
  });
  for (const t of COMP_TRACKED) {
    const p = byPrior.find((q) => (`${q.display} ${q.username} ${q.key}`.toLowerCase()).includes(t));
    if (p) {
      const idx = byPrior.indexOf(p) + 1;
      console.log(`  prior-only '${t}': #${idx} ${p.display} prior=${p.priorScore.toFixed(3)}`);
    }
  }
}

// û distribution sanity (how often factor ≠ 1)
let pairCount = 0, ratedPairs = 0, sumAbsU = 0;
{
  const ordered = [...inputs].sort((a, b) => ((a.completedAt || '') < (b.completedAt || '') ? -1 : 1));
  for (const m of ordered) {
    for (const pa of m.teamA) for (const pb of m.teamB) {
      pairCount++;
      if (typeof pa.rating === 'number' && typeof pb.rating === 'number') {
        ratedPairs++;
        sumAbsU += Math.abs(Math.max(-1, Math.min(1, (pa.rating - pb.rating) / 800)));
      }
    }
  }
}
console.log(`\nû stats: cross-side ordered pairs=${pairCount} bothRated=${ratedPairs} mean|û|=${ratedPairs ? (sumAbsU / ratedPairs).toFixed(3) : '—'}`);
console.log('(κ=0.4 → mean edge multiplier deviation ≈ ' + (ratedPairs ? ((sumAbsU / ratedPairs) * KAPPA).toFixed(3) : '—') + ')');
console.log('DONE');
