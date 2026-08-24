/**
 * Evaluation harness: walk-forward CV, bootstrap CIs, baselines.
 */
import { replay, expected } from './replayEngine.mjs';

/**
 * Compute logLoss and Brier from a prediction log.
 */
export function scorePredictions(predictions) {
  let logLossSum = 0;
  let brierSum = 0;
  let n = 0;
  for (const p of predictions) {
    const prob = Math.max(1e-4, Math.min(1 - 1e-4, p.probA));
    logLossSum -=
      p.actual * Math.log(prob) + (1 - p.actual) * Math.log(1 - prob);
    brierSum += Math.pow(p.actual - prob, 2);
    n++;
  }
  return {
    logLoss: n > 0 ? logLossSum / n : null,
    brier: n > 0 ? brierSum / n : null,
    n,
  };
}

/**
 * Walk-forward (rolling-origin) cross-validation.
 *
 * Splits matches into K folds chronologically. For each fold i:
 *   - Train (replay) on matches[0 : start_i]
 *   - Score predictions on matches[start_i : end_i]
 *
 * Returns per-fold metrics + aggregate mean ± sd.
 */
export function walkForwardCV(matches, params, options = {}, nFolds = 5) {
  const foldSize = Math.floor(matches.length / nFolds);
  const foldMetrics = [];

  for (let i = 0; i < nFolds; i++) {
    const testStart = i * foldSize;
    const testEnd = i === nFolds - 1 ? matches.length : (i + 1) * foldSize;
    const trainMatches = matches.slice(0, testStart);
    const testMatches = matches.slice(testStart, testEnd);

    // Replay on training set to build up ratings
    replay(trainMatches, params, options);

    // Now replay test matches, collecting predictions
    // We need to continue from the training state, so we replay all
    // but only score the test portion
    const fullResult = replay(
      [...trainMatches, ...testMatches],
      params,
      options,
    );
    const testPreds = fullResult.predictions.slice(testStart);

    const metrics = scorePredictions(testPreds);
    foldMetrics.push({
      fold: i,
      trainSize: trainMatches.length,
      testSize: testMatches.length,
      ...metrics,
    });
  }

  // Aggregate
  const logLosses = foldMetrics.map((f) => f.logLoss).filter((x) => x != null);
  const briers = foldMetrics.map((f) => f.brier).filter((x) => x != null);

  return {
    folds: foldMetrics,
    logLossMean: mean(logLosses),
    logLossSd: sd(logLosses),
    brierMean: mean(briers),
    brierSd: sd(briers),
    n: foldMetrics.reduce((s, f) => s + f.n, 0),
  };
}

/**
 * Bootstrap 95% CI on logLoss.
 * Resamples predictions with replacement B times.
 */
export function bootstrapCI(predictions, B = 1000) {
  const n = predictions.length;
  const logLosses = [];
  for (let b = 0; b < B; b++) {
    let llSum = 0;
    for (let j = 0; j < n; j++) {
      const p = predictions[Math.floor(Math.random() * n)];
      const prob = Math.max(1e-4, Math.min(1 - 1e-4, p.probA));
      llSum -= p.actual * Math.log(prob) + (1 - p.actual) * Math.log(1 - prob);
    }
    logLosses.push(llSum / n);
  }
  logLosses.sort((a, b) => a - b);
  return {
    mean: mean(logLosses),
    lower: logLosses[Math.floor(0.025 * B)],
    upper: logLosses[Math.floor(0.975 * B)],
  };
}

/**
 * Baseline: always predict 0.5 (coin flip).
 */
export function baselineCoinFlip(predictions) {
  const n = predictions.length;
  let llSum = 0;
  for (const p of predictions) {
    llSum -= p.actual * Math.log(0.5) + (1 - p.actual) * Math.log(0.5);
  }
  return { logLoss: llSum / n, n };
}

/**
 * Baseline: always predict based on seed rating favourite.
 */
export function baselineSeedFavourite(matches) {
  let logLossSum = 0;
  let n = 0;
  for (const m of matches) {
    const rA =
      m.teamA.reduce((s, p) => s + (p.rating || 1450), 0) / m.teamA.length;
    const rB =
      m.teamB.reduce((s, p) => s + (p.rating || 1450), 0) / m.teamB.length;
    const probA = expected(rA, rB);
    const aWon = m.teamAScore > m.teamBScore ? 1 : 0;
    const prob = Math.max(1e-4, Math.min(1 - 1e-4, probA));
    logLossSum -= aWon * Math.log(prob) + (1 - aWon) * Math.log(1 - prob);
    n++;
  }
  return { logLoss: logLossSum / n, n };
}

/**
 * Cross-club validation: train on club A, test on club B.
 */
export function crossClubCV(matches, params, options = {}) {
  const clubs = [...new Set(matches.map((m) => m.club).filter(Boolean))];
  if (clubs.length < 2) return null;

  const results = [];
  // For each pair of clubs, train on one, test on other
  for (let i = 0; i < clubs.length; i++) {
    for (let j = 0; j < clubs.length; j++) {
      if (i === j) continue;
      const trainMatches = matches.filter((m) => m.club === clubs[i]);
      const testMatches = matches.filter((m) => m.club === clubs[j]);
      if (trainMatches.length < 20 || testMatches.length < 20) continue;

      const fullResult = replay(
        [...trainMatches, ...testMatches],
        params,
        options,
      );
      const testPreds = fullResult.predictions.slice(trainMatches.length);
      const metrics = scorePredictions(testPreds);
      results.push({
        trainClub: clubs[i].substring(0, 8),
        testClub: clubs[j].substring(0, 8),
        trainSize: trainMatches.length,
        testSize: testMatches.length,
        ...metrics,
      });
    }
  }

  const logLosses = results.map((r) => r.logLoss).filter((x) => x != null);
  return {
    pairs: results,
    logLossMean: mean(logLosses),
    logLossSd: sd(logLosses),
    n: results.length,
  };
}

function mean(arr) {
  if (arr.length === 0) return null;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function sd(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Format a result line for output.
 */
export function formatResult(label, cvResult, ciResult) {
  const ll = cvResult.logLossMean?.toFixed(4) ?? 'n/a';
  const sd = cvResult.logLossSd?.toFixed(4) ?? 'n/a';
  const br = cvResult.brierMean?.toFixed(4) ?? 'n/a';
  const ci = ciResult
    ? `[${ciResult.lower.toFixed(4)}, ${ciResult.upper.toFixed(4)}]`
    : '';
  return `${label.padEnd(40)} logLoss=${ll} ±${sd}  brier=${br}  ${ci}`;
}
