import { readFileSync } from 'fs';
import { resolve } from 'path';
import { replayMatchesForRanking } from '../src/utils/ratingReplay';

const SHRINKAGE_GAMES = 10,
  RECENCY_DECAY = 0.05,
  MARGIN_SCALE = 0.04,
  MARGIN_TO_RATING = 5,
  DIVERSITY_FLOOR = 0.85,
  MIN_GAMES = 2;
const pk = (p: any) => p.userId || p.username || `g:${p.firstName || ''}`;
const ctr = (r1: number, r2: number) => {
  const h = 2 / (1 / Math.max(1, r1) + 1 / Math.max(1, r2));
  return h * 0.6 + ((r1 + r2) / 2) * 0.4;
};
const rw = (at: string, now: number) => {
  const d = Math.max(0, (now - new Date(at).getTime()) / 86400000);
  return Math.exp(-RECENCY_DECAY * d);
};
const ewr = (tr: number, opr: number) =>
  1 / (1 + Math.pow(10, -(tr - opr) / 400));
const em = (tr: number, opr: number) => (tr - opr) * MARGIN_SCALE;

function load(name: string) {
  return JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        'test',
        'fixtures',
        `completed_matches_${name}_60d.json`,
      ),
      'utf8',
    ),
  );
}

function run(matches: any[], inc: boolean) {
  const ri = matches.map((m: any) => ({
    teamAScore: m.team_a_score,
    teamBScore: m.team_b_score,
    matchKey: m.match_key,
    completedAt: m.completed_at,
    matchmakingMode: m.meta?.matchmakingMode,
    teamA: m.team_a.map((p: any) => ({
      userId: p.userId,
      username: p.username,
      name: p.firstName,
      firstName: p.firstName,
      lastName: p.lastName,
      level: p.level,
      rating: p.rating,
      avatar: '',
    })),
    teamB: m.team_b.map((p: any) => ({
      userId: p.userId,
      username: p.username,
      name: p.firstName,
      firstName: p.firstName,
      lastName: p.lastName,
      level: p.level,
      rating: p.rating,
      avatar: '',
    })),
  }));
  const rep = replayMatchesForRanking(ri, inc);
  const rm = new Map<string, number>();
  for (const [k, p] of Object.entries(rep)) rm.set(k, (p as any).rating);
  const gR = (p: any) => rm.get(pk(p)) || 1450;

  const now = Date.now();
  const dm = new Map<string, any>();
  for (const m of matches) {
    const ta = m.team_a || [],
      tb = m.team_b || [];
    if (ta.length !== 2 || tb.length !== 2) continue;
    const aWon = m.team_a_score > m.team_b_score;
    const trA = ctr(gR(ta[0]), gR(ta[1])),
      trB = ctr(gR(tb[0]), gR(tb[1]));
    const w = rw(m.completed_at, now);
    for (const s of [
      {
        t: ta,
        w: aWon,
        sf: m.team_a_score,
        sa: m.team_b_score,
        o: tb,
        otr: trB,
      },
      {
        t: tb,
        w: !aWon,
        sf: m.team_b_score,
        sa: m.team_a_score,
        o: ta,
        otr: trA,
      },
    ]) {
      const [p1, p2] = s.t;
      const key = [pk(p1), pk(p2)].sort().join('|');
      const ok = [pk(s.o[0]), pk(s.o[1])].sort().join('|');
      if (!dm.has(key))
        dm.set(key, {
          games: 0,
          wins: 0,
          losses: 0,
          pd: 0,
          ttr: 0,
          ew: 0,
          em: 0,
          cg: 0,
          cw: 0,
          players: s.t,
          opp: new Map(),
          rws: 0,
          rwn: 0,
        });
      const d = dm.get(key);
      d.games++;
      if (s.w) d.wins++;
      else d.losses++;
      d.pd += s.sf - s.sa;
      const tr = ctr(gR(p1), gR(p2));
      d.ttr += tr;
      d.ew += ewr(tr, s.otr);
      d.em += em(tr, s.otr);
      d.rws += w;
      d.rwn += s.w ? w : 0;
      const diff = Math.abs(s.sf - s.sa);
      if (diff <= 2) {
        d.cg++;
        if (s.w) d.cw++;
      }
      d.opp.set(ok, (d.opp.get(ok) || 0) + 1);
    }
  }

  const entries: any[] = [];
  for (const [, d] of dm) {
    if (d.games < MIN_GAMES) continue;
    const [p1, p2] = d.players;
    const key = [pk(p1), pk(p2)].sort().join('|');
    const wr = d.wins / d.games,
      e = d.ew / d.games;
    const rawSyn = Math.round((wr - e) * 100),
      cr = Math.round(d.ttr / d.games);
    const sf = Math.min(1, d.games / SHRINKAGE_GAMES),
      syn = Math.round(rawSyn * sf);
    const rwr = d.rws > 0 ? d.rwn / d.rws : wr,
      form = Math.round((rwr - wr) * 100),
      fb = form * 2.5;
    const am = d.pd / d.games,
      emv = d.em / d.games,
      mr = am - emv,
      mp = Math.round(mr * 10) / 10,
      mb = mr * MARGIN_TO_RATING;
    const uo = d.opp.size,
      df = DIVERSITY_FLOOR + (1 - DIVERSITY_FLOOR) * (uo / d.games);
    const sb = syn * 4,
      ds = (cr + sb + fb + mb) * df;
    entries.push({
      p1: p1.firstName || p1.username,
      p2: p2.firstName || p2.username,
      key,
      games: d.games,
      wins: d.wins,
      losses: d.losses,
      wr: Math.round(wr * 100),
      syn,
      rawSyn,
      cr,
      form,
      mp,
      df: Math.round(df * 100) / 100,
      ds: Math.round(ds * 10) / 10,
      uo,
    });
  }
  entries.sort((a, b) => b.ds - a.ds);
  return entries;
}

// --- Siklab Pickleball Club ---
const spc = load('siklab-pickleball-club');
console.log(`\n${'='.repeat(120)}`);
console.log(
  `  SIKLAB PICKLEBALL CLUB — ${spc.length} matches — includeNonCompetitive=true`,
);
console.log(`${'='.repeat(120)}\n`);

const spcEntries = run(spc, true);
console.log(`Total duos (2+ games): ${spcEntries.length}\n`);
console.log(
  'Rank | Duo                              | Score  | G  | W  | L  | WR%  | Syn | RawSyn | TeamRtg | Form | Margin | Div  | UnqOpp',
);
console.log('-'.repeat(130));
spcEntries.forEach((e, i) => {
  const duo = `${e.p1} & ${e.p2}`.padEnd(30).slice(0, 30);
  console.log(
    `${String(i + 1).padStart(4)} | ${duo} | ${String(e.ds).padStart(6)} | ${String(e.games).padStart(2)} | ${String(e.wins).padStart(2)} | ${String(e.losses).padStart(2)} | ${String(e.wr).padStart(4)}% | ${String(e.syn).padStart(3)} | ${String(e.rawSyn).padStart(6)} | ${String(e.cr).padStart(7)} | ${String(e.form).padStart(4)} | ${String(e.mp).padStart(6)} | ${String(e.df).padStart(4)} | ${String(e.uo).padStart(3)}`,
  );
});

// --- Combined Siklab (both clubs) ---
const st = load('siklab-tryout');
const combined = [...spc, ...st];
console.log(`\n${'='.repeat(120)}`);
console.log(
  `  COMBINED SIKLAB (Pickleball Club + Tryout) — ${combined.length} matches — includeNonCompetitive=true`,
);
console.log(`${'='.repeat(120)}\n`);

const combinedEntries = run(combined, true);
console.log(`Total duos (2+ games): ${combinedEntries.length}\n`);
console.log(
  'Rank | Duo                              | Score  | G  | W  | L  | WR%  | Syn | RawSyn | TeamRtg | Form | Margin | Div  | UnqOpp',
);
console.log('-'.repeat(130));
combinedEntries.forEach((e, i) => {
  const duo = `${e.p1} & ${e.p2}`.padEnd(30).slice(0, 30);
  console.log(
    `${String(i + 1).padStart(4)} | ${duo} | ${String(e.ds).padStart(6)} | ${String(e.games).padStart(2)} | ${String(e.wins).padStart(2)} | ${String(e.losses).padStart(2)} | ${String(e.wr).padStart(4)}% | ${String(e.syn).padStart(3)} | ${String(e.rawSyn).padStart(6)} | ${String(e.cr).padStart(7)} | ${String(e.form).padStart(4)} | ${String(e.mp).padStart(6)} | ${String(e.df).padStart(4)} | ${String(e.uo).padStart(3)}`,
  );
});

// --- Analysis ---
console.log(`\n${'='.repeat(120)}`);
console.log('  ANALYSIS — Combined Siklab Best Duos');
console.log(`${'='.repeat(120)}\n`);

const top10c = combinedEntries.slice(0, 10);
console.log('Top duos by duoScore:');
top10c.forEach((e, i) => {
  console.log(
    `  ${i + 1}. ${e.p1} & ${e.p2} — ${e.ds} (${e.games}G, ${e.wins}W ${e.losses}L, ${e.wr}% WR, synergy ${e.syn}, team ${e.cr})`,
  );
});

// Most established duos (by games played, min 4)
console.log('\nMost established duos (by games played, min 4):');
const establishedC = combinedEntries
  .filter((e) => e.games >= 4)
  .sort((a, b) => b.games - a.games)
  .slice(0, 10);
establishedC.forEach((e, i) => {
  console.log(
    `  ${i + 1}. ${e.p1} & ${e.p2} — ${e.games}G, ${e.wins}W ${e.losses}L, ${e.wr}% WR, score ${e.ds}, synergy ${e.syn}`,
  );
});

// Best by win rate (min 3 games)
console.log('\nBest win rate (min 3 games):');
const byWRc = combinedEntries
  .filter((e) => e.games >= 3)
  .sort((a, b) => b.wr - a.wr || b.games - a.games)
  .slice(0, 10);
byWRc.forEach((e, i) => {
  console.log(
    `  ${i + 1}. ${e.p1} & ${e.p2} — ${e.wr}% WR (${e.wins}W ${e.losses}L in ${e.games}G), score ${e.ds}, synergy ${e.syn}`,
  );
});

// Best by synergy (min 3 games)
console.log('\nBest synergy (min 3 games):');
const bySynC = combinedEntries
  .filter((e) => e.games >= 3)
  .sort((a, b) => b.syn - a.syn)
  .slice(0, 10);
bySynC.forEach((e, i) => {
  console.log(
    `  ${i + 1}. ${e.p1} & ${e.p2} — synergy ${e.syn} (raw ${e.rawSyn}), ${e.games}G, ${e.wr}% WR, score ${e.ds}`,
  );
});

// Compare: duos that appear in combined but not in SPC-only
console.log('\nNew duos from Tryout (in combined but not SPC-only):');
const spcDuoKeys = new Set(spcEntries.map((e) => e.key));
const newFromTryout = combinedEntries.filter((e) => !spcDuoKeys.has(e.key));
newFromTryout.forEach((e, i) => {
  console.log(
    `  ${i + 1}. ${e.p1} & ${e.p2} — ${e.ds} (${e.games}G, ${e.wins}W ${e.losses}L, ${e.wr}% WR, synergy ${e.syn})`,
  );
});
