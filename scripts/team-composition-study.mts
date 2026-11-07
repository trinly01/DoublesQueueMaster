/**
 * Tournament team composition study — 10-player roster, all-time data
 * with recency weighting (players improve; recent form matters most).
 *
 * Objective: pick 1 men's singles + 1 women's singles + 3 disjoint mixed
 * doubles pairs (every player used at most once) that maximizes expected
 * tournament wins.
 *
 * Method — recency-weighted expected-win-probability with Bayesian
 * shrinkage:
 *   Each match gets weight w = exp(-0.05 * daysAgo)  (same decay as the
 *   Best Duos engine — a match ~30d old counts ~22%, ~90d ~1%).
 *   For each unit u (singles player or mixed pair):
 *     estWR_u = (wWins_u + k * priorWR_u) / (wGames_u + k)
 *   where priorWR_u is the unit's rating-implied expected win rate:
 *     - proven units: recency-weighted mean expected WR across their
 *       actual matches (replayed ratings vs opponents faced)
 *     - unproven pairs: expected WR vs the league-average team
 *   Lineup score = sum of estWR over the 5 units = expected wins.
 *
 * All ratings come from replayMatchesForRanking — a flat-1450-seeded
 * replay of match results only. Stored ratings in match snapshots are
 * never read.
 *
 * k controls trust in results vs prior: small k trusts data fast,
 * large k demands more proof. Reported at k = 3 / 6 / 12 plus a
 * proven-only variant (every pair needs >= 3 shared games).
 *
 * Usage: npx tsx scripts/team-composition-study.mts [fixture.json]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { replayMatchesForRanking } from '../src/utils/ratingReplay';
import { duoPlayerKey } from '../src/utils/duoStats';

const FILE = resolve(
  process.cwd(),
  'test',
  'fixtures',
  process.argv[2] || 'completed_matches_team_all.json',
);

// Resolved roster — username prefixes (unique #suffix stripped).
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
const rosterOf = (p: any): RosterId | null => {
  const un = String(p?.username || '').toLowerCase();
  for (const r of ROSTER) if (un.startsWith(r.user)) return r.id;
  return null;
};
const label = (id: RosterId) => ROSTER.find((r) => r.id === id)!.label;
const pairKey = (a: RosterId, b: RosterId) => [a, b].sort().join('|');

// --- Elo helpers (mirror duoStats / matchmaking conventions) ----------
const teamRating = (r1: number, r2: number) => {
  const harmonic = 2 / (1 / Math.max(1, r1) + 1 / Math.max(1, r2));
  const arithmetic = (r1 + r2) / 2;
  return harmonic * 0.6 + arithmetic * 0.4;
};
const expectedWR = (teamR: number, oppR: number) =>
  1 / (1 + Math.pow(10, -(teamR - oppR) / 400));
const RECENCY_DECAY = 0.05; // exp(-0.05 * daysAgo); ~22% weight at 30d
const DAY = 86400000;

// --- Load ----------------------------------------------------------------
const matches = JSON.parse(readFileSync(FILE, 'utf8'));
const dates = matches
  .map((m: any) => m.completed_at)
  .filter(Boolean)
  .sort();
const NOW = dates.length ? new Date(dates[dates.length - 1]).getTime() : Date.now();
console.log(
  `Loaded ${matches.length} roster matches ` +
    `(${dates[0]?.slice(0, 10)} → ${dates[dates.length - 1]?.slice(0, 10)}).\n`,
);

// --- Replay: ratings from match results only (flat 1450 seed) -----------
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

// League-average team rating — prior anchor for unproven pairs.
let teamRatingSum = 0;
let teamRatingN = 0;
for (const m of matches) {
  const ta = m.team_a || [];
  const tb = m.team_b || [];
  if (ta.length === 2 && tb.length === 2) {
    teamRatingSum +=
      teamRating(ratingOf(ta[0]), ratingOf(ta[1])) +
      teamRating(ratingOf(tb[0]), ratingOf(tb[1]));
    teamRatingN += 2;
  }
}
const LEAGUE_AVG_TEAM_R = teamRatingN ? teamRatingSum / teamRatingN : 1500;

// --- Per-match records ------------------------------------------------------
// Store every relevant result; all stats (raw, recency-weighted, windowed)
// are derived from these lists.
type Rec = { t: number; won: boolean; ewr: number };
type UnitData = {
  recs: Rec[];
  pointDiff: number;
  opponents?: Set<string>;
  lastPlayed?: string;
};
const playerU = new Map<RosterId, UnitData>();
const pairU = new Map<string, UnitData>();
const clubs = new Map<RosterId, Set<string>>();
const h2h = new Map<string, { a: RosterId; b: RosterId; aWins: number; games: number }>();
const newUnit = (): UnitData => ({ recs: [], pointDiff: 0 });

for (const r of ROSTER) playerU.set(r.id, newUnit());

for (const m of matches) {
  const ta = m.team_a || [];
  const tb = m.team_b || [];
  const aWon = m.team_a_score > m.team_b_score;
  const t = new Date(m.completed_at).getTime();

  // Per-player accumulation (any roster player, any partner; singles count)
  for (const [side, won] of [[ta, aWon], [tb, !aWon]] as const) {
    const oppSide = side === ta ? tb : ta;
    const oppR =
      oppSide.length === 2
        ? teamRating(ratingOf(oppSide[0]), ratingOf(oppSide[1]))
        : oppSide.length === 1
          ? ratingOf(oppSide[0])
          : LEAGUE_AVG_TEAM_R;
    const sideR =
      side.length === 2
        ? teamRating(ratingOf(side[0]), ratingOf(side[1]))
        : side.length === 1
          ? ratingOf(side[0])
          : LEAGUE_AVG_TEAM_R;
    const ewr = expectedWR(sideR, oppR);
    const diff = won ? m.team_a_score - m.team_b_score : m.team_b_score - m.team_a_score;
    for (const p of side) {
      const rid = rosterOf(p);
      if (!rid) continue;
      const u = playerU.get(rid)!;
      u.recs.push({ t, won, ewr });
      u.pointDiff += diff;
      if (m.club) {
        if (!clubs.has(rid)) clubs.set(rid, new Set());
        clubs.get(rid)!.add(m.club);
      }
    }
  }

  // Per-pair accumulation — both roster players must share a side (2v2)
  for (const [side, won, oppSide] of [
    [ta, aWon, tb],
    [tb, !aWon, ta],
  ] as const) {
    if (side.length !== 2 || oppSide.length !== 2) continue;
    const rids = side.map(rosterOf);
    if (rids[0] && rids[1] && rids[0] !== rids[1]) {
      const key = pairKey(rids[0], rids[1]);
      if (!pairU.has(key)) {
        pairU.set(key, { recs: [], pointDiff: 0, opponents: new Set(), lastPlayed: '' });
      }
      const u = pairU.get(key)!;
      const sideR = teamRating(ratingOf(side[0]), ratingOf(side[1]));
      const oppR = teamRating(ratingOf(oppSide[0]), ratingOf(oppSide[1]));
      u.recs.push({ t, won, ewr: expectedWR(sideR, oppR) });
      u.pointDiff += won ? m.team_a_score - m.team_b_score : m.team_b_score - m.team_a_score;
      u.opponents!.add(
        [duoPlayerKey(oppSide[0]), duoPlayerKey(oppSide[1])].sort().join('|'),
      );
      if (!u.lastPlayed || m.completed_at > u.lastPlayed) u.lastPlayed = m.completed_at;
    }
  }

  // head-to-head: roster players on opposite sides (once per match)
  const aRids = ta.map(rosterOf).filter(Boolean) as RosterId[];
  const bRids = tb.map(rosterOf).filter(Boolean) as RosterId[];
  for (const aid of aRids) {
    for (const bid of bRids) {
      const [x, y] = [aid, bid].sort() as [RosterId, RosterId];
      const hk = `${x}|${y}`;
      if (!h2h.has(hk)) h2h.set(hk, { a: x, b: y, aWins: 0, games: 0 });
      const h = h2h.get(hk)!;
      h.games++;
      const xWon = x === aid ? aWon : !aWon;
      if (xWon) h.aWins++;
    }
  }
}

// --- Derived stats ---------------------------------------------------------
const wOf = (t: number) => Math.exp(-RECENCY_DECAY * Math.max(0, (NOW - t) / DAY));

// recency-weighted aggregates for a unit's match list
const wStats = (recs: Rec[]) => {
  let wg = 0, ww = 0, we = 0;
  for (const r of recs) {
    const w = wOf(r.t);
    wg += w; ww += w * (r.won ? 1 : 0); we += w * r.ewr;
  }
  return { wg, ww, we };
};
// windowed win rate: matches within `days` of NOW vs all older matches
const windowWR = (recs: Rec[], days: number) => {
  let g = 0, w = 0;
  for (const r of recs) {
    if (NOW - r.t <= days * DAY) { g++; if (r.won) w++; }
  }
  return g ? { g, wr: w / g } : null;
};
const priorWRof = (recs: Rec[]) => {
  const older = recs.filter((r) => NOW - r.t > 60 * DAY);
  if (older.length < 10) return null;
  return older.filter((r) => r.won).length / older.length;
};

// --- Representative player records (for replay-rating lookup) --------------
const repById = new Map<RosterId, any>();
for (const m of matches) {
  for (const side of [m.team_a || [], m.team_b || []]) {
    for (const p of side) {
      const rid = rosterOf(p);
      if (rid && !repById.has(rid)) repById.set(rid, p);
    }
  }
}
const ratingById = (id: RosterId) => {
  const p = repById.get(id);
  return p ? ratingOf(p) : 1450;
};

// estWR with empirical-Bayes shrinkage toward the rating-implied prior.
// Uses recency-weighted counts so current form dominates.
const estWR = (u: UnitData | undefined, teamR: number, k: number) => {
  const recs = u?.recs ?? [];
  const { wg, ww, we } = wStats(recs);
  const priorWR =
    wg > 0 ? we / wg : expectedWR(teamR, LEAGUE_AVG_TEAM_R);
  return (ww + k * priorWR) / (wg + k);
};
const pairUnit = (m: RosterId, f: RosterId, k: number) => {
  const u = pairU.get(pairKey(m, f));
  const teamR = teamRating(ratingById(m), ratingById(f));
  return { est: estWR(u, teamR, k), games: u?.recs.length ?? 0, wins: u?.recs.filter((r) => r.won).length ?? 0, u };
};
const singlesUnit = (id: RosterId, k: number) => {
  const u = playerU.get(id)!;
  // singles proxy: player's own on-court results (doubles-derived —
  // almost no singles matches exist, so this is the only evidence)
  const recs = u.recs;
  const { wg, ww, we } = wStats(recs);
  const priorWR = wg > 0 ? we / wg : 0.5;
  const est = (ww + k * priorWR) / (wg + k);
  return { est, games: recs.length, wins: recs.filter((r) => r.won).length, u };
};

// --- Roster summary ---------------------------------------------------------
console.log('='.repeat(100));
console.log('  ROSTER SUMMARY — replayed ratings, opponent-adjusted, recency-weighted (all-time)');
console.log('='.repeat(100));
console.log(
  `${'Player'.padEnd(26)}${'G'.padStart(5)}${'W-L'.padStart(9)}${'WR%'.padStart(6)}` +
    `${'ExpWR%'.padStart(8)}${'Syn'.padStart(6)}${'Replay'.padStart(8)}${'30d'.padStart(7)}${'Trend60'.padStart(8)}${'Clubs'.padStart(6)}`,
);
for (const r of ROSTER) {
  const u = playerU.get(r.id)!;
  const g = u.recs.length;
  const wins = u.recs.filter((x) => x.won).length;
  const wr = g ? (wins / g) * 100 : 0;
  const ewr = g ? (u.recs.reduce((s, x) => s + x.ewr, 0) / g) * 100 : 0;
  const w30 = windowWR(u.recs, 30);
  const w60 = windowWR(u.recs, 60);
  const prior = priorWRof(u.recs);
  const trend =
    w60 && prior != null ? `${Math.round((w60.wr - prior) * 100) >= 0 ? '+' : ''}${Math.round((w60.wr - prior) * 100)}` : '—';
  console.log(
    `${r.label.padEnd(26)}${String(g).padStart(5)}${`${wins}-${g - wins}`.padStart(9)}` +
      `${wr.toFixed(0).padStart(6)}${ewr.toFixed(0).padStart(8)}${String(Math.round(wr - ewr)).padStart(6)}` +
      `${String(ratingById(r.id)).padStart(8)}${(w30 ? `${Math.round(w30.wr * 100)}%` : '—').padStart(7)}` +
      `${trend.padStart(8)}${String(clubs.get(r.id)?.size ?? 0).padStart(6)}`,
  );
}
console.log(`\nSyn = actual WR% − expected WR%. Trend60 = last-60d WR% − prior WR% (needs 10+ prior games).`);

// --- Mixed-pair chemistry ----------------------------------------------------
console.log('\n' + '='.repeat(100));
console.log('  MIXED-PAIR CHEMISTRY (M x F among roster) — recency-weighted');
console.log('='.repeat(100));
console.log(
  `${'Pair'.padEnd(40)}${'G'.padStart(4)}${'W-L'.padStart(9)}${'WR%'.padStart(6)}` +
    `${'wWR%'.padStart(7)}${'Syn'.padStart(6)}${'AvgDiff'.padStart(9)}${'Opps'.padStart(6)}${'Last played'.padStart(22)}`,
);
const men = ROSTER.filter((r) => r.gender === 'M');
const women = ROSTER.filter((r) => r.gender === 'F');
for (const m of men) {
  for (const w of women) {
    const u = pairU.get(pairKey(m.id, w.id));
    if (!u || !u.recs.length) {
      console.log(`${m.id} + ${w.id}`.padEnd(40) + '  -- no shared games --');
      continue;
    }
    const g = u.recs.length;
    const wins = u.recs.filter((r) => r.won).length;
    const wr = (wins / g) * 100;
    const ewr = u.recs.reduce((s, r) => s + r.ewr, 0) / g * 100;
    const { ww, wg } = wStats(u.recs);
    const wwr = wg ? (ww / wg) * 100 : wr;
    const avgDiff = u.pointDiff / g;
    console.log(
      `${m.id} + ${w.id}`.padEnd(40) +
        `${g}`.padStart(4) + `${wins}-${g - wins}`.padStart(9) +
        `${wr.toFixed(0)}`.padStart(6) + `${wwr.toFixed(0)}`.padStart(7) +
        `${Math.round(wr - ewr)}`.padStart(6) + `${avgDiff.toFixed(1)}`.padStart(9) +
        `${u.opponents!.size}`.padStart(6) + ` ${u.lastPlayed!.slice(0, 10)}`.padStart(22),
    );
  }
}

// --- Head-to-head inside the roster -------------------------------------------
console.log('\n' + '='.repeat(100));
console.log('  ROSTER INTERNAL MATCHUPS (played against each other)');
console.log('='.repeat(100));
const h2hList = [...h2h.values()].filter((h) => h.games > 0).sort((a, b) => b.games - a.games);
if (!h2hList.length) console.log('  none');
for (const h of h2hList) {
  console.log(
    `  ${label(h.a)} vs ${label(h.b)}: ${h.games}G — ` +
      `${label(h.a)} ${h.aWins}W / ${label(h.b)} ${h.games - h.aWins}W`,
  );
}

// --- Combo enumeration ---------------------------------------------------------
type Combo = {
  k: number; score: number; ms: RosterId; fs: RosterId;
  pairs: { m: RosterId; f: RosterId; est: number; games: number; wins: number }[];
  proven: number; minGames: number;
};

function enumerate(k: number, requireProven: boolean): Combo[] {
  const out: Combo[] = [];
  const pick3 = <T,>(arr: readonly T[]): T[][] => {
    const res: T[][] = [];
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++)
      for (let l = j + 1; l < arr.length; l++)
        res.push([arr[i]!, arr[j]!, arr[l]!]);
    return res;
  };
  const perms = <T,>(arr: readonly T[]): T[][] => {
    if (arr.length <= 1) return [arr as T[]];
    const res: T[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const p of perms(rest)) res.push([arr[i]!, ...p]);
    }
    return res;
  };

  for (const ms of men) {
    for (const fs of women) {
      const remM = men.filter((x) => x.id !== ms.id);
      const remF = women.filter((x) => x.id !== fs.id);
      for (const m3 of pick3(remM)) {
        for (const f3 of pick3(remF)) {
          for (const perm of perms(f3)) {
            const pairs = m3.map((m, i) => {
              const f = perm[i]!;
              const pu = pairUnit(m.id, f.id, k);
              return { m: m.id, f: f.id, est: pu.est, games: pu.games, wins: pu.wins };
            });
            const proven = pairs.filter((p) => p.games >= 3).length;
            const minGames = Math.min(...pairs.map((p) => p.games));
            if (requireProven && proven < 3) continue;
            const score =
              singlesUnit(ms.id, k).est + singlesUnit(fs.id, k).est +
              pairs.reduce((s, p) => s + p.est, 0);
            out.push({ k, score, ms: ms.id, fs: fs.id, pairs, proven, minGames });
          }
        }
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function printCombos(title: string, combos: Combo[], n: number) {
  console.log('\n' + '='.repeat(100));
  console.log(`  ${title}`);
  console.log('='.repeat(100));
  for (const [i, c] of combos.slice(0, n).entries()) {
    console.log(
      `\n#${i + 1}  expected wins ${c.score.toFixed(3)}   proven pairs ${c.proven}/3  min pair games ${c.minGames}`,
    );
    console.log(`  M singles : ${label(c.ms)}`);
    console.log(`  F singles : ${label(c.fs)}`);
    for (const p of c.pairs) {
      const u = pairU.get(pairKey(p.m, p.f));
      const extra = u && u.recs.length
        ? `${u.recs.length}G ${u.recs.filter((r) => r.won).length}W  last ${u.lastPlayed!.slice(0, 10)}`
        : 'no shared games';
      console.log(`  Mixed     : ${label(p.m)} + ${label(p.f)}  [${extra}]`);
    }
  }
}

for (const k of [3, 6, 12]) {
  printCombos(`TOP LINEUPS — recency-weighted, shrinkage k=${k}`, enumerate(k, false), 8);
}
printCombos('TOP LINEUPS — proven-only (all pairs >= 3 shared games), k=6', enumerate(6, true), 8);
