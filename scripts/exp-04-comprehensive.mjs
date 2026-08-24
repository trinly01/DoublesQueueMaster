/**
 * Experiment 4: Comprehensive algorithm sweep.
 *
 * Phase 1: One-at-a-time sweep of each tuning dimension.
 * Phase 2: Iterated convergence with different pass counts.
 * Phase 3: Top combinations from Phase 1.
 * Phase 4: Cross-club validation of the top 3.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadFixture } from './lib/loadFixtures.mjs';
import { replay, DEFAULT_PARAMS, playerKey } from './lib/replayEngine.mjs';
import { walkForwardCV, scorePredictions, bootstrapCI } from './lib/evaluate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_PATH = path.join(__dirname, '..', 'test', 'fixtures', 'exp-04-comprehensive-output.txt');

const data = loadFixture('completed_matches_20260824.csv');
const matches = data.competitive;
const noiseFloor = 0.0128;

const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

function testArm(label, params, options = {}) {
  const fullResult = replay(matches, params, options);
  const inSample = scorePredictions(fullResult.predictions);
  const ci = bootstrapCI(fullResult.predictions, 500);
  const cv = walkForwardCV(matches, params, options, 5);
  return { label, inSample: inSample.logLoss, ciLow: ci.lower, ciHigh: ci.upper, cvLogLoss: cv.logLossMean, cvSd: cv.logLossSd };
}

function iteratedReplay(matches, params, maxPasses) {
  let workMatches = matches.map(m => ({
    ...m,
    teamA: m.teamA.map(p => ({ ...p })),
    teamB: m.teamB.map(p => ({ ...p })),
  }));
  let result;
  for (let pass = 0; pass < maxPasses; pass++) {
    result = replay(workMatches, params, { seedMode: 'snapshot' });
    for (const m of workMatches) {
      for (const p of [...m.teamA, ...m.teamB]) {
        const key = playerKey(p);
        const r = result.players[key];
        if (r) p.rating = r.rating;
      }
    }
  }
  return result;
}

log('=== COMPREHENSIVE ALGORITHM SWEEP ===');
log('Dataset: ' + matches.length + ' competitive doubles matches');
log('Noise floor (CV sd): +/- ' + noiseFloor.toFixed(4));
log('Coin-flip baseline: 0.6931');
log('');

// ============ PHASE 1: One-at-a-time ============
log('=== PHASE 1: ONE-AT-A-TIME SWEEP ===');
log('Base: snapshot seed, log MOV, autocorr=2200, K=64, marginW=0.15');
log('');

const dimResults = [];

// MOV mode
log('--- MOV Mode ---');
for (const movMode of ['log', 'none', 'dominance', 'winnerShare', 'normalized', 'jointAdditive']) {
  const r = testArm(movMode, { ...DEFAULT_PARAMS, movMode, autocorrScale: 2200 });
  log('  ' + movMode.padEnd(16) + 'inSample=' + r.inSample.toFixed(4) + ' CV=' + r.cvLogLoss.toFixed(4) + ' +/- ' + r.cvSd.toFixed(4));
  dimResults.push({ dim: 'MOV', ...r });
}

// Autocorr
log('');
log('--- Autocorrelation Scale ---');
for (const scale of [0, 500, 1000, 2200, 5000]) {
  const r = testArm('scale=' + scale, { ...DEFAULT_PARAMS, autocorrScale: scale });
  log('  ' + ('scale=' + scale).padEnd(16) + 'inSample=' + r.inSample.toFixed(4) + ' CV=' + r.cvLogLoss.toFixed(4) + ' +/- ' + r.cvSd.toFixed(4));
  dimResults.push({ dim: 'autocorr', ...r });
}

// K doubles
log('');
log('--- K Doubles ---');
for (const k of [24, 32, 40, 48, 56, 64, 80]) {
  const r = testArm('K=' + k, { ...DEFAULT_PARAMS, kDoubles: k, autocorrScale: 2200 });
  log('  ' + ('K=' + k).padEnd(16) + 'inSample=' + r.inSample.toFixed(4) + ' CV=' + r.cvLogLoss.toFixed(4) + ' +/- ' + r.cvSd.toFixed(4));
  dimResults.push({ dim: 'K', ...r });
}

// Margin weight
log('');
log('--- Margin Weight ---');
for (const mw of [0, 0.05, 0.10, 0.15, 0.20, 0.25]) {
  const r = testArm('marginW=' + mw, { ...DEFAULT_PARAMS, marginWeight: mw, autocorrScale: 2200 });
  log('  ' + ('marginW=' + mw).padEnd(16) + 'inSample=' + r.inSample.toFixed(4) + ' CV=' + r.cvLogLoss.toFixed(4) + ' +/- ' + r.cvSd.toFixed(4));
  dimResults.push({ dim: 'marginW', ...r });
}

// Seed mode
log('');
log('--- Seed Mode ---');
for (const sm of ['flat', 'snapshot', 'level']) {
  const r = testArm(sm, { ...DEFAULT_PARAMS, autocorrScale: 2200 }, { seedMode: sm });
  log('  ' + sm.padEnd(16) + 'inSample=' + r.inSample.toFixed(4) + ' CV=' + r.cvLogLoss.toFixed(4) + ' +/- ' + r.cvSd.toFixed(4));
  dimResults.push({ dim: 'seed', ...r });
}

// Provisional K
log('');
log('--- Provisional K ---');
const provKconfigs = [
  { label: 'off', val: null },
  { label: 'highK=96,thresh=8', val: { highK: 96, threshold: 8, normalK: 64 } },
  { label: 'highK=80,thresh=12', val: { highK: 80, threshold: 12, normalK: 64 } },
];
for (const pk of provKconfigs) {
  const r = testArm(pk.label, { ...DEFAULT_PARAMS, provisionalK: pk.val, autocorrScale: 2200 });
  log('  ' + pk.label.padEnd(20) + 'inSample=' + r.inSample.toFixed(4) + ' CV=' + r.cvLogLoss.toFixed(4) + ' +/- ' + r.cvSd.toFixed(4));
  dimResults.push({ dim: 'provK', ...r });
}

// Recency
log('');
log('--- Recency Decay ---');
const refDate = matches[matches.length - 1].date;
for (const [label, halfLife] of [['off', 0], ['90d', 90], ['180d', 180], ['365d', 365]]) {
  const r = testArm(label, { ...DEFAULT_PARAMS, recencyHalfLifeDays: halfLife, autocorrScale: 2200 }, { recencyRefDate: refDate });
  log('  ' + label.padEnd(16) + 'inSample=' + r.inSample.toFixed(4) + ' CV=' + r.cvLogLoss.toFixed(4) + ' +/- ' + r.cvSd.toFixed(4));
  dimResults.push({ dim: 'recency', ...r });
}

// Partner gap factor
log('');
log('--- Partner Gap Factor ---');
for (const pgf of [0, 0.25, 0.5, 0.75, 1.0]) {
  const r = testArm('gap=' + pgf, { ...DEFAULT_PARAMS, partnerGapFactor: pgf, autocorrScale: 2200 });
  log('  ' + ('gap=' + pgf).padEnd(16) + 'inSample=' + r.inSample.toFixed(4) + ' CV=' + r.cvLogLoss.toFixed(4) + ' +/- ' + r.cvSd.toFixed(4));
  dimResults.push({ dim: 'partnerGap', ...r });
}

// ============ PHASE 2: Iterated convergence ============
log('');
log('=== PHASE 2: ITERATED CONVERGENCE ===');
for (const passes of [1, 2, 3, 5, 10, 15]) {
  const r = iteratedReplay(matches, { ...DEFAULT_PARAMS, autocorrScale: 2200 }, passes);
  const sc = scorePredictions(r.predictions);
  log('  passes=' + String(passes).padEnd(4) + 'inSample=' + sc.logLoss.toFixed(4));
}

// ============ PHASE 3: Top combinations ============
log('');
log('=== PHASE 3: TOP COMBINATIONS ===');

const combos = [
  { label: 'A: none+K32+auto0', params: { ...DEFAULT_PARAMS, movMode: 'none', kDoubles: 32, autocorrScale: 0 } },
  { label: 'B: none+K32+auto1000', params: { ...DEFAULT_PARAMS, movMode: 'none', kDoubles: 32, autocorrScale: 1000 } },
  { label: 'C: none+K40+auto1000', params: { ...DEFAULT_PARAMS, movMode: 'none', kDoubles: 40, autocorrScale: 1000 } },
  { label: 'D: jointAdd+K32+auto0', params: { ...DEFAULT_PARAMS, movMode: 'jointAdditive', kDoubles: 32, autocorrScale: 0, marginWeight: 0.15 } },
  { label: 'E: none+K48+auto0', params: { ...DEFAULT_PARAMS, movMode: 'none', kDoubles: 48, autocorrScale: 0 } },
  { label: 'F: log+K32+auto2200', params: { ...DEFAULT_PARAMS, movMode: 'log', kDoubles: 32, autocorrScale: 2200 } },
  { label: 'G: none+K32+auto2200', params: { ...DEFAULT_PARAMS, movMode: 'none', kDoubles: 32, autocorrScale: 2200 } },
  { label: 'H: none+K24+auto1000', params: { ...DEFAULT_PARAMS, movMode: 'none', kDoubles: 24, autocorrScale: 1000 } },
  { label: 'I: none+K32+gap0', params: { ...DEFAULT_PARAMS, movMode: 'none', kDoubles: 32, autocorrScale: 0, partnerGapFactor: 0 } },
  { label: 'J: current (log+K64+auto2200)', params: { ...DEFAULT_PARAMS, movMode: 'log', kDoubles: 64, autocorrScale: 2200 } },
];

const comboResults = [];
for (const c of combos) {
  const r = replay(matches, c.params, { seedMode: 'snapshot' });
  const sc = scorePredictions(r.predictions);
  const ci = bootstrapCI(r.predictions, 1000);
  const cv = walkForwardCV(matches, c.params, { seedMode: 'snapshot' }, 5);
  log('  ' + c.label.padEnd(36) + 'inSample=' + sc.logLoss.toFixed(4) + ' CI=[' + ci.lower.toFixed(4) + ',' + ci.upper.toFixed(4) + '] CV=' + cv.logLossMean.toFixed(4) + ' +/- ' + cv.logLossSd.toFixed(4));
  comboResults.push({ ...c, inSample: sc.logLoss, ciLow: ci.lower, ciHigh: ci.upper, cvLogLoss: cv.logLossMean, cvSd: cv.logLossSd });
}

// ============ PHASE 4: Cross-club validation ============
log('');
log('=== PHASE 4: CROSS-CLUB VALIDATION ===');

// Split by club
const clubA = matches.filter(m => m.club && m.club.startsWith('22e52ef0'));
const clubB = matches.filter(m => m.club && m.club.startsWith('46c81532'));
log('Club A (22e52ef0): ' + clubA.length + ' matches');
log('Club B (46c81532): ' + clubB.length + ' matches');
log('');

// Top 3 combos + current
const topCombos = [...comboResults].sort((a, b) => a.inSample - b.inSample).slice(0, 3);
const currentCombo = comboResults.find(c => c.label.startsWith('J:'));
const testCombos = [...topCombos, currentCombo];

for (const c of testCombos) {
  const rA = replay(clubA, c.params, { seedMode: 'snapshot' });
  const rB = replay(clubB, c.params, { seedMode: 'snapshot' });
  const scA = scorePredictions(rA.predictions);
  const scB = scorePredictions(rB.predictions);
  log('  ' + c.label.padEnd(36) + 'ClubA=' + scA.logLoss.toFixed(4) + ' ClubB=' + scB.logLoss.toFixed(4));
}

// ============ SUMMARY ============
log('');
log('=== SUMMARY ===');
log('Noise floor: +/- ' + noiseFloor.toFixed(4) + ' (CV sd)');
log('');
log('Best single dimension values:');
const dims = ['MOV', 'autocorr', 'K', 'marginW', 'seed', 'provK', 'recency', 'partnerGap'];
for (const dim of dims) {
  const dimRes = dimResults.filter(r => r.dim === dim).sort((a, b) => a.inSample - b.inSample);
  if (dimRes.length > 0) {
    const best = dimRes[0];
    const worst = dimRes[dimRes.length - 1];
    const spread = worst.inSample - best.inSample;
    log('  ' + dim.padEnd(14) + 'best=' + best.label.padEnd(20) + '(' + best.inSample.toFixed(4) + ') spread=' + spread.toFixed(4) + (spread > noiseFloor ? ' > noise' : ' <= noise'));
  }
}
log('');
log('Top 5 combinations:');
const sorted = [...comboResults].sort((a, b) => a.inSample - b.inSample);
for (let i = 0; i < Math.min(5, sorted.length); i++) {
  const c = sorted[i];
  const beatsCurrent = c.inSample < currentCombo.inSample - noiseFloor;
  log('  #' + (i+1) + ' ' + c.label.padEnd(36) + 'inSample=' + c.inSample.toFixed(4) + (beatsCurrent ? ' ** beats current **' : ''));
}

fs.writeFileSync(OUT_PATH, lines.join('\n'));
log('');
log('Full output written to: ' + OUT_PATH);
