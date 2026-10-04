/**
 * Experiment 6: Partner-attribution direction.
 *
 * When a mismatched pair wins, who gets credited more?
 *   - 'weakPenalty' (production): stronger partner gets the bigger share —
 *     they likely carried the win.
 *   - 'weakBoost' (PickleFriend-style): weaker partner gets the bigger share —
 *     a win tells you more about the player with the lower prior.
 *   - 'off' (partnerGapFactor=0): no partner-gap adjustment.
 *
 * Part A: predictive accuracy (in-sample logLoss, bootstrap CI, 5-fold
 *         walk-forward CV) — the metric used by exp-04/05.
 * Part B: the actual leaderboard — replicates production
 *         replayMatchesForRanking (3-pass iterated seeds + shrinkage C=12)
 *         and rankClubPlayers ordering, then diffs ranks across arms.
 *
 * Run: node scripts/exp-06-partner-split.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadFixture } from './lib/loadFixtures.mjs';
import { replay, DEFAULT_PARAMS, playerKey } from './lib/replayEngine.mjs';
import {
  walkForwardCV,
  scorePredictions,
  bootstrapCI,
} from './lib/evaluate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_PATH = path.join(
  __dirname,
  '..',
  'test',
  'fixtures',
  'exp-06-partner-split-output.txt',
);

const FIXTURE = 'completed_matches_20260824.csv';
const RANKING_PASSES = 3;
const SHRINKAGE_C = 12;

const data = loadFixture(FIXTURE);
const matches = data.competitive;

const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

// ---------- Part A: predictive accuracy ----------
const ARMS = [
  { label: 'A: weakPenalty (PROD)', params: { ...DEFAULT_PARAMS } },
  {
    label: 'B: weakBoost',
    params: { ...DEFAULT_PARAMS, partnerGapDirection: 'weakBoost' },
  },
  {
    label: 'C: no partner adj',
    params: { ...DEFAULT_PARAMS, partnerGapFactor: 0 },
  },
];

function testArm(arm) {
  const full = replay(matches, arm.params);
  const inSample = scorePredictions(full.predictions);
  const ci = bootstrapCI(full.predictions, 500);
  const cv = walkForwardCV(matches, arm.params, {}, 5);
  return {
    arm,
    inSample: inSample.logLoss,
    brier: inSample.brier,
    ciLow: ci.lower,
    ciHigh: ci.upper,
    cvLogLoss: cv.logLossMean,
    cvSd: cv.logLossSd,
  };
}

log('=== EXP-06: PARTNER-ATTRIBUTION DIRECTION ===');
log(`Dataset: ${matches.length} competitive doubles matches from ${FIXTURE}`);
log('Coin-flip logLoss baseline: 0.6931');
log('');

const results = ARMS.map(testArm);
log('--- Predictive accuracy ---');
for (const r of results) {
  log(
    `  ${r.arm.label.padEnd(24)} inSample=${r.inSample.toFixed(4)} [${r.ciLow.toFixed(4)}-${r.ciHigh.toFixed(4)}]  CV=${r.cvLogLoss.toFixed(4)} +/- ${r.cvSd.toFixed(4)}  brier=${r.brier.toFixed(4)}`,
  );
}
log('');

// ---------- Part B: leaderboard replication ----------
// Mirrors replayMatchesForRanking: iterate passes feeding final ratings
// back as seeds, then shrink by n/(n+C) using rated (=all competitive) games.
function leaderboardFor(arm) {
  let work = matches.map((m) => ({
    ...m,
    teamA: m.teamA.map((p) => ({ ...p })),
    teamB: m.teamB.map((p) => ({ ...p })),
  }));
  let result;
  for (let pass = 0; pass < RANKING_PASSES; pass++) {
    result = replay(work, arm.params, { seedMode: 'snapshot' });
    for (const m of work) {
      for (const p of [...m.teamA, ...m.teamB]) {
        const key = playerKey(p);
        if (result.players[key]) p.rating = result.players[key].rating;
      }
    }
  }
  // Bayesian shrinkage toward seed, n/(n+C)
  for (const p of Object.values(result.players)) {
    const n = p.matchesPlayed; // all inputs are competitive = rated
    if (n > 0 && SHRINKAGE_C > 0) {
      p.rating = Math.round(
        p.initialRating +
          (p.rating - p.initialRating) * (n / (n + SHRINKAGE_C)),
      );
    }
  }
  // rankClubPlayers ordering
  return Object.values(result.players).sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.matchesPlayed !== a.matchesPlayed)
      return b.matchesPlayed - a.matchesPlayed;
    const wrA = a.matchesPlayed ? a.wins / a.matchesPlayed : 0;
    const wrB = b.matchesPlayed ? b.wins / b.matchesPlayed : 0;
    if (wrB !== wrA) return wrB - wrA;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.username < b.username ? -1 : a.username > b.username ? 1 : 0;
  });
}

const boards = ARMS.map((arm) => ({ arm, board: leaderboardFor(arm) }));
const TOP_N = 25;

for (const { arm, board } of boards) {
  log(`--- Top ${TOP_N} under ${arm.label} ---`);
  log('  #   rating  W-L    rated  name');
  board.slice(0, TOP_N).forEach((p, i) => {
    log(
      `  ${String(i + 1).padStart(2)}  ${String(p.rating).padStart(5)}  ` +
        `${String(p.wins).padStart(2)}-${String(p.losses).padEnd(3)}  ${String(p.matchesPlayed).padStart(4)}   ` +
        `${p.firstName || p.name || p.username} ${p.lastName || ''}`.trimEnd(),
    );
  });
  log('');
}

// Rank deltas A -> B
const rankOf = (board) => {
  const m = new Map();
  board.forEach((p, i) => m.set(p.username, i + 1));
  return m;
};
const rankA = rankOf(boards[0].board);
const rankB = rankOf(boards[1].board);
const rankC = rankOf(boards[2].board);

log('--- Biggest movers: weakPenalty -> weakBoost (min 5 rated games) ---');
const movers = boards[0].board
  .filter((p) => p.matchesPlayed >= 5 && rankB.has(p.username))
  .map((p) => ({
    name: `${p.firstName || p.name || p.username} ${p.lastName || ''}`.trim(),
    from: rankA.get(p.username),
    to: rankB.get(p.username),
    ratingA: boards[0].board.find((q) => q.username === p.username)?.rating,
    ratingB: boards[1].board.find((q) => q.username === p.username)?.rating,
    delta: rankA.get(p.username) - rankB.get(p.username),
  }))
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  .slice(0, 15);
for (const mv of movers) {
  const dir = mv.delta > 0 ? 'UP' : mv.delta < 0 ? 'DN' : '==';
  log(
    `  ${dir} ${String(Math.abs(mv.delta)).padStart(2)}  #${String(mv.from).padStart(2)} -> #${String(mv.to).padStart(2)}  ${mv.ratingA} -> ${mv.ratingB}  ${mv.name}`,
  );
}
log('');

log('--- Rating deltas per player (A vs B vs C), top 30 by |B-A| ---');
const ratingRows = boards[0].board
  .filter((p) => p.matchesPlayed >= 5)
  .map((p) => {
    const pb = boards[1].board.find((q) => q.username === p.username);
    const pc = boards[2].board.find((q) => q.username === p.username);
    return {
      name: `${p.firstName || p.name || p.username} ${p.lastName || ''}`.trim(),
      rA: p.rating,
      rB: pb?.rating ?? null,
      rC: pc?.rating ?? null,
      dBA: (pb?.rating ?? p.rating) - p.rating,
    };
  })
  .sort((a, b) => Math.abs(b.dBA) - Math.abs(a.dBA))
  .slice(0, 30);
for (const r of ratingRows) {
  log(
    `  A=${r.rA}  B=${r.rB} (${r.dBA >= 0 ? '+' : ''}${r.dBA})  C=${r.rC}  ${r.name}`,
  );
}
log('');

// ---------- Part C: partnerGapFactor sweep (weakPenalty direction) ----------
log('--- Part C: partnerGapFactor sweep (weakPenalty) ---');
const sweep = [0, 0.15, 0.25, 0.35, 0.5, 0.75, 1.0].map((f) => {
  const params = { ...DEFAULT_PARAMS, partnerGapFactor: f };
  const full = replay(matches, params);
  const inSample = scorePredictions(full.predictions);
  const cv = walkForwardCV(matches, params, {}, 5);
  return {
    f,
    inSample: inSample.logLoss,
    cvLogLoss: cv.logLossMean,
    cvSd: cv.logLossSd,
  };
});
for (const s of sweep) {
  log(
    `  f=${s.f.toFixed(2)}   inSample=${s.inSample.toFixed(4)}  CV=${s.cvLogLoss.toFixed(4)} +/- ${s.cvSd.toFixed(4)}`,
  );
}
log('');

// Ratings for spotlight weaker-partner players across the sweep
log('--- Spotlight players across factor values (weakPenalty) ---');
const SPOTLIGHT = ['ednalyn', 'lucille', 'timot', 'celine', 'shane'];
const factorBoards = {};
for (const f of [0, 0.25, 0.5, 0.75]) {
  const params = { ...DEFAULT_PARAMS, partnerGapFactor: f };
  factorBoards[f] = leaderboardFor({ params });
}
const findByName = (board, frag) =>
  board.filter((p) =>
    `${p.firstName} ${p.lastName} ${p.name}`.toLowerCase().includes(frag),
  );
for (const frag of SPOTLIGHT) {
  const rows = [0, 0.25, 0.5, 0.75].map((f) => {
    const hits = findByName(factorBoards[f], frag);
    return hits
      .map((p) => `${p.firstName} ${p.lastName}: ${p.rating}`)
      .join(' | ');
  });
  log(`  f=0: ${rows[0]}`);
  log(`  f=.25: ${rows[1]}`);
  log(`  f=.50: ${rows[2]}  (production)`);
  log(`  f=.75: ${rows[3]}`);
  log('');
}

fs.writeFileSync(OUT_PATH, lines.join('\n'));
console.log(`\nWrote ${OUT_PATH}`);
