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

function parseCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  return lines.slice(1).map((line, idx) => {
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
  if (field.startsWith('"') && field.endsWith('"')) field = field.slice(1, -1);
  return field.replace(/""/g, '"');
}

function splitLastTwoFields(rest) {
  let inQuotes = false;
  for (let i = 0; i < rest.length; i++) {
    const char = rest[i];
    const nextChar = rest[i + 1];
    if (char === '"' && nextChar === '"') {
      i++;
      continue;
    }
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes)
      return [rest.slice(0, i), rest.slice(i + 1)];
  }
  return [rest, '[]'];
}

function arithmeticMean(players) {
  if (players.length === 0) return 1500;
  return players.reduce((s, p) => s + (p.rating || 1500), 0) / players.length;
}

function harmonicMean(players) {
  if (players.length === 0) return 1500;
  const sum = players.reduce(
    (s, p) => s + 1 / Math.max(1, p.rating || 1500),
    0,
  );
  return players.length / sum;
}

function softHarmonicMean(players) {
  return 0.6 * harmonicMean(players) + 0.4 * arithmeticMean(players);
}

function minRating(players) {
  return Math.min(...players.map((p) => p.rating || 1500));
}

function expected(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
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

function capWeights(weights, maxRatio) {
  if (weights.length < 2 || maxRatio <= 0) return weights;
  const max = Math.max(...weights);
  if (max <= 0) return weights;
  const minAllowed = max / maxRatio;
  return weights.map((w) => Math.max(w, minAllowed));
}

function teamRating(players, metric) {
  if (metric === 'harmonic') return harmonicMean(players);
  if (metric === 'softHarmonic') return softHarmonicMean(players);
  if (metric === 'min') return minRating(players);
  return arithmeticMean(players);
}

function fieldAvgOthers(players, p) {
  const all = [...players];
  return (all.reduce((s, x) => s + x.rating, 0) - p.rating) / (all.length - 1);
}

function calculateShift(winners, losers, scoreW, scoreL, params) {
  const {
    kSingles,
    kDoubles,
    marginWeight,
    partnerGapFactor,
    lossUnderdogBlend,
    maxPartnerRatio,
    teamMetric,
    winnerMode,
    loserMode,
  } = params;
  const ratingW = teamRating(winners, teamMetric);
  const ratingL = teamRating(losers, teamMetric);
  const margin = Math.abs(scoreW - scoreL);
  const multiplier = 1 + marginWeight * Math.log(1 + margin);
  const K = winners.length === 1 ? kSingles : kDoubles;
  const expectedW = expected(ratingW, ratingL);
  const pool = Math.round(K * multiplier * (1 - expectedW));
  if (pool <= 0) {
    return {
      winnerGains: winners.map(() => 0),
      loserLosses: losers.map(() => 0),
    };
  }

  const allPlayers = [...winners, ...losers];
  let wWeights;
  if (winnerMode === 'equal') {
    wWeights = winners.map(() => 1);
  } else if (winnerMode === 'ratingProp') {
    wWeights = winners.map((p) => p.rating);
  } else if (winnerMode === 'fieldRelProp') {
    wWeights = winners.map((p) => p.rating / fieldAvgOthers(allPlayers, p));
  } else {
    // antiCarry or underdog
    wWeights = winners.map((p) => 1 - expected(p.rating, ratingL));
    if (winnerMode === 'antiCarry') {
      wWeights = wWeights.map((base, i) => {
        const p = winners[i];
        const partner = winners[(i + 1) % winners.length];
        const gap = Math.abs(partner.rating - p.rating);
        const weaker = p.rating < partner.rating;
        const penalty = weaker
          ? Math.max(0.1, 1 - (partnerGapFactor * gap) / 400)
          : 1;
        return base * penalty;
      });
    }
  }

  let lWeights;
  if (loserMode === 'equal') {
    lWeights = losers.map(() => 1);
  } else if (loserMode === 'ratingProp') {
    lWeights = losers.map((p) => p.rating);
  } else if (loserMode === 'fieldRelProp') {
    lWeights = losers.map((p) => p.rating / fieldAvgOthers(allPlayers, p));
  } else {
    // softUnderdog or underdog
    lWeights = losers.map((p) => {
      const e = expected(p.rating, ratingW);
      return 1 - lossUnderdogBlend + lossUnderdogBlend * e;
    });
  }

  const winnerGains = allocateInteger(
    pool,
    capWeights(wWeights, maxPartnerRatio),
  );
  const loserLosses = allocateInteger(
    pool,
    capWeights(lWeights, maxPartnerRatio),
  );
  return { winnerGains, loserLosses };
}

function runConfig(matches, params) {
  const players = {};
  let lastDay = null;
  let logLossSum = 0;
  let brierSum = 0;
  let predictions = 0;
  let correctUpset = 0;
  let upsets = 0;
  const buckets = {};
  let diffEligible = 0;
  let diffActual = 0;
  let signedDrift = 0;
  let absDrift = 0;

  const hydrate = (arr) =>
    arr.map((p) => {
      const key = p.username || p.name;
      if (!players[key]) {
        const seed =
          params.seeding === 'first_observed' ? p.rating || 1500 : 1500;
        players[key] = { ...p, rating: seed };
      }
      return players[key];
    });

  for (const m of matches) {
    const day = m.date.split(' ')[0];
    if (params.seeding === 'reset_per_event' && lastDay !== day) {
      for (const k of Object.keys(players)) delete players[k];
      lastDay = day;
    }
    const tA = hydrate(m.teamA);
    const tB = hydrate(m.teamB);
    const rA = teamRating(tA, params.teamMetric);
    const rB = teamRating(tB, params.teamMetric);
    const probA = expected(rA, rB);
    const aWon = m.teamAScore > m.teamBScore ? 1 : 0;
    const predicted = probA >= 0.5 ? 'A' : 'B';
    const actual = aWon ? 'A' : 'B';
    const isUpset = predicted !== actual;
    if (isUpset) upsets += 1;
    if (predicted === actual) correctUpset += 1;

    logLossSum -=
      aWon * Math.log(Math.max(1e-4, probA)) +
      (1 - aWon) * Math.log(Math.max(1e-4, 1 - probA));
    brierSum += Math.pow(aWon - probA, 2);
    predictions += 1;
    const b = Math.round(probA * 10) / 10;
    if (!buckets[b]) buckets[b] = { c: 0, w: 0 };
    buckets[b].c += 1;
    buckets[b].w += aWon;

    const teamWon = aWon === 1;
    const winners = teamWon ? tA : tB;
    const losers = teamWon ? tB : tA;
    const sW = teamWon ? m.teamAScore : m.teamBScore;
    const sL = teamWon ? m.teamBScore : m.teamAScore;
    const { winnerGains, loserLosses } = calculateShift(
      winners,
      losers,
      sW,
      sL,
      params,
    );
    const totalGain = winnerGains.reduce((s, x) => s + x, 0);
    const totalLoss = loserLosses.reduce((s, x) => s + x, 0);
    signedDrift += totalGain - totalLoss;
    absDrift += Math.abs(totalGain - totalLoss);

    const checkTeam = (team, deltas) => {
      if (team.length === 2 && team[0].rating !== team[1].rating) {
        diffEligible += 1;
        if (deltas[0] !== deltas[1]) diffActual += 1;
      }
    };
    checkTeam(winners, winnerGains);
    checkTeam(losers, loserLosses);

    winners.forEach((p, i) => {
      const key = p.username || p.name;
      players[key] = { ...p, rating: Math.max(100, p.rating + winnerGains[i]) };
    });
    losers.forEach((p, i) => {
      const key = p.username || p.name;
      players[key] = { ...p, rating: Math.max(100, p.rating - loserLosses[i]) };
    });
  }

  const ratings = Object.values(players).map((p) => p.rating);
  const meanRating = ratings.reduce((s, r) => s + r, 0) / (ratings.length || 1);
  const ratingStd = Math.sqrt(
    ratings.reduce((s, r) => s + (r - meanRating) ** 2, 0) /
      (ratings.length || 1),
  );
  const calMae =
    Object.entries(buckets).reduce(
      (s, [prob, d]) => s + d.c * Math.abs(parseFloat(prob) - d.w / d.c),
      0,
    ) / predictions;

  return {
    logLoss: logLossSum / predictions,
    brier: brierSum / predictions,
    accuracy: correctUpset / predictions,
    upsetAccuracy: upsets > 0 ? correctUpset / upsets : 0,
    calMae,
    signedDrift,
    absDriftPerMatch: absDrift / predictions,
    partnerDiffRate: diffEligible > 0 ? diffActual / diffEligible : 0,
    meanRating,
    ratingStd,
    predictions,
    upsets,
  };
}

function normalize(values, lowerIsBetter = true) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v) =>
    lowerIsBetter ? (v - min) / range : 1 - (v - min) / range,
  );
}

function makeLabel(params) {
  const parts = [
    params.seeding,
    params.teamMetric,
    params.winnerMode,
    params.loserMode,
    `kD${params.kDoubles}`,
    `kS${params.kSingles}`,
    `mw${params.marginWeight}`,
    `gf${params.partnerGapFactor}`,
    `lb${params.lossUnderdogBlend}`,
    `mpr${params.maxPartnerRatio}`,
  ];
  return parts.join(' ');
}

function table(rows, columns) {
  const colWidths = columns.map((col) =>
    Math.max(col.label.length, ...rows.map((r) => String(r[col.key]).length)),
  );
  const sep = '+' + colWidths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const header =
    '|' +
    columns.map((col, i) => ` ${col.label.padEnd(colWidths[i])} `).join('|') +
    '|';
  console.log(sep);
  console.log(header);
  console.log(sep);
  for (const r of rows) {
    console.log(
      '|' +
        columns
          .map((col, i) => {
            const s = String(r[col.key]);
            return ` ${col.align === 'left' ? s.padEnd(colWidths[i]) : s.padStart(colWidths[i])} `;
          })
          .join('|') +
        '|',
    );
  }
  console.log(sep);
}

function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const allMatches = parseCsv(raw);
  const doublesMatches = allMatches.filter((m) => m.matchType === 'doubles');
  const sortedMatches = [...doublesMatches].sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  );
  console.log(`Loaded ${doublesMatches.length} doubles matches`);

  const grid = {
    kDoubles: [40, 48, 56, 64],
    kSingles: [20, 24, 28, 32],
    marginWeight: [0.05, 0.1, 0.15],
    partnerGapFactor: [0.25, 0.5, 0.75, 1.0],
    lossUnderdogBlend: [0.0, 0.25, 0.5, 0.75, 1.0],
    maxPartnerRatio: [2.0, 4.0, 999],
    teamMetric: ['arithmetic', 'softHarmonic'],
    winnerMode: ['antiCarry', 'underdog'],
    loserMode: ['softUnderdog', 'underdog'],
    seeding: ['reset_per_event', 'first_observed'],
  };

  const total =
    grid.kDoubles.length *
    grid.kSingles.length *
    grid.marginWeight.length *
    grid.partnerGapFactor.length *
    grid.lossUnderdogBlend.length *
    grid.maxPartnerRatio.length *
    grid.teamMetric.length *
    grid.winnerMode.length *
    grid.loserMode.length *
    grid.seeding.length;
  console.log(`Total configurations to test: ${total}`);

  const results = [];
  let count = 0;
  const start = Date.now();

  for (const kDoubles of grid.kDoubles) {
    for (const kSingles of grid.kSingles) {
      for (const marginWeight of grid.marginWeight) {
        for (const partnerGapFactor of grid.partnerGapFactor) {
          for (const lossUnderdogBlend of grid.lossUnderdogBlend) {
            for (const maxPartnerRatio of grid.maxPartnerRatio) {
              for (const teamMetric of grid.teamMetric) {
                for (const winnerMode of grid.winnerMode) {
                  for (const loserMode of grid.loserMode) {
                    for (const seeding of grid.seeding) {
                      const params = {
                        kDoubles,
                        kSingles,
                        marginWeight,
                        partnerGapFactor,
                        lossUnderdogBlend,
                        maxPartnerRatio,
                        teamMetric,
                        winnerMode,
                        loserMode,
                        seeding,
                      };
                      const metrics = runConfig(sortedMatches, params);
                      const row = {
                        label: makeLabel(params),
                        params,
                        ...metrics,
                      };
                      results.push(row);
                      count += 1;
                      if (count % 5000 === 0) {
                        const elapsed = (Date.now() - start) / 1000;
                        console.log(
                          `  ${count}/${total} done (${elapsed.toFixed(1)}s)`,
                        );
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  const nLL = normalize(results.map((r) => r.logLoss));
  const nBrier = normalize(results.map((r) => r.brier));
  const nCalMae = normalize(results.map((r) => r.calMae));
  const nAbsDrift = normalize(results.map((r) => r.absDriftPerMatch));
  const nPartnerPenalty = normalize(
    results.map((r) => 1 - r.partnerDiffRate),
    true,
  );
  const spreadPenalty = normalize(
    results.map((r) => Math.abs(r.ratingStd - 40) / 40),
    true,
  );

  for (let i = 0; i < results.length; i++) {
    results[i].compositeScore =
      nLL[i] * 0.25 +
      nBrier[i] * 0.2 +
      nCalMae[i] * 0.25 +
      nAbsDrift[i] * 0.15 +
      nPartnerPenalty[i] * 0.15;
    results[i].healthScore =
      nCalMae[i] * 0.4 +
      nAbsDrift[i] * 0.25 +
      spreadPenalty[i] * 0.2 +
      nPartnerPenalty[i] * 0.15;
    results[i].partnerDiffPct =
      (results[i].partnerDiffRate * 100).toFixed(1) + '%';
  }

  const printRows = (rows, columns) =>
    table(
      rows.map((r, i) => ({ rank: i + 1, ...r })),
      [{ key: 'rank', label: '#', align: 'right' }, ...columns],
    );

  console.log('\n--- TOP 20 OVERALL (balanced composite) ---');
  printRows(
    [...results]
      .sort((a, b) => a.compositeScore - b.compositeScore)
      .slice(0, 20),
    [
      { key: 'label', label: 'Engine', align: 'left' },
      { key: 'compositeScore', label: 'composite', align: 'right' },
      { key: 'logLoss', label: 'logLoss', align: 'right' },
      { key: 'brier', label: 'brier', align: 'right' },
      { key: 'calMae', label: 'calMAE', align: 'right' },
      { key: 'partnerDiffPct', label: 'partnerDiff', align: 'right' },
      { key: 'absDriftPerMatch', label: 'absDrift', align: 'right' },
    ],
  );

  console.log('\n--- TOP 10 BY PREDICTIVE (logLoss) ---');
  printRows([...results].sort((a, b) => a.logLoss - b.logLoss).slice(0, 10), [
    { key: 'label', label: 'Engine', align: 'left' },
    { key: 'logLoss', label: 'logLoss', align: 'right' },
    { key: 'brier', label: 'brier', align: 'right' },
    { key: 'calMae', label: 'calMAE', align: 'right' },
    { key: 'partnerDiffPct', label: 'partnerDiff', align: 'right' },
  ]);

  console.log('\n--- TOP 10 BY CALIBRATION (calMAE) ---');
  printRows([...results].sort((a, b) => a.calMae - b.calMae).slice(0, 10), [
    { key: 'label', label: 'Engine', align: 'left' },
    { key: 'calMae', label: 'calMAE', align: 'right' },
    { key: 'logLoss', label: 'logLoss', align: 'right' },
    { key: 'partnerDiffPct', label: 'partnerDiff', align: 'right' },
  ]);

  console.log('\n--- TOP 10 BY PARTNER DIFFERENTIATION ---');
  printRows(
    [...results]
      .sort((a, b) => b.partnerDiffRate - a.partnerDiffRate)
      .slice(0, 10),
    [
      { key: 'label', label: 'Engine', align: 'left' },
      { key: 'partnerDiffPct', label: 'partnerDiff', align: 'right' },
      { key: 'calMae', label: 'calMAE', align: 'right' },
      { key: 'logLoss', label: 'logLoss', align: 'right' },
    ],
  );

  console.log('\n--- TOP 10 BY LONG-TERM HEALTH ---');
  printRows(
    [...results].sort((a, b) => a.healthScore - b.healthScore).slice(0, 10),
    [
      { key: 'label', label: 'Engine', align: 'left' },
      { key: 'healthScore', label: 'health', align: 'right' },
      { key: 'calMae', label: 'calMAE', align: 'right' },
      { key: 'ratingStd', label: 'ratingStd', align: 'right' },
      { key: 'partnerDiffPct', label: 'partnerDiff', align: 'right' },
    ],
  );

  const best = results.reduce((a, b) =>
    a.compositeScore < b.compositeScore ? a : b,
  );
  const bestHealth = results.reduce((a, b) =>
    a.healthScore < b.healthScore ? a : b,
  );
  const bestPredictive = results.reduce((a, b) =>
    a.logLoss < b.logLoss ? a : b,
  );

  console.log('\n=== RECOMMENDATION ===');
  console.log(`Best overall: ${best.label}`);
  console.log(
    `  logLoss=${best.logLoss.toFixed(4)} brier=${best.brier.toFixed(4)} calMAE=${best.calMae.toFixed(4)} partnerDiff=${best.partnerDiffPct} absDrift=${best.absDriftPerMatch.toFixed(4)}`,
  );
  console.log(`Best long-term health: ${bestHealth.label}`);
  console.log(
    `  calMAE=${bestHealth.calMae.toFixed(4)} ratingStd=${bestHealth.ratingStd.toFixed(1)} partnerDiff=${bestHealth.partnerDiffPct}`,
  );
  console.log(`Best predictive: ${bestPredictive.label}`);
  console.log(
    `  logLoss=${bestPredictive.logLoss.toFixed(4)} accuracy=${(bestPredictive.accuracy * 100).toFixed(1)}%`,
  );

  const outPath = path.join(
    __dirname,
    '..',
    'test',
    'fixtures',
    'full-grid-search-results.json',
  );
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nFull results written to ${outPath}`);
}

main();
