/**
 * Experiment 5: Sequential optimization + algorithmic variants.
 *
 * Phase 1: Sequential grid search (K → passes → shrinkage C → gap → autocorr)
 * Phase 2: Algorithmic variants (per-pass shrinkage, geometric team rating, etc.)
 * Phase 3: Cross-club validation of the winner
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadFixture } from './lib/loadFixtures.mjs';
import { replay, DEFAULT_PARAMS, playerKey } from './lib/replayEngine.mjs';
import { scorePredictions } from './lib/evaluate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_PATH = path.join(
  __dirname,
  '..',
  'test',
  'fixtures',
  'exp-05-optimization-output.txt',
);

const data = loadFixture('completed_matches_20260824.csv');
const matches = data.competitive;
const noiseFloor = 0.0128;

const lines = [];
const log = (s) => {
  lines.push(s);
  console.log(s);
};

// ============ Iterated replay with options ============
function iteratedReplay(matches, params, maxPasses, options = {}) {
  const { perPassShrinkage = false } = options;
  let workMatches = matches.map((m) => ({
    ...m,
    teamA: m.teamA.map((p) => ({ ...p })),
    teamB: m.teamB.map((p) => ({ ...p })),
  }));

  let result;
  for (let pass = 0; pass < maxPasses; pass++) {
    result = replay(workMatches, params, { seedMode: 'snapshot' });
    // Update seeds for next pass
    for (const m of workMatches) {
      for (const p of [...m.teamA, ...m.teamB]) {
        const key = playerKey(p);
        const r = result.players[key];
        if (r) p.rating = r.rating;
      }
    }
    // Per-pass shrinkage: apply after each pass, not just at end
    if (perPassShrinkage && params.shrinkagePriorWeight > 0) {
      for (const p of Object.values(result.players)) {
        const n = p.matchesPlayed;
        if (n > 0) {
          p.rating =
            p.initialRating +
            (p.rating - p.initialRating) *
              (n / (n + params.shrinkagePriorWeight));
        }
      }
      // Update workMatches with shrunk ratings
      for (const m of workMatches) {
        for (const p of [...m.teamA, ...m.teamB]) {
          const key = playerKey(p);
          const r = result.players[key];
          if (r) p.rating = r.rating;
        }
      }
    }
  }
  return result;
}

function applyShrinkage(result, C) {
  for (const p of Object.values(result.players)) {
    const n = p.matchesPlayed;
    if (n > 0 && C > 0) {
      p.rating = Math.round(
        p.initialRating + (p.rating - p.initialRating) * (n / (n + C)),
      );
    }
  }
}

function evalConfig(matches, params, passes, options = {}) {
  const r = iteratedReplay(matches, params, passes, options);
  if (!options.perPassShrinkage) {
    applyShrinkage(r, params.shrinkagePriorWeight);
  }
  const sc = scorePredictions(r.predictions);
  const ratings = Object.values(r.players)
    .filter((p) => p.matchesPlayed > 0)
    .map((p) => p.rating);
  const spread = Math.max(...ratings) - Math.min(...ratings);
  const maxR = Math.max(...ratings);
  return { logLoss: sc.logLoss, spread, maxR };
}

// ============ PHASE 1: Sequential optimization ============
log('=== PHASE 1: SEQUENTIAL OPTIMIZATION ===');
log('Starting point: K=32, passes=3, C=12, gap=0.5, auto=1000');
log('Noise floor: +/- ' + noiseFloor.toFixed(4));
log('');

// Step 1: K sweep
log('--- Step 1: K Doubles ---');
let bestK = 32;
let bestKLL = 999;
for (const k of [20, 24, 28, 32, 36, 40, 44, 48]) {
  const params = {
    ...DEFAULT_PARAMS,
    kDoubles: k,
    autocorrScale: 1000,
    shrinkagePriorWeight: 12,
  };
  const r = evalConfig(matches, params, 3);
  const marker = r.logLoss < bestKLL ? ' ***' : '';
  log(
    '  K=' +
      String(k).padEnd(4) +
      'logLoss=' +
      r.logLoss.toFixed(4) +
      ' spread=' +
      r.spread +
      ' max=' +
      r.maxR +
      marker,
  );
  if (r.logLoss < bestKLL) {
    bestKLL = r.logLoss;
    bestK = k;
  }
}
log('  Best K=' + bestK + ' (logLoss=' + bestKLL.toFixed(4) + ')');
log('');

// Step 2: Passes sweep (with best K)
log('--- Step 2: Iterated Passes (K=' + bestK + ') ---');
let bestPasses = 3;
let bestPassLL = 999;
for (const passes of [1, 2, 3, 4, 5, 7, 10]) {
  const params = {
    ...DEFAULT_PARAMS,
    kDoubles: bestK,
    autocorrScale: 1000,
    shrinkagePriorWeight: 12,
  };
  const r = evalConfig(matches, params, passes);
  const marker = r.logLoss < bestPassLL ? ' ***' : '';
  log(
    '  passes=' +
      String(passes).padEnd(4) +
      'logLoss=' +
      r.logLoss.toFixed(4) +
      ' spread=' +
      r.spread +
      ' max=' +
      r.maxR +
      marker,
  );
  if (r.logLoss < bestPassLL) {
    bestPassLL = r.logLoss;
    bestPasses = passes;
  }
}
log('  Best passes=' + bestPasses + ' (logLoss=' + bestPassLL.toFixed(4) + ')');
log('');

// Step 3: Shrinkage C sweep (with best K, passes)
log('--- Step 3: Shrinkage C (K=' + bestK + ', passes=' + bestPasses + ') ---');
let bestC = 12;
let bestCLL = 999;
for (const c of [0, 4, 8, 12, 16, 20, 24, 30]) {
  const params = {
    ...DEFAULT_PARAMS,
    kDoubles: bestK,
    autocorrScale: 1000,
    shrinkagePriorWeight: c,
  };
  const r = evalConfig(matches, params, bestPasses);
  const marker = r.logLoss < bestCLL ? ' ***' : '';
  log(
    '  C=' +
      String(c).padEnd(4) +
      'logLoss=' +
      r.logLoss.toFixed(4) +
      ' spread=' +
      r.spread +
      ' max=' +
      r.maxR +
      marker,
  );
  if (r.logLoss < bestCLL) {
    bestCLL = r.logLoss;
    bestC = c;
  }
}
log('  Best C=' + bestC + ' (logLoss=' + bestCLL.toFixed(4) + ')');
log('');

// Step 4: Partner gap sweep (with best K, passes, C)
log(
  '--- Step 4: Partner Gap Factor (K=' +
    bestK +
    ', passes=' +
    bestPasses +
    ', C=' +
    bestC +
    ') ---',
);
let bestGap = 0.5;
let bestGapLL = 999;
for (const gap of [0, 0.25, 0.5, 0.75, 1.0, 1.5]) {
  const params = {
    ...DEFAULT_PARAMS,
    kDoubles: bestK,
    autocorrScale: 1000,
    shrinkagePriorWeight: bestC,
    partnerGapFactor: gap,
  };
  const r = evalConfig(matches, params, bestPasses);
  const marker = r.logLoss < bestGapLL ? ' ***' : '';
  log(
    '  gap=' +
      String(gap).padEnd(5) +
      'logLoss=' +
      r.logLoss.toFixed(4) +
      ' spread=' +
      r.spread +
      ' max=' +
      r.maxR +
      marker,
  );
  if (r.logLoss < bestGapLL) {
    bestGapLL = r.logLoss;
    bestGap = gap;
  }
}
log('  Best gap=' + bestGap + ' (logLoss=' + bestGapLL.toFixed(4) + ')');
log('');

// Step 5: Autocorr sweep (with best K, passes, C, gap)
log('--- Step 5: Autocorrelation Scale ---');
let bestAuto = 1000;
let bestAutoLL = 999;
for (const auto of [0, 250, 500, 750, 1000, 1500, 2200]) {
  const params = {
    ...DEFAULT_PARAMS,
    kDoubles: bestK,
    autocorrScale: auto,
    shrinkagePriorWeight: bestC,
    partnerGapFactor: bestGap,
  };
  const r = evalConfig(matches, params, bestPasses);
  const marker = r.logLoss < bestAutoLL ? ' ***' : '';
  log(
    '  auto=' +
      String(auto).padEnd(5) +
      'logLoss=' +
      r.logLoss.toFixed(4) +
      ' spread=' +
      r.spread +
      ' max=' +
      r.maxR +
      marker,
  );
  if (r.logLoss < bestAutoLL) {
    bestAutoLL = r.logLoss;
    bestAuto = auto;
  }
}
log('  Best auto=' + bestAuto + ' (logLoss=' + bestAutoLL.toFixed(4) + ')');
log('');

// Step 6: Loss underdog blend
log('--- Step 6: Loss Underdog Blend ---');
let bestBlend = 1.0;
let bestBlendLL = 999;
for (const blend of [0, 0.25, 0.5, 0.75, 1.0]) {
  const params = {
    ...DEFAULT_PARAMS,
    kDoubles: bestK,
    autocorrScale: bestAuto,
    shrinkagePriorWeight: bestC,
    partnerGapFactor: bestGap,
    lossUnderdogBlend: blend,
  };
  const r = evalConfig(matches, params, bestPasses);
  const marker = r.logLoss < bestBlendLL ? ' ***' : '';
  log(
    '  blend=' +
      String(blend).padEnd(5) +
      'logLoss=' +
      r.logLoss.toFixed(4) +
      ' spread=' +
      r.spread +
      marker,
  );
  if (r.logLoss < bestBlendLL) {
    bestBlendLL = r.logLoss;
    bestBlend = blend;
  }
}
log('  Best blend=' + bestBlend + ' (logLoss=' + bestBlendLL.toFixed(4) + ')');
log('');

// ============ PHASE 2: Algorithmic variants ============
log('=== PHASE 2: ALGORITHMIC VARIANTS ===');
log(
  'Baseline: K=' +
    bestK +
    ' passes=' +
    bestPasses +
    ' C=' +
    bestC +
    ' gap=' +
    bestGap +
    ' auto=' +
    bestAuto +
    ' blend=' +
    bestBlend,
);
log('');

const baselineParams = {
  ...DEFAULT_PARAMS,
  kDoubles: bestK,
  autocorrScale: bestAuto,
  shrinkagePriorWeight: bestC,
  partnerGapFactor: bestGap,
  lossUnderdogBlend: bestBlend,
};
const baselineR = evalConfig(matches, baselineParams, bestPasses);
log(
  'Baseline: logLoss=' +
    baselineR.logLoss.toFixed(4) +
    ' spread=' +
    baselineR.spread,
);
log('');

// Variant A: Per-pass shrinkage
log('--- Variant A: Per-pass Shrinkage ---');
const rA = evalConfig(matches, baselineParams, bestPasses, {
  perPassShrinkage: true,
});
log(
  '  logLoss=' +
    rA.logLoss.toFixed(4) +
    ' spread=' +
    rA.spread +
    ' delta=' +
    (rA.logLoss - baselineR.logLoss).toFixed(4),
);
log('');

// Variant B: No shrinkage at all
log('--- Variant B: No Shrinkage ---');
const rB = evalConfig(
  matches,
  { ...baselineParams, shrinkagePriorWeight: 0 },
  bestPasses,
);
log(
  '  logLoss=' +
    rB.logLoss.toFixed(4) +
    ' spread=' +
    rB.spread +
    ' delta=' +
    (rB.logLoss - baselineR.logLoss).toFixed(4),
);
log('');

// Variant C: Higher passes with shrinkage
log('--- Variant C: Higher Passes + Shrinkage ---');
for (const passes of [bestPasses + 1, bestPasses + 2, bestPasses + 3]) {
  const r = evalConfig(matches, baselineParams, passes);
  log(
    '  passes=' +
      String(passes).padEnd(4) +
      'logLoss=' +
      r.logLoss.toFixed(4) +
      ' spread=' +
      r.spread +
      ' delta=' +
      (r.logLoss - baselineR.logLoss).toFixed(4),
  );
}
log('');

// Variant D: Different provisional thresholds (shrinkage C controls this)
log('--- Variant D: Provisional Threshold (C controls both) ---');
for (const c of [bestC - 4, bestC, bestC + 4, bestC + 8]) {
  if (c < 0) continue;
  const params = { ...baselineParams, shrinkagePriorWeight: c };
  const r = evalConfig(matches, params, bestPasses);
  log(
    '  C=' +
      String(c).padEnd(4) +
      'logLoss=' +
      r.logLoss.toFixed(4) +
      ' spread=' +
      r.spread +
      ' delta=' +
      (r.logLoss - baselineR.logLoss).toFixed(4),
  );
}
log('');

// ============ PHASE 3: Cross-club validation ============
log('=== PHASE 3: CROSS-CLUB VALIDATION ===');
const clubA = matches.filter((m) => m.club && m.club.startsWith('22e52ef0'));
const clubB = matches.filter((m) => m.club && m.club.startsWith('46c81532'));
log(
  'Club A: ' + clubA.length + ' matches, Club B: ' + clubB.length + ' matches',
);
log('');

// Compare current config vs optimized
const currentParams = {
  ...DEFAULT_PARAMS,
  kDoubles: 64,
  marginWeight: 0.15,
  autocorrScale: 2200,
  shrinkagePriorWeight: 12,
  partnerGapFactor: 0.5,
  movMode: 'log',
};

log('--- Current config (K=64, MOV=0.15, auto=2200, 1-pass) ---');
const curA = evalConfig(clubA, currentParams, 1);
const curB = evalConfig(clubB, currentParams, 1);
log(
  '  ClubA=' +
    curA.logLoss.toFixed(4) +
    ' ClubB=' +
    curB.logLoss.toFixed(4) +
    ' avg=' +
    ((curA.logLoss + curB.logLoss) / 2).toFixed(4),
);
log('');

log('--- Optimized config ---');
const optA = evalConfig(clubA, baselineParams, bestPasses);
const optB = evalConfig(clubB, baselineParams, bestPasses);
log(
  '  ClubA=' +
    optA.logLoss.toFixed(4) +
    ' ClubB=' +
    optB.logLoss.toFixed(4) +
    ' avg=' +
    ((optA.logLoss + optB.logLoss) / 2).toFixed(4),
);
log('');

// ============ SUMMARY ============
log('=== FINAL SUMMARY ===');
log('Optimized config:');
log('  K=' + bestK + ' (was 64)');
log('  passes=' + bestPasses + ' (was 1)');
log('  shrinkage C=' + bestC + ' (was 12)');
log('  partnerGapFactor=' + bestGap + ' (was 0.5)');
log('  autocorrScale=' + bestAuto + ' (was 2200)');
log('  lossUnderdogBlend=' + bestBlend + ' (was 1.0)');
log('  marginWeight=0 (was 0.15)');
log('');
log('logLoss: ' + baselineR.logLoss.toFixed(4) + ' (current: 0.6270)');
log(
  'Improvement: ' +
    (((0.627 - baselineR.logLoss) / 0.627) * 100).toFixed(1) +
    '%',
);
log('Spread: ' + baselineR.spread + ' (current: ~881)');
log('Max rating: ' + baselineR.maxR);
log('');
log(
  'Cross-club: ClubA=' +
    optA.logLoss.toFixed(4) +
    ' ClubB=' +
    optB.logLoss.toFixed(4),
);

fs.writeFileSync(OUT_PATH, lines.join('\n'));
log('');
log('Full output: ' + OUT_PATH);
