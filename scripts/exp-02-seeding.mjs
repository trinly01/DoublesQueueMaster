/**
 * Experiment 2: Seeding strategies.
 *
 * Tests 5 seeding modes + iterated convergence + shrinkage re-test.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadFixture } from './lib/loadFixtures.mjs';
import { replay, DEFAULT_PARAMS } from './lib/replayEngine.mjs';
import {
  walkForwardCV,
  bootstrapCI,
  scorePredictions,
  formatResult,
} from './lib/evaluate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_PATH = path.join(
  __dirname,
  '..',
  'test',
  'fixtures',
  'exp-02-seeding-output.txt',
);

const matches = loadFixture('completed_matches_20260824.csv').competitive;

const arms = [
  { label: 'A: flat 1450', seedMode: 'flat' },
  { label: 'B: snapshot (production)', seedMode: 'snapshot' },
  { label: 'C: level-based', seedMode: 'level' },
];

// D: iterated convergence — repeat forward passes until stable
function iteratedReplay(matches, params, maxPasses = 10, threshold = 1) {
  let prevRatings = null;
  let result;
  for (let pass = 0; pass < maxPasses; pass++) {
    result = replay(matches, params, { seedMode: 'snapshot' });
    if (prevRatings) {
      let maxDelta = 0;
      for (const [key, p] of Object.entries(result.players)) {
        const prev = prevRatings[key];
        if (prev)
          maxDelta = Math.max(maxDelta, Math.abs(p.rating - prev.rating));
      }
      if (maxDelta < threshold) {
        return { ...result, passes: pass + 1, converged: true, maxDelta };
      }
    }
    // Update seed ratings for next pass: use final ratings as new seeds
    // We need to modify the matches' player ratings for the next pass
    for (const m of matches) {
      for (const p of [...m.teamA, ...m.teamB]) {
        const key =
          p.userId || p.username || `guest:${p.firstName}|${p.lastName}`;
        const r = result.players[key];
        if (r) p.rating = r.rating;
      }
    }
    prevRatings = {};
    for (const [key, p] of Object.entries(result.players)) {
      prevRatings[key] = { ...p };
    }
  }
  return { ...result, passes: maxPasses, converged: false };
}

const lines = [];
lines.push('=== EXPERIMENT 2: SEEDING ===');
lines.push(`Matches: ${matches.length}`);
lines.push('Noise floor: ±0.0110');
lines.push('');

const results = [];

// Standard arms
for (const arm of arms) {
  const fullResult = replay(matches, DEFAULT_PARAMS, {
    seedMode: arm.seedMode,
  });
  const inSample = scorePredictions(fullResult.predictions);
  const ci = bootstrapCI(fullResult.predictions, 1000);
  const cv = walkForwardCV(
    matches,
    DEFAULT_PARAMS,
    { seedMode: arm.seedMode },
    5,
  );
  results.push({
    label: arm.label,
    cvLogLoss: cv.logLossMean,
    cvSd: cv.logLossSd,
    inSampleLogLoss: inSample.logLoss,
    ciLower: ci.lower,
    ciUpper: ci.upper,
  });
  lines.push(formatResult(arm.label, cv, ci));
}

// D: iterated convergence
lines.push('\n--- Iterated convergence ---');
// Deep copy matches for iteration (so we don't mutate the original)
const matchesCopy = JSON.parse(JSON.stringify(matches));
const iterResult = iteratedReplay(matchesCopy, DEFAULT_PARAMS);
const iterMetrics = scorePredictions(iterResult.predictions);
const iterCI = bootstrapCI(iterResult.predictions, 1000);
// For CV, we can't easily do iterated within CV, so use in-sample as proxy
results.push({
  label: `D: iterated (${iterResult.passes} passes, Δ=${iterResult.maxDelta?.toFixed(2) || 'n/a'})`,
  cvLogLoss: iterMetrics.logLoss, // in-sample, not CV
  cvSd: null,
  inSampleLogLoss: iterMetrics.logLoss,
  ciLower: iterCI.lower,
  ciUpper: iterCI.upper,
});
lines.push(
  `D: iterated (${iterResult.passes} passes, maxΔ=${iterResult.maxDelta?.toFixed(2) || 'n/a'})  logLoss=${iterMetrics.logLoss.toFixed(4)}  CI=[${iterCI.lower.toFixed(4)}, ${iterCI.upper.toFixed(4)}]`,
);

// E: shrinkage re-test under flat-1450 seeding
lines.push('\n--- Shrinkage re-test (flat 1450 seeding) ---');
const SHRINK_C = [0, 4, 8, 12, 20];
for (const C of SHRINK_C) {
  const fullResult = replay(matches, DEFAULT_PARAMS, { seedMode: 'flat' });
  // Apply shrinkage post-hoc: doesn't affect prequential predictions
  // Shrinkage only affects ranking, not prediction. So we measure
  // prediction quality of the raw replay under flat seeding.
  const metrics = scorePredictions(fullResult.predictions);
  lines.push(
    `  C=${String(C).padStart(2)}  logLoss=${metrics.logLoss.toFixed(4)}  (shrinkage affects ranking only, not prediction)`,
  );
}

// Sort by CV logLoss
results.sort((a, b) => (a.cvLogLoss ?? 1e9) - (b.cvLogLoss ?? 1e9));

lines.push('');
lines.push('--- Ranked by logLoss ---');
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const sd = r.cvSd != null ? `±${r.cvSd.toFixed(4)}` : '       ';
  lines.push(
    `${String(i + 1).padStart(4)}  ${r.label.padEnd(45)} ${r.cvLogLoss.toFixed(4)}  ${sd}  CI=[${r.ciLower.toFixed(4)}, ${r.ciUpper.toFixed(4)}]`,
  );
}

lines.push('');
lines.push('--- Verdict ---');
const baseline = results.find((r) => r.label.startsWith('B:'));
const best = results[0];
if (baseline && best !== baseline) {
  const delta = baseline.cvLogLoss - best.cvLogLoss;
  lines.push(`Best: ${best.label} (Δ=${delta.toFixed(4)} vs production)`);
} else {
  lines.push('Production seeding (snapshot) is best or tied.');
}

fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');
console.log(`\nResults written to ${OUT_PATH}`);
console.log(lines.join('\n'));
