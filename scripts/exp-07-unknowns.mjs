/**
 * Experiment 7: Open questions, not confirmations.
 *
 * All arms run under seedMode='flat' (production now seeds everyone at 1450).
 *
 * A. TEAM MODEL — does a doubles team play to its mean rating, or to its
 *    weakest link? Tests mean (prod) vs min vs weakWeighted vs max.
 * B. RETUNE CHECK — the old tuning (autocorr=1000, K=32, margin=0) was done
 *    under stored-rating seeds. Does it still hold under flat seeding?
 * C. ITERATION UNDER HOLDOUT — does more passes of iterated convergence
 *    improve OUT-OF-SAMPLE prediction, or does it only fit history?
 *    (Train on first 80% with N passes → freeze → predict last 20%.)
 * D. PARTNER DIVERSITY — do players who rotate partners get better-predicted
 *    matches? Buckets players by distinct-partner count and scores the
 *    matches they appear in.
 *
 * Run: node scripts/exp-07-unknowns.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadFixture } from './lib/loadFixtures.mjs';
import { replay, DEFAULT_PARAMS, playerKey, expected } from './lib/replayEngine.mjs';
import { walkForwardCV, scorePredictions, bootstrapCI } from './lib/evaluate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_PATH = path.join(__dirname, '..', 'test', 'fixtures', 'exp-07-unknowns-output.txt');

const data = loadFixture('completed_matches_20260824.csv');
const matches = data.competitive;

const lines = [];
const log = (s = '') => { lines.push(s); console.log(s); };
const FLAT = { seedMode: 'flat' };

log('=== EXP-07: OPEN QUESTIONS ===');
log(`Dataset: ${matches.length} competitive doubles matches, flat seeds`);
log('Coin-flip logLoss baseline: 0.6931');
log('');

// ---------- A: team model ----------
log('--- A. Team model: does the weaker partner drive the outcome? ---');
for (const teamMode of ['mean', 'min', 'weakWeighted', 'max']) {
  const params = { ...DEFAULT_PARAMS, teamMode };
  const full = replay(matches, params, FLAT);
  const ci = bootstrapCI(full.predictions, 500);
  const cv = walkForwardCV(matches, params, FLAT, 5);
  log(`  ${teamMode.padEnd(14)} inSample=${scorePredictions(full.predictions).logLoss.toFixed(4)} [${ci.lower.toFixed(4)}-${ci.upper.toFixed(4)}]  CV=${cv.logLossMean.toFixed(4)} +/- ${cv.logLossSd.toFixed(4)}`);
}
log('');

// ---------- B: retune under flat seeds ----------
log('--- B. Does the old tuning hold under flat seeds? ---');
log('  -- autocorrScale --');
for (const s of [0, 500, 1000, 2200]) {
  const params = { ...DEFAULT_PARAMS, autocorrScale: s };
  const cv = walkForwardCV(matches, params, FLAT, 5);
  log(`  scale=${String(s).padStart(4)}  CV=${cv.logLossMean.toFixed(4)} +/- ${cv.logLossSd.toFixed(4)}`);
}
log('  -- kDoubles --');
for (const k of [16, 24, 32, 48, 64]) {
  const params = { ...DEFAULT_PARAMS, kDoubles: k };
  const cv = walkForwardCV(matches, params, FLAT, 5);
  log(`  K=${String(k).padStart(2)}       CV=${cv.logLossMean.toFixed(4)} +/- ${cv.logLossSd.toFixed(4)}`);
}
log('  -- marginWeight (movMode=log) --');
for (const mw of [0, 0.05, 0.1, 0.15]) {
  const params = { ...DEFAULT_PARAMS, movMode: 'log', marginWeight: mw };
  const cv = walkForwardCV(matches, params, FLAT, 5);
  log(`  mw=${mw.toFixed(2)}     CV=${cv.logLossMean.toFixed(4)} +/- ${cv.logLossSd.toFixed(4)}`);
}
log('');

// ---------- C: iteration count under holdout ----------
// Train iterated on first 80%, then predict last 20% with FROZEN ratings.
// This is the real test of whether convergence generalizes.
log('--- C. Ranking passes vs out-of-sample holdout (train 80% / test 20%) ---');
const splitIdx = Math.floor(matches.length * 0.8);
const train = matches.slice(0, splitIdx);
const test = matches.slice(splitIdx);

function trainIterated(ms, passes) {
  let work = ms.map((m) => ({
    ...m,
    teamA: m.teamA.map((p) => ({ ...p })),
    teamB: m.teamB.map((p) => ({ ...p })),
  }));
  let res;
  for (let i = 0; i < passes; i++) {
    res = replay(work, DEFAULT_PARAMS, { seedMode: i === 0 ? 'flat' : 'snapshot' });
    if (i < passes - 1) {
      for (const m of work) {
        for (const p of [...m.teamA, ...m.teamB]) {
          const pl = res.players[playerKey(p)];
          if (pl) p.rating = pl.rating;
        }
      }
    }
  }
  return res.players;
}

for (const passes of [1, 2, 3, 5, 8]) {
  const ratings = trainIterated(train, passes);
  const preds = test.map((m) => {
    const avg = (team) =>
      team.reduce((s, p) => s + (ratings[playerKey(p)]?.rating ?? 1450), 0) /
      team.length;
    return { probA: expected(avg(m.teamA), avg(m.teamB)), actual: m.teamAScore > m.teamBScore ? 1 : 0 };
  });
  const { logLoss } = scorePredictions(preds);
  const acc = preds.filter((p) => (p.probA > 0.5) === (p.actual === 1)).length / preds.length;
  log(`  passes=${passes}  holdoutLogLoss=${logLoss.toFixed(4)}  accuracy=${(acc * 100).toFixed(1)}%`);
}
log('');

// ---------- D: partner diversity vs predictability ----------
log('--- D. Partner diversity: does rotation make ratings more accurate? ---');
// distinct partners per player over the dataset
const partnersOf = new Map(); // key -> Set of partner keys
const playerMatches = new Map(); // key -> matchKeys played
for (const m of matches) {
  for (const [mine, theirs] of [[m.teamA, m.teamA], [m.teamB, m.teamB]]) {
    mine.forEach((p, i) => {
      const k = playerKey(p);
      if (!partnersOf.has(k)) partnersOf.set(k, new Set());
      const partner = theirs[(i + 1) % theirs.length];
      if (partner && playerKey(partner) !== k) partnersOf.get(k).add(playerKey(partner));
      if (!playerMatches.has(k)) playerMatches.set(k, new Set());
      playerMatches.get(k).add(m.matchKey);
    });
  }
}
// prediction error per match
const fullRes = replay(matches, DEFAULT_PARAMS, FLAT);
const matchErr = new Map();
for (const pr of fullRes.predictions) {
  const prob = Math.max(1e-4, Math.min(1 - 1e-4, pr.probA));
  matchErr.set(pr.matchKey, -(pr.actual * Math.log(prob) + (1 - pr.actual) * Math.log(1 - prob)));
}
// bucket players by distinct partners
const buckets = { '1 partner': [], '2-3': [], '4-6': [], '7+': [] };
for (const [key, pset] of partnersOf) {
  const n = pset.size;
  const errs = [...(playerMatches.get(key) || [])].map((mk) => matchErr.get(mk)).filter((e) => e != null);
  if (errs.length === 0) continue;
  const b = n === 1 ? '1 partner' : n <= 3 ? '2-3' : n <= 6 ? '4-6' : '7+';
  buckets[b].push({ key, matches: errs.length, avgErr: errs.reduce((s, e) => s + e, 0) / errs.length });
}
for (const [label, ps] of Object.entries(buckets)) {
  if (ps.length === 0) continue;
  const totalMatches = ps.reduce((s, p) => s + p.matches, 0);
  const wErr = ps.reduce((s, p) => s + p.avgErr * p.matches, 0) / totalMatches;
  log(`  ${label.padEnd(10)} players=${String(ps.length).padStart(3)}  playerMatches=${String(totalMatches).padStart(4)}  avgLogLoss=${wErr.toFixed(4)}`);
}
log('  (lower logLoss = that group\'s matches were more predictable)');
log('');

fs.writeFileSync(OUT_PATH, lines.join('\n'));
console.log(`\nWrote ${OUT_PATH}`);
