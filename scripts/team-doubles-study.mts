/**
 * Tournament team composition — doubles-only format.
 *
 * Format: 1 men's doubles + 1 women's doubles + 3 mixed doubles =
 * exactly 10 players, each paired once (5M: 2 MD + 3 XD; 5F: 2 WD + 3 XD).
 *
 * Method — pair-strength scoring (winning chance, sample-size agnostic):
 *   strWR  = Elo expected WR of the pair's combined replayed ratings
 *            vs the league-average team — pure strength, no history needed
 *   perfAdj = recency-weighted mean of (result − expectedWR) per shared
 *            game — over/under-performance vs expectation. Averaged per
 *            game, so number of games played together does NOT matter.
 *   estWR  = clamp(strWR + perfAdj)  → lineup score = sum over 6 pairs.
 *
 * All ratings from replayMatchesForRanking (flat-1450 seed). Stored
 * ratings in snapshots are never read.
 *
 * Usage: npx tsx scripts/team-doubles-study.mts [fixture.json]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { replayMatchesForRanking } from '../src/utils/ratingReplay';
import { duoPlayerKey, buildDuoEntries } from '../src/utils/duoStats';
import { rosterOf as rosterOfShared } from './roster-identities.mjs';

const FILE = resolve(
  process.cwd(),
  'test',
  'fixtures',
  process.argv[2] || 'completed_matches_team_all.json',
);

const ROSTER = [
  { id: 'jeovanni', user: 'jeovannizabala', gender: 'M', label: 'Jeovanni Zabala' },
  { id: 'franco', user: 'gachallanf', gender: 'M', label: 'Franco Lorenzo Gachallan' },
  { id: 'james', user: 'jamesmanganaan', gender: 'M', label: 'James Manganaan' },
  { id: 'timothy', user: 'timdev0421', gender: 'M', label: 'Timothy Eslabra' },
  { id: 'michael', user: 'michaelbraganza', gender: 'M', label: 'Michael Braganza' },
  { id: 'hazel', user: 'hazelhiquiana', gender: 'F', label: 'Hazel Eslabra' },
  { id: 'grace', user: 'gracebackupmail', gender: 'F', label: 'Grace Estayo' },
  { id: 'nairetta', user: 'nairettap', gender: 'F', label: 'Nairetta Pastoral' },
  { id: 'jaria', user: 'jquerimit', gender: 'F', label: 'Jaria Querimit' },
  { id: 'sheree', user: 'shereevillegas', gender: 'F', label: 'Sheree Villegas' },
] as const;

type RosterId = (typeof ROSTER)[number]['id'];
// Delegates to scripts/roster-identities.mts — merges all accounts,
// alternate usernames, Jaria's two accounts, and approved guest entries.
const rosterOf = (p: any): RosterId | null => rosterOfShared(p) as RosterId | null;
const label = (id: RosterId) => ROSTER.find((r) => r.id === id)!.label;
const first = (id: RosterId) => label(id).split(' ')[0]!;
const pairKey = (a: RosterId, b: RosterId) => [a, b].sort().join('|');

const teamRating = (r1: number, r2: number) => {
  const harmonic = 2 / (1 / Math.max(1, r1) + 1 / Math.max(1, r2));
  return harmonic * 0.6 + (r1 + r2) / 2 * 0.4;
};
const expectedWR = (teamR: number, oppR: number) =>
  1 / (1 + Math.pow(10, -(teamR - oppR) / 400));
const RECENCY_DECAY = 0.05;
const DAY = 86400000;

const matches = JSON.parse(readFileSync(FILE, 'utf8'));
const dates = matches.map((m: any) => m.completed_at).filter(Boolean).sort();
const NOW = dates.length ? new Date(dates[dates.length - 1]).getTime() : Date.now();
console.log(
  `Loaded ${matches.length} roster matches (${dates[0]?.slice(0, 10)} → ${dates[dates.length - 1]?.slice(0, 10)}).\n`,
);

// --- Replay ratings (flat 1450 seed — pure match history) -----------------
const ri = matches.map((m: any) => ({
  teamAScore: m.team_a_score,
  teamBScore: m.team_b_score,
  matchKey: m.match_key,
  completedAt: m.completed_at,
  matchmakingMode: m.meta?.matchmakingMode,
  teamA: (m.team_a || []).map((p: any) => ({
    userId: p.userId, username: p.username, firstName: p.firstName,
    lastName: p.lastName, name: p.firstName,
  })),
  teamB: (m.team_b || []).map((p: any) => ({
    userId: p.userId, username: p.username, firstName: p.firstName,
    lastName: p.lastName, name: p.firstName,
  })),
}));
const replayed = replayMatchesForRanking(ri, true);
const ratingOf = (p: any): number =>
  (replayed[duoPlayerKey(p)]?.rating as number) ?? 1450;

let teamRatingSum = 0, teamRatingN = 0;
for (const m of matches) {
  const ta = m.team_a || [], tb = m.team_b || [];
  if (ta.length === 2 && tb.length === 2) {
    teamRatingSum += teamRating(ratingOf(ta[0]), ratingOf(ta[1])) + teamRating(ratingOf(tb[0]), ratingOf(tb[1]));
    teamRatingN += 2;
  }
}
const LEAGUE_AVG_TEAM_R = teamRatingN ? teamRatingSum / teamRatingN : 1500;

// --- Accumulate pair records (ALL roster pairs: MM, FF, MF) -----------------
type Rec = { t: number; won: boolean; ewr: number };
type UnitData = { recs: Rec[]; pointDiff: number; opponents: Set<string>; lastPlayed: string };
const pairU = new Map<string, UnitData>();
const playerU = new Map<RosterId, { recs: Rec[] }>();
for (const r of ROSTER) playerU.set(r.id, { recs: [] });

for (const m of matches) {
  const ta = m.team_a || [], tb = m.team_b || [];
  const aWon = m.team_a_score > m.team_b_score;
  const t = new Date(m.completed_at).getTime();

  for (const [side, won, oppSide] of [[ta, aWon, tb], [tb, !aWon, ta]] as const) {
    if (side.length !== 2 || oppSide.length !== 2) continue;
    const sideR = teamRating(ratingOf(side[0]), ratingOf(side[1]));
    const oppR = teamRating(ratingOf(oppSide[0]), ratingOf(oppSide[1]));
    const ewr = expectedWR(sideR, oppR);
    const diff = won ? m.team_a_score - m.team_b_score : m.team_b_score - m.team_a_score;

    // every roster pair on this side
    const rids = side.map(rosterOf).filter(Boolean) as RosterId[];
    if (rids.length === 2 && rids[0] !== rids[1]) {
      const key = pairKey(rids[0], rids[1]);
      if (!pairU.has(key)) pairU.set(key, { recs: [], pointDiff: 0, opponents: new Set(), lastPlayed: '' });
      const u = pairU.get(key)!;
      u.recs.push({ t, won, ewr });
      u.pointDiff += diff;
      u.opponents.add([duoPlayerKey(oppSide[0]), duoPlayerKey(oppSide[1])].sort().join('|'));
      if (!u.lastPlayed || m.completed_at > u.lastPlayed) u.lastPlayed = m.completed_at;
    }
    // per-player records (for context/summary)
    for (const rid of rids) playerU.get(rid)!.recs.push({ t, won, ewr });
  }
}

// --- Derived stats ------------------------------------------------------------
const wOf = (t: number) => Math.exp(-RECENCY_DECAY * Math.max(0, (NOW - t) / DAY));
const wStats = (recs: Rec[]) => {
  let wg = 0, ww = 0, we = 0;
  for (const r of recs) { const w = wOf(r.t); wg += w; ww += w * (r.won ? 1 : 0); we += w * r.ewr; }
  return { wg, ww, we };
};
const repById = new Map<RosterId, any>();
for (const m of matches) {
  for (const side of [m.team_a || [], m.team_b || []])
    for (const p of side) {
      const rid = rosterOf(p);
      if (rid && !repById.has(rid)) repById.set(rid, p);
    }
}
const ratingById = (id: RosterId) => (repById.has(id) ? ratingOf(repById.get(id)) : 1450);

// estWR = pair strength (Elo WR vs league-average team) + performance
// adjustment (weighted mean result-minus-expectation per shared game).
// Sample size deliberately ignored — a pair's chance is judged on
// strength and per-game over/under-performance, not games played.
const estWRof = (u: UnitData | undefined, teamR: number, cap: number) => {
  const strWR = expectedWR(teamR, LEAGUE_AVG_TEAM_R);
  if (!u || !u.recs.length) {
    return { est: strWR, games: 0, wins: 0, wwr: null as number | null, syn: null as number | null, strWR, g30: 0, w30: 0 };
  }
  const { wg, ww, we } = wStats(u.recs);
  const perfAdj = Math.max(-cap, Math.min(cap, ww / wg - we / wg));
  const g = u.recs.length;
  const wins = u.recs.filter((r) => r.won).length;
  const wr = wins / g;
  const rawEwr = u.recs.reduce((s, r) => s + r.ewr, 0) / g;
  const cutoff = NOW - 30 * DAY;
  const recent = u.recs.filter((r) => r.t >= cutoff);
  return {
    est: Math.max(0.02, Math.min(0.98, strWR + perfAdj)),
    games: g, wins,
    wwr: (ww / wg) * 100,
    syn: Math.round((wr - rawEwr) * 100),
    avgDiff: u.pointDiff / g,
    opps: u.opponents.size,
    last: u.lastPlayed.slice(0, 10),
    strWR,
    g30: recent.length,
    w30: recent.filter((r) => r.won).length,
  };
};
const pairEst = (a: RosterId, b: RosterId, cap = 0.2) =>
  estWRof(pairU.get(pairKey(a, b)), teamRating(ratingById(a), ratingById(b)), cap);

const men = ROSTER.filter((r) => r.gender === 'M');
const women = ROSTER.filter((r) => r.gender === 'F');
const combs = (arr: readonly RosterId[], n: number): RosterId[][] => {
  if (n === 2) {
    const out: RosterId[][] = [];
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) out.push([arr[i]!, arr[j]!]);
    return out;
  }
  const out: RosterId[][] = [];
  for (let i = 0; i < arr.length; i++)
    for (let j = i + 1; j < arr.length; j++)
      for (let l = j + 1; l < arr.length; l++)
        out.push([arr[i]!, arr[j]!, arr[l]!]);
  return out;
};
const perms = <T,>(arr: readonly T[]): T[][] => {
  if (arr.length <= 1) return [arr as T[]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of perms(rest)) out.push([arr[i]!, ...p]);
  }
  return out;
};

// --- Chemistry tables -----------------------------------------------------------
function chemTable(title: string, ids: RosterId[][]) {
  console.log('\n' + '='.repeat(100));
  console.log(`  ${title}`);
  console.log('='.repeat(100));
  console.log(
    `${'Pair'.padEnd(34)}${'G'.padStart(4)}${'W-L'.padStart(9)}${'WR%'.padStart(6)}${'wWR%'.padStart(7)}` +
      `${'Syn'.padStart(6)}${'AvgDiff'.padStart(9)}${'Opps'.padStart(6)}${'Last'.padStart(12)}${'estWR'.padStart(8)}`,
  );
  const rows = ids
    .map(([a, b]) => ({ a, b, e: pairEst(a, b) }))
    .sort((x, y) => (y.e.games ? y.e.est : -1) - (x.e.games ? x.e.est : -1) || y.e.games - x.e.games);
  for (const { a, b, e } of rows) {
    if (!e.games) { console.log(`${first(a)} + ${first(b)}`.padEnd(34) + '  -- no shared games --'); continue; }
    console.log(
      `${first(a)} + ${first(b)}`.padEnd(34) +
        `${e.games}`.padStart(4) + `${e.wins}-${e.games - e.wins}`.padStart(9) +
        `${((e.wins / e.games) * 100).toFixed(0)}`.padStart(6) + `${e.wwr!.toFixed(0)}`.padStart(7) +
        `${e.syn}`.padStart(6) + `${e.avgDiff!.toFixed(1)}`.padStart(9) +
        `${e.opps}`.padStart(6) + ` ${e.last}`.padStart(12) + `${e.est.toFixed(3)}`.padStart(8),
    );
  }
}
const mmPairs = combs(men.map((r) => r.id), 2);
const ffPairs = combs(women.map((r) => r.id), 2);
const mfPairs = men.flatMap((m) => women.map((w) => [m.id, w.id] as RosterId[]));
chemTable("MEN'S DOUBLES candidates", mmPairs);
chemTable("WOMEN'S DOUBLES candidates", ffPairs);
chemTable('MIXED DOUBLES candidates', mfPairs);

// --- Player summary (merged accounts) ---------------------------------------
console.log('\n' + '='.repeat(100));
console.log('  PLAYER SUMMARY — all accounts merged, replayed ratings (flat-1450 seed)');
console.log('='.repeat(100));
console.log(`${'Player'.padEnd(28)}${'G'.padStart(5)}${'W-L'.padStart(10)}${'WR%'.padStart(6)}${'wWR%'.padStart(7)}${'Replay'.padStart(8)}${'30d'.padStart(8)}`);
for (const r of ROSTER) {
  const recs = playerU.get(r.id)!.recs;
  const g = recs.length;
  const wins = recs.filter((x) => x.won).length;
  const { wg, ww } = wStats(recs);
  const cutoff = NOW - 30 * DAY;
  const r30 = recs.filter((x) => x.t >= cutoff);
  const w30 = r30.filter((x) => x.won).length;
  console.log(
    `${r.label.padEnd(28)}${String(g).padStart(5)}${`${wins}-${g - wins}`.padStart(10)}` +
    `${g ? ((wins / g) * 100).toFixed(0) : '-'}%`.padStart(6) +
    `${wg ? ((ww / wg) * 100).toFixed(0) : '-'}`.padStart(7) +
    `${Math.round(ratingById(r.id))}`.padStart(8) +
    `${r30.length ? `${w30}/${r30.length}` : '-'}`.padStart(8),
  );
}

// --- Enumerate: 1 MD + 1 WD + 3 XD, all 10 players used once --------------------
type Combo = {
  score: number;      // P(at least 3 of 5 pairs win) — tournament advance prob
  expWins: number;    // sum of pair estWRs — tiebreaker / context
  md: [RosterId, RosterId]; wd: [RosterId, RosterId];
  xd: [RosterId, RosterId][];
  units: { kind: string; pair: [RosterId, RosterId]; est: number; games: number; wins: number; wwr: number | null; syn: number | null; last: string; strWR: number; g30: number; w30: number }[];
  proven: number; minGames: number;
};

// Poisson-binomial tail: P(X >= 3) for 5 independent pair matches.
const pAdvance = (ps: number[]) => {
  const dp = [1, 0, 0, 0, 0, 0];
  for (const p of ps) {
    for (let j = 5; j >= 1; j--) dp[j] = dp[j]! * (1 - p) + dp[j - 1]! * p;
    dp[0] = dp[0]! * (1 - p);
  }
  return 1 - dp[0]! - dp[1]! - dp[2]!;
};
function enumerate(cap: number, requireProven: boolean): Combo[] {
  const out: Combo[] = [];
  for (const md of mmPairs) {
    for (const wd of ffPairs) {
      const usedM = new Set<RosterId>(md);
      const usedF = new Set<RosterId>(wd);
      const remM = men.map((r) => r.id).filter((id) => !usedM.has(id));
      const remF = women.map((r) => r.id).filter((id) => !usedF.has(id));
      // remM/remF have exactly 3 each → all 6 bijections
      for (const perm of perms(remF)) {
        const xd = remM.map((m, i) => [m, perm[i]!] as [RosterId, RosterId]);
        const allPairs = [md, wd, ...xd] as [RosterId, RosterId][];
        const kinds = ['MD', 'WD', 'XD', 'XD', 'XD'];
        const units = allPairs.map((pr, i) => {
          const e = pairEst(pr[0], pr[1], cap);
          return { kind: kinds[i]!, pair: pr, est: e.est, games: e.games, wins: e.wins, wwr: e.wwr, syn: e.syn, last: e.last ?? '', strWR: e.strWR, g30: e.g30 ?? 0, w30: e.w30 ?? 0 };
        });
        const proven = units.filter((u) => u.games >= 3).length;
        const minGames = Math.min(...units.map((u) => u.games));
        if (requireProven && proven < 5) continue;
        const expWins = units.reduce((s, u) => s + u.est, 0);
        out.push({
          score: pAdvance(units.map((u) => u.est)), expWins,
          md: md as [RosterId, RosterId], wd: wd as [RosterId, RosterId], xd,
          units, proven, minGames,
        });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score || b.expWins - a.expWins);
}

function printCombos(title: string, combos: Combo[], n: number) {
  console.log('\n' + '='.repeat(100));
  console.log(`  ${title}`);
  console.log('='.repeat(100));
  for (const [i, c] of combos.slice(0, n).entries()) {
    console.log(
      `\n#${i + 1}  P(win >=3 of 5) ${(c.score * 100).toFixed(1)}%   exp wins ${c.expWins.toFixed(2)}   proven ${c.proven}/5  min pair games ${c.minGames}`,
    );
    for (const u of c.units) {
      const ev = u.games
        ? `${u.games}G ${u.wins}W ${u.games - u.wins}L  wWR ${u.wwr?.toFixed(0)}%  syn ${u.syn}  str ${u.strWR.toFixed(2)}  30d ${u.w30}/${u.g30}  last ${u.last}`
        : `no shared games  str ${u.strWR.toFixed(2)}`;
      console.log(`  ${u.kind}  ${first(u.pair[0])} + ${first(u.pair[1])}  [${ev}]`);
    }
  }
}

printCombos('TOP COMBINATIONS — pair strength + performance, chemistry swing ±0.20', enumerate(0.2, false), 10);
printCombos('TOP COMBINATIONS — pair strength + performance, chemistry swing ±0.10 (fluke-resistant)', enumerate(0.1, false), 10);
printCombos('TOP COMBINATIONS — all pairs proven (>=3 shared games each)', enumerate(0.1, true), 10);

// =============================================================================
//  ALGORITHM BAKE-OFF — all models scored on the same 600 combos.
//  Models produce a per-pair win probability; objectives:
//    sum  = expected wins across 5 pairs
//    p3   = P(at least 3 of 5 pairs win) — tournament advance probability
// =============================================================================

// Model A inputs: product duoScore via buildDuoEntries
const duoInputs = matches.map((m: any) => ({
  teamAScore: m.team_a_score,
  teamBScore: m.team_b_score,
  completedAt: m.completed_at,
  teamA: m.team_a || [],
  teamB: m.team_b || [],
}));
const ratingMap = new Map<string, number>();
for (const [k, v] of Object.entries(replayed)) ratingMap.set(k, v.rating);
const duoScoreByPair = new Map<string, number>();
for (const e of buildDuoEntries(duoInputs, ratingMap)) {
  const i1 = rosterOf(e.player1);
  const i2 = rosterOf(e.player2);
  if (i1 && i2 && i1 !== i2) duoScoreByPair.set(pairKey(i1, i2), e.duoScore);
}

// Per-pair estimates under each model
const allRosterPairs: [RosterId, RosterId][] = [];
for (let i = 0; i < ROSTER.length; i++)
  for (let j = i + 1; j < ROSTER.length; j++)
    allRosterPairs.push([ROSTER[i]!.id, ROSTER[j]!.id]);

type PEst = { m1: number; m2: number; m3: number; m4: number; games: number };
const pairEsts = new Map<string, PEst>();
for (const [a, b] of allRosterPairs) {
  const key = pairKey(a, b);
  const u = pairU.get(key);
  const teamR = teamRating(ratingById(a), ratingById(b));
  const strWR = expectedWR(teamR, LEAGUE_AVG_TEAM_R);
  const { wg, ww, we } = u?.recs.length ? wStats(u.recs) : { wg: 0, ww: 0, we: 0 };
  // B: shrinkage k=6 toward weighted expected WR
  const priorWR = wg > 0 ? we / wg : strWR;
  const m2 = (ww + 6 * priorWR) / (wg + 6);
  // C: strength + capped per-game performance residual
  const perfAdj = wg > 0 ? Math.max(-0.1, Math.min(0.1, ww / wg - we / wg)) : 0;
  const m3 = Math.max(0.02, Math.min(0.98, strWR + perfAdj));
  // A: duoScore (needs >=2 games); unproven -> rating-equivalent estimate
  const ds = duoScoreByPair.get(key);
  const m1 = ds ?? 1350 + ((strWR - 0.3) / 0.4) * 300;
  pairEsts.set(key, { m1, m2, m3, m4: strWR, games: u?.recs.length ?? 0 });
}

// Enumerate raw combos once
type RawCombo = { md: [RosterId, RosterId]; wd: [RosterId, RosterId]; xd: [RosterId, RosterId][] };
const rawCombos: RawCombo[] = [];
for (const md of mmPairs) {
  for (const wd of ffPairs) {
    const usedM = new Set<RosterId>(md);
    const usedF = new Set<RosterId>(wd);
    const remM = men.map((r) => r.id).filter((id) => !usedM.has(id));
    const remF = women.map((r) => r.id).filter((id) => !usedF.has(id));
    for (const perm of perms(remF)) {
      rawCombos.push({
        md: md as [RosterId, RosterId],
        wd: wd as [RosterId, RosterId],
        xd: remM.map((m, i) => [m, perm[i]!] as [RosterId, RosterId]),
      });
    }
  }
}
const comboPairs = (c: RawCombo): [RosterId, RosterId][] => [c.md, c.wd, ...c.xd];
const comboDesc = (c: RawCombo) =>
  `MD ${first(c.md[0])}+${first(c.md[1])} | WD ${first(c.wd[0])}+${first(c.wd[1])} | ` +
  c.xd.map((p) => `${first(p[0])}+${first(p[1])}`).join(' · ');

const MODELS: { name: string; key: keyof PEst; scale: number }[] = [
  { name: 'A duoScore heuristic', key: 'm1', scale: 1 },
  { name: 'B shrinkage k=6', key: 'm2', scale: 1 },
  { name: 'C strength+perfAdj', key: 'm3', scale: 1 },
  { name: 'D pure strength', key: 'm4', scale: 1 },
];
const OBJECTIVES = ['sum', 'p3'] as const;

const consensus = new Map<string, number>();
for (const model of MODELS) {
  for (const obj of OBJECTIVES) {
    const scored = rawCombos.map((c) => {
      const ps = comboPairs(c).map((p) => {
        const e = pairEsts.get(pairKey(p[0], p[1]))!;
        return model.key === 'm1' ? (e.m1 - 1450) / 400 : e[model.key];
      });
      const score = obj === 'sum' ? ps.reduce((s, x) => s + x, 0) : pAdvance(ps);
      return { c, score };
    }).sort((a, b) => b.score - a.score);

    console.log('\n' + '='.repeat(100));
    console.log(`  MODEL ${model.name} — objective ${obj === 'sum' ? 'Σ estWR (expected wins)' : 'P(win >=3 of 5)'}`);
    console.log('='.repeat(100));
    for (const [i, s] of scored.slice(0, 5).entries()) {
      console.log(`#${i + 1}  ${(s.score * (obj === 'sum' ? 1 : 1)).toFixed(obj === 'sum' ? 3 : 3)}  ${comboDesc(s.c)}`);
      for (const p of comboPairs(s.c).slice(0, 5)) consensus.set(pairKey(p[0], p[1]), (consensus.get(pairKey(p[0], p[1])) || 0) + 1);
    }
  }
}

console.log('\n' + '='.repeat(100));
console.log('  CONSENSUS — pairs appearing in top-5 across all 8 rankings (of 40 slots)');
console.log('='.repeat(100));
const cons = [...consensus.entries()]
  .map(([k, n]) => ({ k, n, a: k.split('|')[0] as RosterId, b: k.split('|')[1] as RosterId }))
  .sort((x, y) => y.n - x.n);
for (const e of cons.filter((x) => x.n >= 3)) {
  console.log(`  ${first(e.a)} + ${first(e.b)}: ${e.n}/40 top-5 appearances`);
}

// =============================================================================
//  FULL ENUMERATION DUMP — every valid combination, ranked.
//  10 MD pairs × 10 WD pairs × 6 bijections = 600 lineups.
// =============================================================================
import { writeFileSync } from 'fs';

const all02 = enumerate(0.2, false);
const all01 = enumerate(0.1, false);
// XD order differs between enumerations? No — deterministic perms; still key
// on the full ordered structure to be safe.
const comboKey = (c: Combo) =>
  `${c.md[0]}|${c.md[1]}|${c.wd[0]}|${c.wd[1]}|${c.xd.map((p) => `${p[0]}~${p[1]}`).join(',')}`;
const byKey01 = new Map(all01.map((c) => [comboKey(c), c]));

const rankOf = (arr: Combo[]) => {
  const m = new Map<Combo, number>();
  arr.forEach((c, i) => m.set(c, i + 1));
  return m;
};
const r02 = rankOf(all02);
const r01 = rankOf(all01);

const slotDesc = (kind: string, pr: [RosterId, RosterId], e: ReturnType<typeof pairEst>) => {
  const g = e.games ? `${e.games}G` : 'new';
  return `${kind}:${first(pr[0])}+${first(pr[1])}(${g},${e.est.toFixed(2)})`;
};

const rows = all02.map((c) => {
  const c1 = byKey01.get(comboKey(c));
  const units = c.units;
  return [
    r02.get(c), (c.score * 100).toFixed(1), c.expWins.toFixed(3),
    c1 ? r01.get(c1) : '', c1 ? (c1.score * 100).toFixed(1) : '',
    c.proven, c.minGames,
    slotDesc('MD', c.md, pairEst(c.md[0], c.md[1], 0.2)),
    slotDesc('WD', c.wd, pairEst(c.wd[0], c.wd[1], 0.2)),
    ...c.xd.map((p, i) => slotDesc(`XD${i + 1}`, p, pairEst(p[0], p[1], 0.2))),
    units.map((u) => `${first(u.pair[0])}+${first(u.pair[1])}:${u.games}g`).join(' '),
  ];
});

const header = [
  'rank_p3_raw', 'p3_raw_pct', 'exp_wins', 'rank_p3_capped', 'p3_capped_pct',
  'proven_pairs', 'min_pair_games', 'md', 'wd', 'xd1', 'xd2', 'xd3', 'all_pairs_games',
];
const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
const outCsv = resolve(process.cwd(), 'TOURNAMENT_ALL_COMBINATIONS.csv');
writeFileSync(outCsv, csv);
console.log(`\nTotal valid combinations enumerated: ${all02.length}`);
console.log(`Full ranking written -> ${outCsv}`);
