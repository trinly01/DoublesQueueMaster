/**
 * Baseline measurement: current shipped config on the new dataset.
 * Establishes the noise floor before any tuning.
 */
import { loadFixture } from './lib/loadFixtures.mjs';
import { replay, DEFAULT_PARAMS } from './lib/replayEngine.mjs';
import {
  walkForwardCV,
  bootstrapCI,
  baselineCoinFlip,
  baselineSeedFavourite,
  crossClubCV,
  scorePredictions,
} from './lib/evaluate.mjs';

const matches = loadFixture('completed_matches_20260824.csv').competitive;

console.log('=== BASELINE MEASUREMENT ===');
console.log(`Matches: ${matches.length}\n`);

// 1. Baselines
const fullResult = replay(matches, DEFAULT_PARAMS, { seedMode: 'snapshot' });
const coinFlip = baselineCoinFlip(fullResult.predictions);
const seedFav = baselineSeedFavourite(matches);
console.log(
  `Baseline — coin flip:        logLoss=${coinFlip.logLoss.toFixed(4)}`,
);
console.log(
  `Baseline — seed favourite:   logLoss=${seedFav.logLoss.toFixed(4)}`,
);

// 2. Current config — full in-sample
const currentMetrics = scorePredictions(fullResult.predictions);
console.log(
  `\nCurrent config (in-sample):  logLoss=${currentMetrics.logLoss.toFixed(4)}  brier=${currentMetrics.brier.toFixed(4)}  n=${currentMetrics.n}`,
);

// 3. Bootstrap CI on current config
const ci = bootstrapCI(fullResult.predictions, 1000);
console.log(
  `  Bootstrap 95% CI:           [${ci.lower.toFixed(4)}, ${ci.upper.toFixed(4)}]`,
);

// 4. Walk-forward CV
console.log('\n--- Walk-forward CV (5 folds) ---');
const cv = walkForwardCV(matches, DEFAULT_PARAMS, { seedMode: 'snapshot' }, 5);
for (const f of cv.folds) {
  console.log(
    `  Fold ${f.fold}: train=${f.trainSize} test=${f.testSize}  logLoss=${f.logLoss?.toFixed(4)}  brier=${f.brier?.toFixed(4)}`,
  );
}
console.log(
  `\n  Mean: logLoss=${cv.logLossMean?.toFixed(4)} ± ${cv.logLossSd?.toFixed(4)}  brier=${cv.brierMean?.toFixed(4)} ± ${cv.brierSd?.toFixed(4)}`,
);

// 5. Cross-club validation
console.log('\n--- Cross-club validation ---');
const cc = crossClubCV(matches, DEFAULT_PARAMS, { seedMode: 'snapshot' });
if (cc) {
  for (const r of cc.pairs) {
    console.log(
      `  ${r.trainClub} -> ${r.testClub}  train=${r.trainSize} test=${r.testSize}  logLoss=${r.logLoss?.toFixed(4)}`,
    );
  }
  console.log(
    `\n  Mean: logLoss=${cc.logLossMean?.toFixed(4)} ± ${cc.logLossSd?.toFixed(4)}`,
  );
} else {
  console.log('  (not enough clubs)');
}

// 6. Noise floor
const noiseFloor = (ci.upper - ci.lower) / 2;
console.log(`\n=== NOISE FLOOR ===`);
console.log(`Bootstrap CI half-width: ±${noiseFloor.toFixed(4)}`);
console.log(`Any improvement smaller than this is noise.\n`);
