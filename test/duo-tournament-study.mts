import { readFileSync } from 'fs';
import { resolve } from 'path';
import { replayMatchesForRanking } from '../src/utils/ratingReplay';

const SHRINKAGE_GAMES = 10,
  RECENCY_DECAY = 0.05,
  MARGIN_SCALE = 0.04,
  MARGIN_TO_RATING = 5,
  DIVERSITY_FLOOR = 0.85,
  MIN_GAMES = 3;
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

// More careful classification
function inferGender(firstName: string): 'M' | 'F' | '?' {
  const name = (firstName || '').toLowerCase().trim();
  if (!name) return '?';

  // Explicit female names (Filipino context, user-confirmed)
  const females = new Set([
    'aira',
    'aira jane',
    'beverly',
    'cassandra',
    'carylle',
    'cherie',
    'cyrielle',
    'datagirl',
    'datagirl',
    'ednalyn',
    'ela',
    'gemma',
    'hazel',
    'immaculada',
    'jaira',
    'j-ann',
    'jeacel',
    'jel',
    'jeunice',
    'joy',
    'kang',
    'kim',
    'lucille',
    'luv',
    'margo',
    'mariel',
    'marienel',
    'marivic',
    'mikki',
    'naomi',
    'nathalie',
    'nieka',
    'nishiki',
    'osang',
    'princess gean',
    'reyna',
    'ronica',
    'seong',
    'she',
    'raine',
    'rose',
    'bence czarina',
    'cara',
    'vilma',
    'vilmz',
  ]);

  // Explicit male names (Filipino context, user-confirmed)
  const males = new Set([
    'james',
    'obal',
    'shirwin',
    'tristan',
    'lenz',
    'art',
    'timot',
    'ace',
    'joven',
    'miguel',
    'boyet',
    'jeyster',
    'darell',
    'mac',
    'marc johnuel',
    'anton',
    'dee',
    'jaymar',
    'jeovanni',
    'ncrenson',
    'tommy',
    'jodee',
    'froi',
    'aries',
    'josue',
    'matthew brian',
    'solomon',
    'andres',
    'randy',
    'rc',
    'jhem',
    'richard',
    'joyner',
    'edrian',
    'karl angelo s',
    'peter',
    'louis',
    'alejandro',
    'panzer',
    'chester',
    'jigz',
    'shem',
    'joel ivan',
    'jeremiah',
    'clyde philip',
    'jonathan',
    'manso',
    'eymard jan',
    'ydnar',
    'ydnar🖤',
    'trin',
    'neo',
    'klentier manuel',
    'bho',
    'kermet',
    'sandro',
    'niño',
    'johann louis',
    'joshua pepito',
    'cymon',
    'marc luigi',
    'tenten',
    'rands',
    'marc',
    'johnuel',
    'humangit',
    'catalan',
    'manganaan',
    'aquino',
    'gatchallan',
    'pastoral',
    'de castro',
    'fernandez',
    'regatcho',
    'luna',
    'marata',
    'disu',
    'ramos',
    'guntang',
    'palaylay',
    'catan',
    'frost',
    'mejia',
    'querimit',
    'dela cruz',
    'gatchalian',
    'jairus',
    'jeo',
    'kay tan',
    'romel',
    'rommel',
    'aaron chester',
    'angelo',
    'marco',
    'johann',
    'pepito',
    'luigi',
    'nomolos',
  ]);

  if (females.has(name)) return 'F';
  if (males.has(name)) return 'M';

  // Heuristics for names not in the lists
  if (
    name.endsWith('lyn') ||
    name.endsWith('elle') ||
    name.endsWith('ice') ||
    name.endsWith('ine') ||
    name.endsWith('ie') ||
    name.endsWith('da') ||
    name.endsWith('na') ||
    name === 'she' ||
    name === 'kim'
  ) {
    return 'F';
  }
  if (
    name.endsWith('o') ||
    name.endsWith('s') ||
    name.endsWith('d') ||
    name.endsWith('r') ||
    name.endsWith('l')
  ) {
    return 'M';
  }

  return '?';
}

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
      level: p.level as any,
      rating: p.rating,
      avatar: '',
    })),
    teamB: m.team_b.map((p: any) => ({
      userId: p.userId,
      username: p.username,
      name: p.firstName,
      firstName: p.firstName,
      lastName: p.lastName,
      level: p.level as any,
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
    const g1 = inferGender(p1.firstName || p1.username || '');
    const g2 = inferGender(p2.firstName || p2.username || '');
    const cat =
      g1 === 'M' && g2 === 'M'
        ? 'MM'
        : g1 === 'F' && g2 === 'F'
          ? 'FF'
          : (g1 === 'M' && g2 === 'F') || (g1 === 'F' && g2 === 'M')
            ? 'MF'
            : '??';
    entries.push({
      p1: p1.firstName || p1.username,
      p2: p2.firstName || p2.username,
      g1,
      g2,
      cat,
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
      r1: gR(p1),
      r2: gR(p2),
    });
  }
  entries.sort((a, b) => b.ds - a.ds);
  return entries;
}

// Load and run
// Siklab Pickleball Club: competitive matches only (exclude variety_first, fair_balance)
// Siklab Tryout: all matches (including non-competitive)
const NON_COMPETITIVE_MODES = new Set(['variety_first', 'fair_balance']);
const spcAll = load('siklab-pickleball-club');
const spc = spcAll.filter(
  (m: any) => !NON_COMPETITIVE_MODES.has(m.meta?.matchmakingMode || ''),
);
const st = load('siklab-tryout');
const combined = [...spc, ...st];

console.log(
  `Siklab Pickleball Club: ${spc.length} competitive matches (of ${spcAll.length} total)`,
);
console.log(
  `Siklab Tryout: ${st.length} matches (all, including non-competitive)`,
);
console.log(`Combined: ${combined.length} matches`);

// Count games per player
const playerGameCounts = new Map<string, number>();
for (const m of combined) {
  for (const p of [...(m.team_a || []), ...(m.team_b || [])]) {
    const key = pk(p);
    playerGameCounts.set(key, (playerGameCounts.get(key) || 0) + 1);
  }
}

const MIN_PLAYER_GAMES = 12;
const eligiblePlayerKeys = new Set<string>();
for (const [key, count] of playerGameCounts) {
  if (count >= MIN_PLAYER_GAMES) eligiblePlayerKeys.add(key);
}
console.log(
  `\nPlayers with ${MIN_PLAYER_GAMES}+ games: ${eligiblePlayerKeys.size} of ${playerGameCounts.size} total`,
);

const entries = run(combined, true);

// Filter duos: both players must have 12+ games
const eligibleEntries = entries.filter((e) => {
  // Reconstruct player keys from the duo entry
  // We stored p1/p2 as display names; need to check via the entries' player keys
  return e.key.split('|').every((k: string) => eligiblePlayerKeys.has(k));
});

console.log(
  `Duos where both players have ${MIN_PLAYER_GAMES}+ games: ${eligibleEntries.length} of ${entries.length} total`,
);

// Classify
const mens = eligibleEntries.filter((e) => e.cat === 'MM');
const womens = eligibleEntries.filter((e) => e.cat === 'FF');
const mixed = eligibleEntries.filter((e) => e.cat === 'MF');

console.log(`\n${'='.repeat(100)}`);
console.log(
  '  PLAYER GENDER CLASSIFICATION (inferred from Filipino first names)',
);
console.log(`${'='.repeat(100)}\n`);

// Count games per player (by display name)
const playerGameCountsByName = new Map<string, number>();
for (const m of combined) {
  for (const p of [...(m.team_a || []), ...(m.team_b || [])]) {
    const name = p.firstName || p.username || '';
    playerGameCountsByName.set(
      name,
      (playerGameCountsByName.get(name) || 0) + 1,
    );
  }
}

// List all unique players with their inferred gender (only eligible 12+ games)
const playerGenders = new Map<
  string,
  { name: string; gender: string; rating: number; games: number }
>();
for (const e of eligibleEntries) {
  if (!playerGenders.has(e.p1))
    playerGenders.set(e.p1, {
      name: e.p1,
      gender: e.g1,
      rating: e.r1,
      games: playerGameCountsByName.get(e.p1) || 0,
    });
  if (!playerGenders.has(e.p2))
    playerGenders.set(e.p2, {
      name: e.p2,
      gender: e.g2,
      rating: e.r2,
      games: playerGameCountsByName.get(e.p2) || 0,
    });
}
const males = [...playerGenders.values()]
  .filter((p) => p.gender === 'M')
  .sort((a, b) => b.rating - a.rating);
const females = [...playerGenders.values()]
  .filter((p) => p.gender === 'F')
  .sort((a, b) => b.rating - a.rating);
const unknowns = [...playerGenders.values()]
  .filter((p) => p.gender === '?')
  .sort((a, b) => b.rating - a.rating);

console.log(`Men (${males.length}, min ${MIN_PLAYER_GAMES} games):`);
males.forEach((p, i) =>
  console.log(
    `  ${i + 1}. ${p.name.padEnd(25)} rating ${p.rating}  (${p.games} games)`,
  ),
);
console.log(`\nWomen (${females.length}, min ${MIN_PLAYER_GAMES} games):`);
females.forEach((p, i) =>
  console.log(
    `  ${i + 1}. ${p.name.padEnd(25)} rating ${p.rating}  (${p.games} games)`,
  ),
);
console.log(`\nUnknown (${unknowns.length}):`);
unknowns.forEach((p, i) =>
  console.log(
    `  ${i + 1}. ${p.name.padEnd(25)} rating ${p.rating}  (${p.games} games)`,
  ),
);

console.log(`\n${'='.repeat(100)}`);
console.log(
  `  DUO CATEGORIES — Combined Siklab (${combined.length} matches, ${eligibleEntries.length} eligible duos)`,
);
console.log(`${'='.repeat(100)}`);
console.log(`  Men's Doubles (M+M): ${mens.length} duos`);
console.log(`  Women's Doubles (F+F): ${womens.length} duos`);
console.log(`  Mixed Doubles (M+F): ${mixed.length} duos`);
console.log(`  Unknown: ${unknowns.length} duos`);

// Top Men's Doubles
console.log(`\n${'='.repeat(100)}`);
console.log("  TOP MEN'S DOUBLES (for Game 1)");
console.log(`${'='.repeat(100)}\n`);
console.log(
  'Rank | Duo                              | Score  | G  | W  | L  | WR%  | Syn | TeamRtg',
);
console.log('-'.repeat(95));
mens.slice(0, 15).forEach((e, i) => {
  const duo = `${e.p1} & ${e.p2}`.padEnd(30).slice(0, 30);
  console.log(
    `${String(i + 1).padStart(4)} | ${duo} | ${String(e.ds).padStart(6)} | ${String(e.games).padStart(2)} | ${String(e.wins).padStart(2)} | ${String(e.losses).padStart(2)} | ${String(e.wr).padStart(4)}% | ${String(e.syn).padStart(3)} | ${String(e.cr).padStart(7)}`,
  );
});

// Top Women's Doubles
console.log(`\n${'='.repeat(100)}`);
console.log("  TOP WOMEN'S DOUBLES (for Game 2)");
console.log(`${'='.repeat(100)}\n`);
console.log(
  'Rank | Duo                              | Score  | G  | W  | L  | WR%  | Syn | TeamRtg',
);
console.log('-'.repeat(95));
womens.slice(0, 15).forEach((e, i) => {
  const duo = `${e.p1} & ${e.p2}`.padEnd(30).slice(0, 30);
  console.log(
    `${String(i + 1).padStart(4)} | ${duo} | ${String(e.ds).padStart(6)} | ${String(e.games).padStart(2)} | ${String(e.wins).padStart(2)} | ${String(e.losses).padStart(2)} | ${String(e.wr).padStart(4)}% | ${String(e.syn).padStart(3)} | ${String(e.cr).padStart(7)}`,
  );
});

// Top Mixed Doubles
console.log(`\n${'='.repeat(100)}`);
console.log('  TOP MIXED DOUBLES (for Games 3-5)');
console.log(`${'='.repeat(100)}\n`);
console.log(
  'Rank | Duo                              | Score  | G  | W  | L  | WR%  | Syn | TeamRtg',
);
console.log('-'.repeat(95));
mixed.slice(0, 20).forEach((e, i) => {
  const duo = `${e.p1} & ${e.p2}`.padEnd(30).slice(0, 30);
  console.log(
    `${String(i + 1).padStart(4)} | ${duo} | ${String(e.ds).padStart(6)} | ${String(e.games).padStart(2)} | ${String(e.wins).padStart(2)} | ${String(e.losses).padStart(2)} | ${String(e.wr).padStart(4)}% | ${String(e.syn).padStart(3)} | ${String(e.cr).padStart(7)}`,
  );
});

// Best mixed by synergy (min 3 games)
console.log(`\n${'='.repeat(100)}`);
console.log('  BEST MIXED DOUBLES BY SYNERGY (min 2 games)');
console.log(`${'='.repeat(100)}\n`);
const mixedSyn = mixed
  .filter((e) => e.games >= 2)
  .sort((a, b) => b.syn - a.syn);
mixedSyn.slice(0, 15).forEach((e, i) => {
  console.log(
    `  ${i + 1}. ${e.p1} & ${e.p2} — synergy ${e.syn} (raw ${e.rawSyn}), ${e.games}G, ${e.wins}W ${e.losses}L, ${e.wr}% WR, score ${e.ds}`,
  );
});

// Best mixed by win rate (min 2 games)
console.log(`\n${'='.repeat(100)}`);
console.log('  BEST MIXED DOUBLES BY WIN RATE (min 2 games)');
console.log(`${'='.repeat(100)}\n`);
const mixedWR = mixed
  .filter((e) => e.games >= 2)
  .sort((a, b) => b.wr - a.wr || b.games - a.games);
mixedWR.slice(0, 15).forEach((e, i) => {
  console.log(
    `  ${i + 1}. ${e.p1} & ${e.p2} — ${e.wr}% WR (${e.wins}W ${e.losses}L in ${e.games}G), synergy ${e.syn}, score ${e.ds}`,
  );
});

// Suggest 3 combinations
console.log(`\n${'='.repeat(100)}`);
console.log('  TOURNAMENT SUGGESTIONS — 3 COMBINATIONS');
console.log(`${'='.repeat(100)}`);

// Get top players by rating for each gender
const topMen = males.slice(0, 10);
const topWomen = females.slice(0, 10);

console.log('\nTop Men by Rating:');
topMen.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} (${p.rating})`));
console.log('\nTop Women by Rating:');
topWomen.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} (${p.rating})`));

// Combination 1: Anchor gender doubles
console.log(`\n${'='.repeat(100)}`);
console.log('  COMBINATION 1: "Anchor the Gender Doubles"');
console.log(`${'='.repeat(100)}\n`);

const c1_mens = mens[0];
const c1_womens = womens[0];
const c1_used = new Set([
  ...(c1_mens ? [c1_mens.p1, c1_mens.p2] : []),
  ...(c1_womens ? [c1_womens.p1, c1_womens.p2] : []),
]);

// Pick best 3 mixed from available
const c1_mixed: any[] = [];
const c1_used2 = new Set(c1_used);
for (const m of mixed.sort((a, b) => b.ds - a.ds)) {
  if (c1_used2.has(m.p1) || c1_used2.has(m.p2)) continue;
  c1_mixed.push(m);
  c1_used2.add(m.p1);
  c1_used2.add(m.p2);
  if (c1_mixed.length === 3) break;
}

if (c1_mens)
  console.log(
    `Game 1 (Men's):   ${c1_mens.p1} & ${c1_mens.p2} — score ${c1_mens.ds}, ${c1_mens.games}G ${c1_mens.wins}W ${c1_mens.losses}L, syn ${c1_mens.syn}`,
  );
if (c1_womens)
  console.log(
    `Game 2 (Women's): ${c1_womens.p1} & ${c1_womens.p2} — score ${c1_womens.ds}, ${c1_womens.games}G ${c1_womens.wins}W ${c1_womens.losses}L, syn ${c1_womens.syn}`,
  );
c1_mixed.forEach((m, i) => {
  console.log(
    `Game ${i + 3} (Mixed):   ${m.p1} & ${m.p2} — score ${m.ds}, ${m.games}G ${m.wins}W ${m.losses}L, syn ${m.syn}`,
  );
});

// Combination 2: Mixed stack
console.log(`\n${'='.repeat(100)}`);
console.log('  COMBINATION 2: "Mixed Doubles Stack"');
console.log(`${'='.repeat(100)}\n`);

// Pick best 3 mixed first
const c2_mixed: any[] = [];
const c2_used = new Set<string>();
for (const m of mixed.sort((a, b) => b.ds - a.ds)) {
  if (c2_used.has(m.p1) || c2_used.has(m.p2)) continue;
  c2_mixed.push(m);
  c2_used.add(m.p1);
  c2_used.add(m.p2);
  if (c2_mixed.length === 3) break;
}

// Then fill men's and women's from remaining

// Best men's duo from remaining
let c2_mens: any = null;
for (const m of mens.sort((a, b) => b.ds - a.ds)) {
  if (c2_used.has(m.p1) || c2_used.has(m.p2)) continue;
  c2_mens = m;
  c2_used.add(m.p1);
  c2_used.add(m.p2);
  break;
}
// Best women's duo from remaining
let c2_womens: any = null;
for (const w of womens.sort((a, b) => b.ds - a.ds)) {
  if (c2_used.has(w.p1) || c2_used.has(w.p2)) continue;
  c2_womens = w;
  c2_used.add(w.p1);
  c2_used.add(w.p2);
  break;
}

if (c2_mens)
  console.log(
    `Game 1 (Men's):   ${c2_mens.p1} & ${c2_mens.p2} — score ${c2_mens.ds}, ${c2_mens.games}G ${c2_mens.wins}W ${c2_mens.losses}L, syn ${c2_mens.syn}`,
  );
if (c2_womens)
  console.log(
    `Game 2 (Women's): ${c2_womens.p1} & ${c2_womens.p2} — score ${c2_womens.ds}, ${c2_womens.games}G ${c2_womens.wins}W ${c2_womens.losses}L, syn ${c2_womens.syn}`,
  );
c2_mixed.forEach((m, i) => {
  console.log(
    `Game ${i + 3} (Mixed):   ${m.p1} & ${m.p2} — score ${m.ds}, ${m.games}G ${m.wins}W ${m.losses}L, syn ${m.syn}`,
  );
});

// Combination 3: Balanced — best synergy mixed + solid gender doubles
console.log(`\n${'='.repeat(100)}`);
console.log('  COMBINATION 3: "Best Synergy Mixed + Solid Gender"');
console.log(`${'='.repeat(100)}\n`);

// Pick mixed by synergy first
const c3_mixed: any[] = [];
const c3_used = new Set<string>();
for (const m of mixed
  .filter((e) => e.games >= 2)
  .sort((a, b) => b.syn - a.syn || b.ds - a.ds)) {
  if (c3_used.has(m.p1) || c3_used.has(m.p2)) continue;
  c3_mixed.push(m);
  c3_used.add(m.p1);
  c3_used.add(m.p2);
  if (c3_mixed.length === 3) break;
}

// Then fill men's and women's from remaining
let c3_mens: any = null;
for (const m of mens.sort((a, b) => b.ds - a.ds)) {
  if (c3_used.has(m.p1) || c3_used.has(m.p2)) continue;
  c3_mens = m;
  c3_used.add(m.p1);
  c3_used.add(m.p2);
  break;
}
let c3_womens: any = null;
for (const w of womens.sort((a, b) => b.ds - a.ds)) {
  if (c3_used.has(w.p1) || c3_used.has(w.p2)) continue;
  c3_womens = w;
  c3_used.add(w.p1);
  c3_used.add(w.p2);
  break;
}

if (c3_mens)
  console.log(
    `Game 1 (Men's):   ${c3_mens.p1} & ${c3_mens.p2} — score ${c3_mens.ds}, ${c3_mens.games}G ${c3_mens.wins}W ${c3_mens.losses}L, syn ${c3_mens.syn}`,
  );
if (c3_womens)
  console.log(
    `Game 2 (Women's): ${c3_womens.p1} & ${c3_womens.p2} — score ${c3_womens.ds}, ${c3_womens.games}G ${c3_womens.wins}W ${c3_womens.losses}L, syn ${c3_womens.syn}`,
  );
c3_mixed.forEach((m, i) => {
  console.log(
    `Game ${i + 3} (Mixed):   ${m.p1} & ${m.p2} — score ${m.ds}, ${m.games}G ${m.wins}W ${m.losses}L, syn ${m.syn}`,
  );
});

// Pros and cons
console.log(`\n${'='.repeat(100)}`);
console.log('  PROS & CONS');
console.log(`${'='.repeat(100)}`);

console.log(`
COMBINATION 1: "Anchor the Gender Doubles"
PROS:
- Locks in your 2 safest wins with best same-gender pairings
- Mixed games use cross-gender pairings from remaining pool
- If your strongest duos are same-gender, this maximizes their value
CONS:
- Mixed games get the "leftover" players — potentially weaker pairings
- If your depth is thin, 3 mixed games become liabilities
- No control over mixed chemistry — pairings are based on who's left

COMBINATION 2: "Mixed Doubles Stack"
PROS:
- Best mixed-doubles pairings get your top talent
- You win 3 of 5 games — only need to steal 1 more for the match
- Cross-gender pairings leverage any mixed-doubles chemistry
CONS:
- You're conceding Games 1 and 2 — if opponent stacks gender doubles too, you go down 0-2
- Psychological pressure: team must win all 3 mixed games
- If any mixed pairing underperforms, there's no margin for error

COMBINATION 3: "Best Synergy Mixed + Solid Gender"
PROS:
- Mixed pairings chosen by SYNERGY (overperformance vs expectation), not just rating
- Most proven mixed duos with actual chemistry get priority
- Gender doubles still get solid pairings from remaining pool
- Balances chemistry with competitiveness across all 5 games
CONS:
- Synergy scores may be noisy with small sample sizes (2-3 games)
- May not use your highest-rated players in mixed if they lack synergy data
- Gender doubles may be slightly weaker since top mixed players are used first
`);
