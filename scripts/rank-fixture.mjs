/**
 * Rank a fixture CSV through the current production algorithm:
 *   flat-1450 seeds, K=64 doubles, log margin 0.15, partner gap 0.5,
 *   autocorr 1000, 8 iterated passes, shrinkage n/(n+12).
 * Dedupes by match_key before replaying.
 *
 * Run: node scripts/rank-fixture.mjs <fixture.csv> [topN]
 */
import { loadFixture } from './lib/loadFixtures.mjs';
import { replay, DEFAULT_PARAMS, playerKey } from './lib/replayEngine.mjs';

const PROD_PARAMS = {
  ...DEFAULT_PARAMS,
  kSingles: 36,
  kDoubles: 64,
  movMode: 'log',
  marginWeight: 0.15,
  partnerGapFactor: 0.5,
  autocorrScale: 1000,
};
const PASSES = 8;
const C = 12;

const fixture = process.argv[2] || 'completed_matches_20261005.csv';
const TOP_N = parseInt(process.argv[3] || '40', 10);

const data = loadFixture(fixture);

// Dedupe by match_key
const seen = new Set();
const matches = [];
for (const m of [...data.competitive, ...data.nonCompetitive]) {
  const key = m.matchKey || m.matchId;
  if (seen.has(key)) continue;
  seen.add(key);
  matches.push(m);
}
matches.sort((a, b) => {
  const da = new Date(a.date).getTime();
  const db = new Date(b.date).getTime();
  if (da !== db) return da - db;
  return (a.matchKey || '') < (b.matchKey || '') ? -1 : 1;
});

console.log(`Deduped: ${data.competitive.length + data.nonCompetitive.length} -> ${matches.length} unique matches`);

// 8-pass iterated replay (production rankingPasses)
let work = matches.map((m) => ({
  ...m,
  teamA: m.teamA.map((p) => ({ ...p })),
  teamB: m.teamB.map((p) => ({ ...p })),
}));
let res;
for (let i = 0; i < PASSES; i++) {
  res = replay(work, PROD_PARAMS, { seedMode: i === 0 ? 'flat' : 'snapshot' });
  if (i < PASSES - 1) {
    for (const m of work) {
      for (const p of [...m.teamA, ...m.teamB]) {
        const pl = res.players[playerKey(p)];
        if (pl) p.rating = pl.rating;
      }
    }
  }
}

// Shrinkage toward seed
for (const p of Object.values(res.players)) {
  const n = p.matchesPlayed;
  if (n > 0) {
    p.rating = Math.round(p.initialRating + (p.rating - p.initialRating) * (n / (n + C)));
  }
}

// Production rank ordering
const board = Object.values(res.players).sort((a, b) => {
  if (b.rating !== a.rating) return b.rating - a.rating;
  if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
  const wrA = a.matchesPlayed ? a.wins / a.matchesPlayed : 0;
  const wrB = b.matchesPlayed ? b.wins / b.matchesPlayed : 0;
  if (wrB !== wrA) return wrB - wrA;
  if (b.wins !== a.wins) return b.wins - a.wins;
  return a.username < b.username ? -1 : a.username > b.username ? 1 : 0;
});

const PROV = 12;
console.log(`\nTop ${TOP_N} (– = provisional <${PROV} rated games):\n`);
console.log('  #   rating   G  W-L    name');
board.slice(0, TOP_N).forEach((p, i) => {
  const prov = p.matchesPlayed < PROV ? '–' : ' ';
  const name = `${p.firstName || p.name || p.username} ${p.lastName || ''}`.trim();
  console.log(
    `  ${String(i + 1).padStart(2)}${prov} ${String(p.rating).padStart(5)}  ${String(p.matchesPlayed).padStart(2)}G ` +
    `${String(p.wins).padStart(2)}W${String(p.losses).padStart(2)}L  ${name}`,
  );
});
console.log(`\nTotal players: ${board.length}`);
