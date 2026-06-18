import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.join(
  __dirname,
  '..',
  'test',
  'fixtures',
  'completed_matches_combined.csv',
);

const NEW_CSV_PATH = path.join(
  __dirname,
  '..',
  'test',
  'fixtures',
  'completed_matches_2026_06_18_event.csv',
);

function parseCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  return lines.slice(1).map((line, idx) => {
    // CSV with two quoted JSON-array fields at the end.
    // Strategy: split by comma into at most 7 fields, then unescape "" -> " inside quoted fields.
    const firstComma = line.indexOf(',');
    const secondComma = line.indexOf(',', firstComma + 1);
    const thirdComma = line.indexOf(',', secondComma + 1);
    const fourthComma = line.indexOf(',', thirdComma + 1);
    const fifthComma = line.indexOf(',', fourthComma + 1);

    const date = line.slice(0, firstComma);
    const matchType = line.slice(firstComma + 1, secondComma);
    const matchId = line.slice(secondComma + 1, thirdComma);
    const teamAScore = parseInt(line.slice(thirdComma + 1, fourthComma), 10);
    const teamBScore = parseInt(line.slice(fourthComma + 1, fifthComma), 10);
    const rest = line.slice(fifthComma + 1);

    // Split the remaining two quoted JSON fields by the first comma that appears after a closing quote.
    const fields = splitLastTwoFields(rest);
    const teamA = JSON.parse(unescapeCsvField(fields[0]));
    const teamB = JSON.parse(unescapeCsvField(fields[1]));

    return {
      date,
      matchType,
      matchId,
      teamAScore,
      teamBScore,
      teamA,
      teamB,
      idx,
    };
  });
}

function unescapeCsvField(field) {
  // Remove surrounding quotes if present, and unescape doubled quotes "" -> "
  if (field.startsWith('"') && field.endsWith('"')) {
    field = field.slice(1, -1);
  }
  return field.replace(/""/g, '"');
}

function splitLastTwoFields(rest) {
  // Find the comma separating the two quoted JSON fields.
  // Both fields are quoted and start with "[{. Walk through the string and find the comma
  // that is outside a quoted segment (the quote that closes the first JSON array).
  let inQuotes = false;
  for (let i = 0; i < rest.length; i++) {
    const char = rest[i];
    const nextChar = rest[i + 1];
    if (char === '"' && nextChar === '"') {
      // Escaped quote inside a quoted field: skip both
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      return [rest.slice(0, i), rest.slice(i + 1)];
    }
  }
  // Fallback: no separator found, likely malformed
  return [rest, '[]'];
}

function arithmeticMean(players) {
  if (players.length === 0) return 1500;
  return (
    players.reduce((sum, p) => sum + (p.rating || 1500), 0) / players.length
  );
}

function harmonicMean(players) {
  if (players.length === 0) return 1500;
  const sumReciprocal = players.reduce(
    (sum, p) => sum + 1 / Math.max(1, p.rating || 1500),
    0,
  );
  return players.length / sumReciprocal;
}

function expected(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function allocateInteger(total, weights) {
  const sum = weights.reduce((s, w) => s + w, 0);
  const norm =
    sum > 0
      ? weights.map((w) => w / sum)
      : weights.map(() => 1 / weights.length);
  const raw = norm.map((n) => n * total);
  const floors = raw.map((r) => Math.floor(r));
  const remainder = total - floors.reduce((s, f) => s + f, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder; k++) result[order[k % order.length].i] += 1;
  return result;
}

function currentEngine(winners, losers, scoreW, scoreL) {
  const BASE_K = 30;
  const RATING_FLOOR = 100;
  const ratingW = harmonicMean(winners);
  const ratingL = harmonicMean(losers);
  const expectedW = 1 / (1 + Math.pow(10, (ratingL - ratingW) / 400));
  const multiplier = 1 + Math.abs(scoreW - scoreL) * 0.05;
  const K = BASE_K / winners.length;
  const pool = Math.round(K * multiplier * Math.abs(1 - expectedW));

  const winnerCredits = winners.map(
    (p) => 1 - 1 / (1 + Math.pow(10, (ratingL - p.rating) / 400)),
  );
  const winnerGains = allocateInteger(pool, winnerCredits);

  const loserBlames = losers.map(
    (p) => 1 / (1 + Math.pow(10, (ratingW - p.rating) / 400)),
  );
  const loserLosses = allocateInteger(pool, loserBlames);

  const updatedWinners = winners.map((player, i) => ({
    ...player,
    rating: Math.max(RATING_FLOOR, player.rating + winnerGains[i]),
  }));
  const updatedLosers = losers.map((player, i) => ({
    ...player,
    rating: Math.max(RATING_FLOOR, player.rating - loserLosses[i]),
  }));

  return { updatedWinners, updatedLosers };
}

function proposedEngine(winners, losers, scoreW, scoreL, k, marginWeight) {
  const RATING_FLOOR = 100;
  const ratingW = arithmeticMean(winners);
  const ratingL = arithmeticMean(losers);
  const margin = Math.abs(scoreW - scoreL);
  const mult = 1 + marginWeight * Math.log(1 + margin);

  const updatedWinners = winners.map((player) => {
    const e = 1 / (1 + Math.pow(10, (ratingL - player.rating) / 400));
    const gain = Math.round(k * mult * (1 - e));
    return { ...player, rating: Math.max(RATING_FLOOR, player.rating + gain) };
  });

  const updatedLosers = losers.map((player) => {
    const e = 1 / (1 + Math.pow(10, (ratingW - player.rating) / 400));
    const loss = Math.round(k * mult * e);
    return { ...player, rating: Math.max(RATING_FLOOR, player.rating - loss) };
  });

  return { updatedWinners, updatedLosers };
}

function getEventDay(dateStr) {
  return dateStr.split(' ')[0];
}

function runBacktest(
  matches,
  engine,
  seedingStrategy,
  engineName,
  engineParams,
) {
  const players = {};
  let logLossSum = 0;
  let brierSum = 0;
  let predictions = 0;
  let correctUpsetPredictions = 0;
  let totalUpsets = 0;
  let predictedProbSum = 0;
  let actualWinSum = 0;
  let probBuckets = {};
  let lastEventDay = null;

  for (const match of matches) {
    const eventDay = getEventDay(match.date);

    if (seedingStrategy === 'reset_per_event') {
      if (lastEventDay !== eventDay) {
        for (const key of Object.keys(players)) delete players[key];
        lastEventDay = eventDay;
      }
    } else if (seedingStrategy === 'continuous_1500' && lastEventDay === null) {
      for (const key of Object.keys(players)) delete players[key];
      lastEventDay = 'continuous';
    }

    const teamA = match.teamA.map((p) => {
      if (!players[p.username]) {
        const seedRating =
          seedingStrategy === 'first_observed' ? p.rating || 1500 : 1500;
        players[p.username] = { ...p, rating: seedRating };
      }
      return players[p.username];
    });
    const teamB = match.teamB.map((p) => {
      if (!players[p.username]) {
        const seedRating =
          seedingStrategy === 'first_observed' ? p.rating || 1500 : 1500;
        players[p.username] = { ...p, rating: seedRating };
      }
      return players[p.username];
    });

    const ratingA = arithmeticMean(teamA);
    const ratingB = arithmeticMean(teamB);
    const probA = expected(ratingA, ratingB);
    const probB = 1 - probA;
    const actualA = match.teamAScore > match.teamBScore ? 1 : 0;

    const predictedWinner = probA >= 0.5 ? 'A' : 'B';
    const actualWinner = actualA === 1 ? 'A' : 'B';
    const isUpset = predictedWinner !== actualWinner;
    if (isUpset) totalUpsets += 1;
    if (predictedWinner === actualWinner) correctUpsetPredictions += 1;

    const predictedProb = actualA === 1 ? probA : probB;
    const actualResult = actualA;
    logLossSum -=
      actualResult * Math.log(Math.max(0.0001, predictedProb)) +
      (1 - actualResult) * Math.log(Math.max(0.0001, 1 - predictedProb));
    brierSum += Math.pow(actualResult - predictedProb, 2);
    predictions += 1;
    predictedProbSum += predictedProb;
    actualWinSum += actualResult;

    const bucket = Math.round(probA * 10) / 10;
    if (!probBuckets[bucket]) probBuckets[bucket] = { count: 0, wins: 0 };
    probBuckets[bucket].count += 1;
    probBuckets[bucket].wins += actualA;

    const teamAWon = match.teamAScore > match.teamBScore;
    const winners = teamAWon ? teamA : teamB;
    const losers = teamAWon ? teamB : teamA;
    const scoreW = teamAWon ? match.teamAScore : match.teamBScore;
    const scoreL = teamAWon ? match.teamBScore : match.teamAScore;

    let result;
    if (engineName === 'current') {
      result = currentEngine(winners, losers, scoreW, scoreL);
    } else {
      result = proposedEngine(
        winners,
        losers,
        scoreW,
        scoreL,
        engineParams.k,
        engineParams.marginWeight,
      );
    }

    for (const p of result.updatedWinners) players[p.username] = p;
    for (const p of result.updatedLosers) players[p.username] = p;
  }

  const logLoss = logLossSum / predictions;
  const brier = brierSum / predictions;
  const accuracy = correctUpsetPredictions / predictions;
  const upsetAccuracy =
    totalUpsets > 0 ? correctUpsetPredictions / totalUpsets : 0;
  const calibration = Object.entries(probBuckets)
    .map(([prob, data]) => ({
      prob: parseFloat(prob),
      count: data.count,
      actualRate: data.count > 0 ? data.wins / data.count : 0,
      error:
        data.count > 0
          ? Math.abs(parseFloat(prob) - data.wins / data.count)
          : 0,
    }))
    .sort((a, b) => a.prob - b.prob);

  return {
    engineName,
    seedingStrategy,
    engineParams,
    logLoss,
    brier,
    accuracy,
    upsetAccuracy,
    totalUpsets,
    predictions,
    calibration,
    meanPredictedProb: predictedProbSum / predictions,
    meanActualWin: actualWinSum / predictions,
  };
}

// ============================================================
// FAIRNESS ANALYSIS: measures drift (zero-sum violation) and
// calibration, comparing engine variants the prediction grid
// can't distinguish.
// ============================================================

// per-player Elo returning raw deltas; teamMetric selectable
function perPlayerDeltas(winners, losers, sW, sL, { k, mw, teamMetric }) {
  const metric = teamMetric === 'harmonic' ? harmonicMean : arithmeticMean;
  const rW = metric(winners);
  const rL = metric(losers);
  const mult = 1 + mw * Math.log(1 + Math.abs(sW - sL));
  const wd = winners.map((p) =>
    Math.round(k * mult * (1 - expected(p.rating, rL))),
  );
  const ld = losers.map((p) => -Math.round(k * mult * expected(p.rating, rW)));
  return { wd, ld };
}

// zero-sum per-player: a single pool distributed by individual weights
function zeroSumDeltas(winners, losers, sW, sL, { k, mw }) {
  const rW = arithmeticMean(winners);
  const rL = arithmeticMean(losers);
  const mult = 1 + mw * Math.log(1 + Math.abs(sW - sL));
  const pool = Math.round(k * mult * (1 - expected(rW, rL)));
  const wWeights = winners.map((p) => 1 - expected(p.rating, rL));
  const lWeights = losers.map((p) => expected(p.rating, rW));
  const wd = allocateInteger(pool, wWeights);
  const ld = allocateInteger(pool, lWeights).map((x) => -x);
  return { wd, ld };
}

// zero-sum equal split: no partner differentiation, no carry effect
function equalSplitDeltas(winners, losers, sW, sL, { k, mw }) {
  const rW = arithmeticMean(winners);
  const rL = arithmeticMean(losers);
  const mult = 1 + mw * Math.log(1 + Math.abs(sW - sL));
  const pool = Math.round(k * mult * (1 - expected(rW, rL)));
  const share = Math.floor(pool / winners.length);
  const wd = winners.map(() => share);
  wd[0] += pool - share * winners.length;
  const ld = losers.map(() => -share);
  ld[0] -= pool - share * losers.length;
  return { wd, ld };
}

// zero-sum gap-adjusted: reduce underdog credit when partner gap is large
function gapAdjustedDeltas(winners, losers, sW, sL, { k, mw, gapFactor }) {
  const rW = arithmeticMean(winners);
  const rL = arithmeticMean(losers);
  const mult = 1 + mw * Math.log(1 + Math.abs(sW - sL));
  const pool = Math.round(k * mult * (1 - expected(rW, rL)));

  const adjust = (arr, isWinners) =>
    arr.map((p, i) => {
      const partner = arr[(i + 1) % arr.length];
      const gap = Math.abs(partner.rating - p.rating);
      const base = isWinners
        ? 1 - expected(p.rating, rL)
        : expected(p.rating, rW);
      // If I'm the weaker partner, shrink my share as the partner gap grows
      const weaker = p.rating < partner.rating;
      const penalty = weaker ? Math.max(0.1, 1 - (gapFactor * gap) / 400) : 1;
      return base * penalty;
    });

  const wWeights = adjust(winners, true);
  const lWeights = adjust(losers, false);
  const wd = allocateInteger(pool, wWeights);
  const ld = allocateInteger(pool, lWeights).map((x) => -x);
  return { wd, ld };
}

// zero-sum rating-proportional: higher-rated player gets more credit (reverse of current)
function ratingProportionalDeltas(winners, losers, sW, sL, { k, mw }) {
  const rW = arithmeticMean(winners);
  const rL = arithmeticMean(losers);
  const mult = 1 + mw * Math.log(1 + Math.abs(sW - sL));
  const pool = Math.round(k * mult * (1 - expected(rW, rL)));
  const wWeights = winners.map((p) => p.rating);
  const lWeights = losers.map((p) => p.rating);
  const wd = allocateInteger(pool, wWeights);
  const ld = allocateInteger(pool, lWeights).map((x) => -x);
  return { wd, ld };
}

// current pooled engine returning raw deltas (for drift comparison)
function currentDeltas(winners, losers, sW, sL) {
  const r = currentEngine(winners, losers, sW, sL);
  const wd = r.updatedWinners.map((p, i) => p.rating - winners[i].rating);
  const ld = r.updatedLosers.map((p, i) => p.rating - losers[i].rating);
  return { wd, ld };
}

function analyzeFairness(matches, deltaFn, params, label, reset = true) {
  const players = {};
  let lastDay = null;
  let signedDrift = 0;
  let absDrift = 0;
  let logLoss = 0;
  let brier = 0;
  let n = 0;
  const buckets = {};
  // Partner differentiation: of teams whose 2 players have different ratings,
  // how often do they receive a DIFFERENT point change? (the user's objective)
  let diffEligible = 0;
  let diffActual = 0;

  for (const m of matches) {
    const day = m.date.split(' ')[0];
    if (reset && lastDay !== day) {
      for (const k of Object.keys(players)) delete players[k];
      lastDay = day;
    }
    const hydrate = (arr) =>
      arr.map((p) => {
        if (!players[p.username]) players[p.username] = { ...p, rating: 1500 };
        return players[p.username];
      });
    const tA = hydrate(m.teamA);
    const tB = hydrate(m.teamB);

    const pA = expected(arithmeticMean(tA), arithmeticMean(tB));
    const aWon = m.teamAScore > m.teamBScore ? 1 : 0;
    logLoss -=
      aWon * Math.log(Math.max(1e-4, pA)) +
      (1 - aWon) * Math.log(Math.max(1e-4, 1 - pA));
    brier += Math.pow(aWon - pA, 2);
    n++;
    const b = Math.round(pA * 10) / 10;
    if (!buckets[b]) buckets[b] = { c: 0, w: 0 };
    buckets[b].c++;
    buckets[b].w += aWon;

    const aWonBool = aWon === 1;
    const winners = aWonBool ? tA : tB;
    const losers = aWonBool ? tB : tA;
    const sW = aWonBool ? m.teamAScore : m.teamBScore;
    const sL = aWonBool ? m.teamBScore : m.teamAScore;
    const { wd, ld } = deltaFn(winners, losers, sW, sL, params);
    const totalGain = wd.reduce((s, x) => s + x, 0);
    const totalLoss = -ld.reduce((s, x) => s + x, 0);
    signedDrift += totalGain - totalLoss;
    absDrift += Math.abs(totalGain - totalLoss);

    // Partner differentiation check (teams of 2 with unequal ratings)
    const checkTeam = (team, deltas) => {
      if (team.length === 2 && team[0].rating !== team[1].rating) {
        diffEligible++;
        if (deltas[0] !== deltas[1]) diffActual++;
      }
    };
    checkTeam(winners, wd);
    checkTeam(losers, ld);
    winners.forEach(
      (p, i) =>
        (players[p.username] = {
          ...p,
          rating: Math.max(100, p.rating + wd[i]),
        }),
    );
    losers.forEach(
      (p, i) =>
        (players[p.username] = {
          ...p,
          rating: Math.max(100, p.rating + ld[i]),
        }),
    );
  }
  const calMae =
    Object.entries(buckets).reduce(
      (s, [prob, d]) => s + d.c * Math.abs(parseFloat(prob) - d.w / d.c),
      0,
    ) / n;
  // Long-term health: total accumulated drift and final rating spread.
  const finalRatings = Object.values(players).map((p) => p.rating);
  const meanRating =
    finalRatings.reduce((s, r) => s + r, 0) / (finalRatings.length || 1);
  const ratingStd = Math.sqrt(
    finalRatings.reduce((s, r) => s + (r - meanRating) ** 2, 0) /
      (finalRatings.length || 1),
  );
  return {
    label,
    logLoss: logLoss / n,
    brier: brier / n,
    calMae,
    signedDriftPerMatch: signedDrift / n,
    absDriftPerMatch: absDrift / n,
    partnerDiffRate: diffEligible > 0 ? diffActual / diffEligible : 0,
    totalDrift: signedDrift,
    meanRating,
    ratingStd,
  };
}

function runFairnessAnalysis(sortedMatches) {
  console.log(
    '\n\n=== FAIRNESS ANALYSIS (reset_per_event, drift + calibration) ===',
  );
  const configs = [
    [
      'IMPLEMENTED perPlayer arith k20 mw0.1',
      perPlayerDeltas,
      { k: 20, mw: 0.1, teamMetric: 'arithmetic' },
    ],
    [
      'perPlayer arith k20 mw0.3',
      perPlayerDeltas,
      { k: 20, mw: 0.3, teamMetric: 'arithmetic' },
    ],
    [
      'perPlayer arith k20 mw0.5',
      perPlayerDeltas,
      { k: 20, mw: 0.5, teamMetric: 'arithmetic' },
    ],
    [
      'perPlayer HARMONIC k20 mw0.1',
      perPlayerDeltas,
      { k: 20, mw: 0.1, teamMetric: 'harmonic' },
    ],
    [
      'perPlayer arith k32 mw0.1',
      perPlayerDeltas,
      { k: 32, mw: 0.1, teamMetric: 'arithmetic' },
    ],
    ['ZERO-SUM perPlayer k20 mw0.1', zeroSumDeltas, { k: 20, mw: 0.1 }],
    ['ZERO-SUM perPlayer k30 mw0.1', zeroSumDeltas, { k: 30, mw: 0.1 }],
    ['ZERO-SUM perPlayer k40 mw0.1', zeroSumDeltas, { k: 40, mw: 0.1 }],
    ['ZERO-SUM perPlayer k48 mw0.1', zeroSumDeltas, { k: 48, mw: 0.1 }],
    ['ZERO-SUM perPlayer k56 mw0.1', zeroSumDeltas, { k: 56, mw: 0.1 }],
    ['ZERO-SUM perPlayer k40 mw0.2', zeroSumDeltas, { k: 40, mw: 0.2 }],
    ['ZERO-SUM perPlayer k40 mw0.3', zeroSumDeltas, { k: 40, mw: 0.3 }],
    ['ZERO-SUM equal split k48', equalSplitDeltas, { k: 48, mw: 0.1 }],
    [
      'ZERO-SUM gapAdjust 0.5 k48',
      gapAdjustedDeltas,
      { k: 48, mw: 0.1, gapFactor: 0.5 },
    ],
    [
      'ZERO-SUM gapAdjust 0.75 k48',
      gapAdjustedDeltas,
      { k: 48, mw: 0.1, gapFactor: 0.75 },
    ],
    [
      'ZERO-SUM gapAdjust 1.0 k48',
      gapAdjustedDeltas,
      { k: 48, mw: 0.1, gapFactor: 1.0 },
    ],
    [
      'ZERO-SUM gapAdjust 2.0 k48',
      gapAdjustedDeltas,
      { k: 48, mw: 0.1, gapFactor: 2.0 },
    ],
    ['ZERO-SUM ratingProp k48', ratingProportionalDeltas, { k: 48, mw: 0.1 }],
    ['CURRENT pooled harmonic', currentDeltas, {}],
  ];
  const rows = configs.map(([label, fn, params]) =>
    analyzeFairness(sortedMatches, fn, params, label),
  );
  console.log(
    'Engine'.padEnd(40),
    'logLoss',
    'brier ',
    'calMAE',
    ' drift/m',
    'absDrift/m',
    'partnerDiff%',
  );
  console.log('-'.repeat(108));
  for (const r of rows) {
    console.log(
      r.label.padEnd(40),
      r.logLoss.toFixed(4),
      r.brier.toFixed(4),
      r.calMae.toFixed(4),
      r.signedDriftPerMatch.toFixed(3).padStart(7),
      r.absDriftPerMatch.toFixed(3).padStart(9),
      (r.partnerDiffRate * 100).toFixed(1).padStart(9),
    );
  }
  console.log('\nLegend:');
  console.log(
    '- logLoss coin-flip baseline = 0.6931 (matchmaking balances games -> near 0.69).',
  );
  console.log(
    '- calMAE: calibration error; lower = predicted win-rate matches reality = fairer.',
  );
  console.log(
    '- drift/m: mean(winnerGain - loserLoss); 0 = zero-sum, + = inflation.',
  );
  console.log('- absDrift/m: avg magnitude of per-match zero-sum violation.');

  // ---- LONG-TERM: continuous replay, NO date reset (date used only as sort order) ----
  console.log(
    '\n\n=== LONG-TERM ANALYSIS (continuous replay, NO reset — date is only sort order) ===',
  );
  const ltRows = configs.map(([label, fn, params]) =>
    analyzeFairness(sortedMatches, fn, params, label, false),
  );
  console.log(
    'Engine'.padEnd(40),
    'calMAE',
    'totalDrift',
    'meanRating',
    'ratingStd',
    'partnerDiff%',
  );
  console.log('-'.repeat(108));
  for (const r of ltRows) {
    console.log(
      r.label.padEnd(40),
      r.calMae.toFixed(4),
      r.totalDrift.toFixed(0).padStart(9),
      r.meanRating.toFixed(0).padStart(10),
      r.ratingStd.toFixed(1).padStart(9),
      (r.partnerDiffRate * 100).toFixed(1).padStart(11),
    );
  }
  console.log('\nLong-term legend:');
  console.log(
    '- totalDrift: cumulative rating created/destroyed over ALL matches. 0 = perfectly conserved.',
  );
  console.log(
    '- meanRating: should stay ~1500 long-term. Far from 1500 = systematic inflation/deflation.',
  );
  console.log(
    '- ratingStd: final spread of skill. Higher = ratings separate players more (to a point).',
  );

  fs.writeFileSync(
    path.join(__dirname, '..', 'test', 'fixtures', 'fairness-results.json'),
    JSON.stringify({ shortTerm: rows, longTerm: ltRows }, null, 2),
  );
  console.log(
    '\nFairness results written to test/fixtures/fairness-results.json',
  );
}

// Print real CSV examples with player-by-player gains/losses under the new engine.
function printExampleTables(sortedMatches) {
  console.log(
    '\n\n=== EXAMPLE MATCHES: player-by-player gains/losses (zero-sum per-player k=48, mw=0.1) ===',
  );

  // Pick a representative sample across scores and team balance
  const pickIds = [6, 18, 28, 10, 50, 100];
  const sample = pickIds
    .map((id) => sortedMatches.find((m) => m.idx + 2 === id))
    .filter(Boolean);

  for (const m of sample) {
    const aWon = m.teamAScore > m.teamBScore;
    const winners = aWon ? m.teamA : m.teamB;
    const losers = aWon ? m.teamB : m.teamA;
    const sW = aWon ? m.teamAScore : m.teamBScore;
    const sL = aWon ? m.teamBScore : m.teamAScore;
    const { wd, ld } = zeroSumDeltas(winners, losers, sW, sL, {
      k: 48,
      mw: 0.1,
    });

    console.log(
      `\nMatch #${m.idx + 2} | ${m.date.split(' ')[0]} | ${
        aWon
          ? m.teamA.map((p) => p.name || p.username || 'Unknown').join(' + ')
          : m.teamB.map((p) => p.name || p.username || 'Unknown').join(' + ')
      } ${sW}-${sL} ${
        aWon
          ? m.teamB.map((p) => p.name || p.username || 'Unknown').join(' + ')
          : m.teamA.map((p) => p.name || p.username || 'Unknown').join(' + ')
      }`,
    );
    const fmtName = (p) => (p.name || p.username || 'Unknown').padEnd(14);
    console.log('WINNERS');
    winners.forEach((p, i) =>
      console.log(
        `  ${fmtName(p)} rating=${p.rating.toString().padStart(4)}  +${wd[i].toString().padStart(2)} -> ${p.rating + wd[i]}`,
      ),
    );
    console.log('LOSERS');
    losers.forEach((p, i) =>
      console.log(
        `  ${fmtName(p)} rating=${p.rating.toString().padStart(4)}  -${Math.abs(ld[i]).toString().padStart(2)} -> ${p.rating + ld[i]}`,
      ),
    );
  }
}

// Analyze the 6/18 event across multiple engine variants to find the best
// balance between partner differentiation and carry-prevention.
function analyzeCarryComplaint() {
  const raw = fs.readFileSync(NEW_CSV_PATH, 'utf8');
  const allMatches = parseCsv(raw);
  const doublesMatches = allMatches.filter((m) => m.matchType === 'doubles');
  const sortedMatches = [...doublesMatches].sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  );

  const getKey = (p) => p.username || p.name;
  const trackNames = ['EddieWow Datuin jr', 'romel saclolo', 'Rommel Sandoval'];

  const variants = [
    ['CURRENT underdog-credit', zeroSumDeltas, { k: 48, mw: 0.1 }],
    ['Equal split', equalSplitDeltas, { k: 48, mw: 0.1 }],
    ['Gap-adjusted 0.5', gapAdjustedDeltas, { k: 48, mw: 0.1, gapFactor: 0.5 }],
    [
      'Gap-adjusted 0.75',
      gapAdjustedDeltas,
      { k: 48, mw: 0.1, gapFactor: 0.75 },
    ],
    ['Gap-adjusted 1.0', gapAdjustedDeltas, { k: 48, mw: 0.1, gapFactor: 1.0 }],
    ['Gap-adjusted 2.0', gapAdjustedDeltas, { k: 48, mw: 0.1, gapFactor: 2.0 }],
    ['Rating-proportional', ratingProportionalDeltas, { k: 48, mw: 0.1 }],
  ];

  console.log('\n\n=== CARRY COMPLAINT ANALYSIS (6/18 event) ===');
  console.log('Comparing how each engine splits points between partners.');

  const carryResults = [];

  for (const [label, deltaFn, params] of variants) {
    const players = {};
    const hydrate = (arr) =>
      arr.map((p) => ({
        ...p,
        rating: players[getKey(p)]?.rating || p.rating || 1500,
      }));
    const history = Object.fromEntries(trackNames.map((n) => [n, []]));

    for (const m of sortedMatches) {
      const aWon = m.teamAScore > m.teamBScore;
      const winners = hydrate(aWon ? m.teamA : m.teamB);
      const losers = hydrate(aWon ? m.teamB : m.teamA);
      const sW = aWon ? m.teamAScore : m.teamBScore;
      const sL = aWon ? m.teamBScore : m.teamAScore;
      const { wd, ld } = deltaFn(winners, losers, sW, sL, params);

      const record = (arr, deltas, result, oppArr) =>
        arr.forEach((p, i) => {
          const key = getKey(p);
          players[key] = { ...p, rating: p.rating + deltas[i] };
          if (trackNames.includes(p.name)) {
            const partner = arr[(i + 1) % arr.length];
            history[p.name].push({
              matchId: m.matchId,
              score: `${sW}-${sL}`,
              partner: partner.name || partner.username || 'Unknown',
              opp: oppArr
                .map((x) => x.name || x.username || 'Unknown')
                .join(' + '),
              before: p.rating,
              change: deltas[i],
              after: p.rating + deltas[i],
              result,
            });
          }
        });

      record(winners, wd, 'W', losers);
      record(losers, ld, 'L', winners);
    }

    console.log(`\n--- ${label} ---`);
    const perEngine = { engine: label, players: [] };
    for (const name of trackNames) {
      const rows = history[name];
      if (rows.length === 0) continue;
      const net = rows.reduce((s, r) => s + r.change, 0);
      const headToHead = rows.filter(
        (r) => r.opp.includes('EddieWow') || r.opp.includes('romel saclolo'),
      );
      const h2hNet = headToHead.reduce((s, r) => s + r.change, 0);
      console.log(
        `  ${name.padEnd(18)} net=${(net > 0 ? '+' : '').padStart(1)}${net.toString().padStart(3)}  vsEddie/Romel=${(h2hNet > 0 ? '+' : '').padStart(1)}${h2hNet.toString().padStart(3)}  (${rows.length} matches)`,
      );
      perEngine.players.push({ name, net, h2hNet, matches: rows.length });
    }
    carryResults.push(perEngine);
  }

  fs.writeFileSync(
    path.join(__dirname, '..', 'test', 'fixtures', 'carry-analysis.json'),
    JSON.stringify(carryResults, null, 2),
  );
  console.log('\nCarry analysis written to test/fixtures/carry-analysis.json');
}

// Synthetic scenario simulator: grid of weak/strong, equal/unequal, upset/favorite, blowout/close.
function simulateScenarios() {
  const variants = [
    ['CURRENT underdog-credit', zeroSumDeltas, { k: 48, mw: 0.1 }],
    ['Equal split', equalSplitDeltas, { k: 48, mw: 0.1 }],
    ['Gap-adjusted 0.5', gapAdjustedDeltas, { k: 48, mw: 0.1, gapFactor: 0.5 }],
    [
      'Gap-adjusted 0.75',
      gapAdjustedDeltas,
      { k: 48, mw: 0.1, gapFactor: 0.75 },
    ],
    ['Gap-adjusted 1.0', gapAdjustedDeltas, { k: 48, mw: 0.1, gapFactor: 1.0 }],
    ['Gap-adjusted 2.0', gapAdjustedDeltas, { k: 48, mw: 0.1, gapFactor: 2.0 }],
    ['Rating-proportional', ratingProportionalDeltas, { k: 48, mw: 0.1 }],
  ];

  const scenarios = [
    // description, p1, p2, opp1, opp2, scoreW, scoreL
    ['weak+strong vs balanced, upset win', 1300, 1700, 1500, 1500, 11, 9],
    ['weak+strong vs balanced, blowout upset', 1300, 1700, 1500, 1500, 11, 1],
    ['weak+strong vs balanced, close loss', 1300, 1700, 1500, 1500, 9, 11],
    ['weak+strong vs strong, upset win', 1300, 1700, 1700, 1700, 11, 9],
    ['balanced vs balanced, win', 1500, 1500, 1500, 1500, 11, 9],
    ['balanced vs weak, expected win', 1500, 1500, 1300, 1300, 11, 3],
    ['strong vs weak, expected win', 1700, 1700, 1300, 1300, 11, 3],
    ['strong+weak vs strong+weak, win', 1700, 1300, 1600, 1400, 11, 9],
    ['huge gap partner vs balanced, win', 1200, 1800, 1500, 1500, 11, 9],
    [
      'huge gap partner vs balanced, blowout win',
      1200,
      1800,
      1500,
      1500,
      11,
      2,
    ],
    ['huge gap partner vs balanced, loss', 1200, 1800, 1500, 1500, 5, 11],
    ['weak+weak vs strong+strong, upset win', 1300, 1300, 1700, 1700, 11, 9],
    ['strong+strong vs weak+weak, blowout win', 1700, 1700, 1300, 1300, 11, 1],
  ];

  const allResults = [];

  console.log(
    '\n\n=== SYNTHETIC SCENARIO SIMULATION (all partner/skill combinations) ===',
  );

  for (const [label, deltaFn, params] of variants) {
    console.log(`\n--- ${label} ---`);
    console.log(
      'Scenario'.padEnd(38),
      'TeamAvg',
      'OppAvg',
      'P1'.padStart(5),
      'P2'.padStart(5),
      'P1Chg',
      'P2Chg',
      'CarryScore',
    );
    console.log('-'.repeat(95));
    for (const [desc, p1, p2, o1, o2, sTeam, sOpp] of scenarios) {
      const teamA = [
        { name: 'P1', rating: p1 },
        { name: 'P2', rating: p2 },
      ];
      const teamB = [
        { name: 'O1', rating: o1 },
        { name: 'O2', rating: o2 },
      ];
      const teamWon = sTeam > sOpp;
      const winners = teamWon ? teamA : teamB;
      const losers = teamWon ? teamB : teamA;
      const sW = teamWon ? sTeam : sOpp;
      const sL = teamWon ? sOpp : sTeam;
      const { wd, ld } = deltaFn(winners, losers, sW, sL, params);
      const p1Change = teamWon ? wd[0] : ld[0];
      const p2Change = teamWon ? wd[1] : ld[1];
      const teamAvg = (p1 + p2) / 2;
      const oppAvg = (o1 + o2) / 2;
      // Carry score: how much more the weaker partner gains than the stronger.
      // Positive = weaker partner gets more (potential carry). Negative = stronger gets more.
      const weakChange = p1 < p2 ? p1Change : p2Change;
      const strongChange = p1 < p2 ? p2Change : p1Change;
      const carryScore = weakChange - strongChange;
      console.log(
        desc.padEnd(38),
        teamAvg.toFixed(0).padStart(6),
        oppAvg.toFixed(0).padStart(6),
        p1.toString().padStart(5),
        p2.toString().padStart(5),
        (p1Change > 0 ? '+' : '').padStart(1) + p1Change.toString().padStart(4),
        (p2Change > 0 ? '+' : '').padStart(1) + p2Change.toString().padStart(4),
        (carryScore > 0 ? '+' : '').padStart(1) +
          carryScore.toString().padStart(4),
      );
      allResults.push({
        engine: label,
        scenario: desc,
        p1,
        p2,
        o1,
        o2,
        sW,
        sL,
        p1Change,
        p2Change,
        carryScore,
      });
    }
  }

  fs.writeFileSync(
    path.join(__dirname, '..', 'test', 'fixtures', 'scenario-simulation.json'),
    JSON.stringify(allResults, null, 2),
  );
  console.log(
    '\nScenario results written to test/fixtures/scenario-simulation.json',
  );
}

function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const allMatches = parseCsv(raw);
  const doublesMatches = allMatches.filter((m) => m.matchType === 'doubles');
  const sortedMatches = [...doublesMatches].sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  );

  console.log(`Loaded ${doublesMatches.length} doubles matches`);

  const seedingStrategies = [
    'reset_per_event',
    'first_observed',
    'continuous_1500',
  ];
  const kValues = [12, 16, 20, 24, 32];
  const marginWeights = [0.1, 0.15, 0.2];

  const results = [];

  for (const seeding of seedingStrategies) {
    console.log(`\nRunning seeding: ${seeding}`);
    const current = runBacktest(
      sortedMatches,
      currentEngine,
      seeding,
      'current',
      {},
    );
    results.push(current);
    console.log(
      `  current: logLoss=${current.logLoss.toFixed(4)} brier=${current.brier.toFixed(4)} acc=${current.accuracy.toFixed(3)}`,
    );

    for (const k of kValues) {
      for (const mw of marginWeights) {
        const proposed = runBacktest(
          sortedMatches,
          proposedEngine,
          seeding,
          'proposed',
          { k, marginWeight: mw },
        );
        results.push(proposed);
      }
    }
  }

  const bestByLogLoss = [...results].sort((a, b) => a.logLoss - b.logLoss)[0];
  const bestByBrier = [...results].sort((a, b) => a.brier - b.brier)[0];

  console.log('\n=== BEST BY LOG-LOSS ===');
  console.log(
    `engine=${bestByLogLoss.engineName} seeding=${bestByLogLoss.seedingStrategy} k=${bestByLogLoss.engineParams?.k} mw=${bestByLogLoss.engineParams?.marginWeight}`,
  );
  console.log(
    `logLoss=${bestByLogLoss.logLoss.toFixed(4)} brier=${bestByLogLoss.brier.toFixed(4)} acc=${bestByLogLoss.accuracy.toFixed(3)} upsetAcc=${bestByLogLoss.upsetAccuracy.toFixed(3)} (${bestByLogLoss.totalUpsets} upsets)`,
  );

  console.log('\n=== BEST BY BRIER ===');
  console.log(
    `engine=${bestByBrier.engineName} seeding=${bestByBrier.seedingStrategy} k=${bestByBrier.engineParams?.k} mw=${bestByBrier.engineParams?.marginWeight}`,
  );
  console.log(
    `logLoss=${bestByBrier.logLoss.toFixed(4)} brier=${bestByBrier.brier.toFixed(4)} acc=${bestByBrier.accuracy.toFixed(3)} upsetAcc=${bestByBrier.upsetAccuracy.toFixed(3)} (${bestByBrier.totalUpsets} upsets)`,
  );

  console.log('\n=== TOP 10 BY LOG-LOSS ===');
  [...results]
    .sort((a, b) => a.logLoss - b.logLoss)
    .slice(0, 10)
    .forEach((r, i) => {
      const params =
        r.engineName === 'current'
          ? ''
          : ` k=${r.engineParams.k} mw=${r.engineParams.marginWeight}`;
      console.log(
        `${i + 1}. ${r.engineName} ${r.seedingStrategy}${params} | logLoss=${r.logLoss.toFixed(4)} brier=${r.brier.toFixed(4)} acc=${r.accuracy.toFixed(3)}`,
      );
    });

  console.log('\n=== CURRENT ENGINE BASELINE ===');
  results
    .filter((r) => r.engineName === 'current')
    .forEach((r) => {
      console.log(
        `${r.seedingStrategy}: logLoss=${r.logLoss.toFixed(4)} brier=${r.brier.toFixed(4)} acc=${r.accuracy.toFixed(3)} upsetAcc=${r.upsetAccuracy.toFixed(3)} (${r.totalUpsets} upsets)`,
      );
    });

  console.log('\n=== PROPOSED ENGINE TOP-PERFORMER BY SEEDING ===');
  for (const seeding of seedingStrategies) {
    const bestProposed = results
      .filter(
        (r) => r.engineName === 'proposed' && r.seedingStrategy === seeding,
      )
      .sort((a, b) => a.logLoss - b.logLoss)[0];
    if (bestProposed) {
      console.log(
        `${seeding}: k=${bestProposed.engineParams.k} mw=${bestProposed.engineParams.marginWeight} logLoss=${bestProposed.logLoss.toFixed(4)} brier=${bestProposed.brier.toFixed(4)} acc=${bestProposed.accuracy.toFixed(3)}`,
      );
    }
  }

  fs.writeFileSync(
    path.join(__dirname, '..', 'test', 'fixtures', 'backtest-results.json'),
    JSON.stringify(results, null, 2),
  );
  console.log('\nFull results written to test/fixtures/backtest-results.json');

  runFairnessAnalysis(sortedMatches);
  printExampleTables(sortedMatches);
  analyzeCarryComplaint();
  simulateScenarios();
}

main();
