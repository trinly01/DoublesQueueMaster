/**
 * Experiment 3: Engine ablations on top of iterated convergence.
 *
 * Tests: autocorrelation correction, provisional K, recency decay, no-MOV.
 * Each toggle is tested independently against the iterated baseline.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadFixture } from './lib/loadFixtures.mjs';
import { replay, DEFAULT_PARAMS } from './lib/replayEngine.mjs';
import { scorePredictions, bootstrapCI } from './lib/evaluate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_PATH = path.join(__dirname, '..', 'test', 'fixtures', 'exp-03-ablations-output.txt');

const matches = loadFixture('completed_matches_20260824.csv').competitive;

// Iterated convergence helper
function iteratedReplay(matches, params, maxPasses = 10, threshold = 1) {
  const matchesCopy = JSON.parse(JSON.stringify(matches));
  let prevRatings = null;
  let result;
  for (let pass = 0; pass < maxPasses; pass++) {
    result = replay(matchesCopy, params, { seedMode: 'snapshot' });
    if (prevRatings) {
      let maxDelta = 0;
      for (const [key, p] of Object.entries(result.players)) {
        const prev = prevRatings[key];
        if (prev) maxDelta = Math.max(maxDelta, Math.abs(p.rating - prev.rating));
      }
      if (maxDelta < threshold) {
        return { ...result, passes: pass + 1, converged: true, maxDelta };
      }
    }
    for (const m of matchesCopy) {
      for (const p of [...m.teamA, ...m.teamB]) {
        const key = p.userId || p.username || `guest:${p.firstName}|${p.lastName}`;
        const r = result.players[key];
        if (r) p.rating = r.rating;
      }
    }
    prevRatings = {};
    for (const [key, p] of Object.entries(result.players)) {
      prevRatings[key] = { ...p };
    }
  }
  return { ...result, passes: maxPasses, converged: false, maxDelta: 0 };
}

const lines = [];
lines.push('=== EXPERIMENT 3: ENGINE ABLATIONS (on iterated baseline) ===');
lines.push(`Matches: ${matches.length}`);
lines.push('');

// Baseline: iterated, current params
const baselineResult = iteratedReplay(matches, DEFAULT_PARAMS);
const baselineMetrics = scorePredictions(baselineResult.predictions);
const baselineCI = bootstrapCI(baselineResult.predictions, 1000);
lines.push(`Baseline (iterated, current params):  logLoss=${baselineMetrics.logLoss.toFixed(4)}  CI=[${baselineCI.lower.toFixed(4)}, ${baselineCI.upper.toFixed(4)}]`);
lines.push(`  passes=${baselineResult.passes}  converged=${baselineResult.converged}`);
lines.push('');

const arms = [
  {
    label: 'No MOV (multiplier=1)',
    params: { ...DEFAULT_PARAMS, movMode: 'none' },
  },
  {
    label: 'Autocorr scale=2200 (538)',
    params: { ...DEFAULT_PARAMS, autocorrScale: 2200 },
  },
  {
    label: 'Autocorr scale=3000',
    params: { ...DEFAULT_PARAMS, autocorrScale: 3000 },
  },
  {
    label: 'Provisional K (highK=100, thresh=8)',
    params: { ...DEFAULT_PARAMS, provisionalK: { highK: 100, threshold: 8, normalK: 64 } },
  },
  {
    label: 'Provisional K (highK=128, thresh=12)',
    params: { ...DEFAULT_PARAMS, provisionalK: { highK: 128, threshold: 12, normalK: 64 } },
  },
  {
    label: 'No MOV + autocorr=2200',
    params: { ...DEFAULT_PARAMS, movMode: 'none', autocorrScale: 2200 },
  },
  {
    label: 'No MOV + provisional K (100/8)',
    params: { ...DEFAULT_PARAMS, movMode: 'none', provisionalK: { highK: 100, threshold: 8, normalK: 64 } },
  },
  {
    label: 'No MOV + autocorr=2200 + prov K',
    params: { ...DEFAULT_PARAMS, movMode: 'none', autocorrScale: 2200, provisionalK: { highK: 100, threshold: 8, normalK: 64 } },
  },
];

const results = [];
for (const arm of arms) {
  const result = iteratedReplay(matches, arm.params);
  const metrics = scorePredictions(result.predictions);
  const ci = bootstrapCI(result.predictions, 1000);
  const delta = baselineMetrics.logLoss - metrics.logLoss;
  results.push({ ...arm, logLoss: metrics.logLoss, ciLower: ci.lower, ciUpper: ci.upper, delta });
  lines.push(
    `${arm.label.padEnd(44)} logLoss=${metrics.logLoss.toFixed(4)}  CI=[${ci.lower.toFixed(4)}, ${ci.upper.toFixed(4)}]  Δ=${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`,
  );
}

// Sort by logLoss
results.sort((a, b) => a.logLoss - b.logLoss);

lines.push('');
lines.push('--- Ranked ---');
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  lines.push(
    `${String(i + 1).padStart(4)}  ${r.label.padEnd(44)} ${r.logLoss.toFixed(4)}  Δ=${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(4)}`,
  );
}

lines.push('');
lines.push('--- Verdict ---');
const best = results[0];
if (best.delta > 0.011) {
  lines.push(`WINNER: ${best.label} (Δ=+${best.delta.toFixed(4)} > noise floor)`);
} else {
  lines.push(`Best (${best.label}) Δ=+${best.delta.toFixed(4)} is within noise floor. Iterated convergence alone is the main win.`);
}

fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');
console.log(`\nResults written to ${OUT_PATH}`);
console.log(lines.join('\n'));
