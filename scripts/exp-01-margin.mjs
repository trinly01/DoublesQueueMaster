/**
 * Experiment 1: Margin-of-victory normalisation.
 *
 * Tests 6 MOV modes against the current config baseline.
 * Uses walk-forward CV (5 folds) + bootstrap CIs.
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
  'exp-01-margin-output.txt',
);

const matches = loadFixture('completed_matches_20260824.csv').competitive;

const arms = [
  { label: 'A: log (current)', params: { ...DEFAULT_PARAMS, movMode: 'log' } },
  {
    label: 'B: dominance share',
    params: { ...DEFAULT_PARAMS, movMode: 'dominance' },
  },
  {
    label: 'C: winner share',
    params: { ...DEFAULT_PARAMS, movMode: 'winnerShare' },
  },
  {
    label: 'D: normalized (infer target)',
    params: { ...DEFAULT_PARAMS, movMode: 'normalized' },
  },
  {
    label: 'E: joint additive (Kovalchik)',
    params: { ...DEFAULT_PARAMS, movMode: 'jointAdditive' },
  },
  { label: 'F: no MOV', params: { ...DEFAULT_PARAMS, movMode: 'none' } },
];

const lines = [];
lines.push('=== EXPERIMENT 1: MARGIN OF VICTORY ===');
lines.push(`Matches: ${matches.length} (competitive doubles)`);
lines.push('Noise floor: ±0.0110 (from baseline bootstrap CI)');
lines.push('');

const results = [];
for (const arm of arms) {
  // Full in-sample
  const fullResult = replay(matches, arm.params, { seedMode: 'snapshot' });
  const inSample = scorePredictions(fullResult.predictions);
  const ci = bootstrapCI(fullResult.predictions, 1000);

  // Walk-forward CV
  const cv = walkForwardCV(matches, arm.params, { seedMode: 'snapshot' }, 5);

  results.push({
    label: arm.label,
    inSampleLogLoss: inSample.logLoss,
    inSampleBrier: inSample.brier,
    ciLower: ci.lower,
    ciUpper: ci.upper,
    cvLogLoss: cv.logLossMean,
    cvSd: cv.logLossSd,
    cvBrier: cv.brierMean,
  });

  lines.push(formatResult(arm.label, cv, ci));
}

// Sort by CV logLoss
results.sort((a, b) => (a.cvLogLoss ?? 1e9) - (b.cvLogLoss ?? 1e9));

lines.push('');
lines.push('--- Ranked by walk-forward CV logLoss ---');
lines.push(
  'Rank  Arm                                CV logLoss  ±sd     In-sample  CI',
);
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  lines.push(
    `${String(i + 1).padStart(4)}  ${r.label.padEnd(34)} ${(r.cvLogLoss ?? 0).toFixed(4)}    ±${(r.cvSd ?? 0).toFixed(4)}  ${(r.inSampleLogLoss ?? 0).toFixed(4)}    [${r.ciLower.toFixed(4)}, ${r.ciUpper.toFixed(4)}]`,
  );
}

// Verdict
const baseline = results.find((r) => r.label.startsWith('A:'));
const best = results[0];
lines.push('');
lines.push('--- Verdict ---');
if (baseline && best !== baseline) {
  const delta = baseline.cvLogLoss - best.cvLogLoss;
  if (delta > 0.011) {
    lines.push(
      `WINNER: ${best.label} (CV logLoss ${best.cvLogLoss.toFixed(4)} vs baseline ${baseline.cvLogLoss.toFixed(4)}, Δ=${delta.toFixed(4)} > noise floor)`,
    );
  } else {
    lines.push(
      `No clear winner. Best (${best.label}) vs baseline Δ=${delta.toFixed(4)} is within noise floor (±0.0110).`,
    );
  }
} else if (best === baseline) {
  lines.push(
    'Baseline (current config) is already best. No MOV change warranted.',
  );
}

fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');
console.log(`\nResults written to ${OUT_PATH}`);
console.log(lines.join('\n'));
