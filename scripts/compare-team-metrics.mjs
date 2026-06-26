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
  return lines.slice(1).map((line) => {
    const firstComma = line.indexOf(',');
    const secondComma = line.indexOf(',', firstComma + 1);
    const thirdComma = line.indexOf(',', secondComma + 1);
    const fourthComma = line.indexOf(',', thirdComma + 1);
    const fifthComma = line.indexOf(',', fourthComma + 1);
    const date = line.slice(0, firstComma);
    const matchType = line.slice(firstComma + 1, secondComma);
    const teamAScore = parseInt(line.slice(thirdComma + 1, fourthComma), 10);
    const teamBScore = parseInt(line.slice(fourthComma + 1, fifthComma), 10);
    const rest = line.slice(fifthComma + 1);
    const fields = splitLastTwoFields(rest);
    const teamA = JSON.parse(unescapeCsvField(fields[0]));
    const teamB = JSON.parse(unescapeCsvField(fields[1]));
    return { date, matchType, teamAScore, teamBScore, teamA, teamB };
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
    if (char === ',' && !inQuotes) {
      return [rest.slice(0, i), rest.slice(i + 1)];
    }
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

function teamRating(players, metric) {
  if (metric === 'harmonic') return harmonicMean(players);
  if (metric === 'softHarmonic') return softHarmonicMean(players);
  return arithmeticMean(players);
}

function expected(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function evaluateMetric(matches, metric) {
  let logLossSum = 0;
  let brierSum = 0;
  let correct = 0;
  let predictions = 0;
  const buckets = {};

  for (const m of matches) {
    if (m.matchType !== 'doubles') continue;
    const rA = teamRating(m.teamA, metric);
    const rB = teamRating(m.teamB, metric);
    const probA = expected(rA, rB);
    const aWon = m.teamAScore > m.teamBScore ? 1 : 0;
    const predicted = probA >= 0.5 ? 'A' : 'B';
    const actual = aWon ? 'A' : 'B';
    if (predicted === actual) correct += 1;
    predictions += 1;

    logLossSum -=
      aWon * Math.log(Math.max(1e-4, probA)) +
      (1 - aWon) * Math.log(Math.max(1e-4, 1 - probA));
    brierSum += Math.pow(aWon - probA, 2);

    const b = Math.round(probA * 10) / 10;
    if (!buckets[b]) buckets[b] = { c: 0, w: 0 };
    buckets[b].c += 1;
    buckets[b].w += aWon;
  }

  let calMaeSum = 0;
  let calCount = 0;
  for (const b of Object.keys(buckets).sort((a, b) => +a - +b)) {
    const { c, w } = buckets[b];
    if (c < 5) continue;
    const actualRate = w / c;
    calMaeSum += Math.abs(+b - actualRate);
    calCount += 1;
  }

  return {
    metric,
    predictions,
    accuracy: correct / predictions,
    logLoss: logLossSum / predictions,
    brier: brierSum / predictions,
    calMae: calCount > 0 ? calMaeSum / calCount : null,
  };
}

function syntheticExamples() {
  const teamA = [{ rating: 2000 }, { rating: 1000 }];
  const teamB = [{ rating: 1500 }, { rating: 1500 }];
  const examples = [
    {
      metric: 'arithmetic',
      rA: arithmeticMean(teamA),
      rB: arithmeticMean(teamB),
    },
    { metric: 'harmonic', rA: harmonicMean(teamA), rB: harmonicMean(teamB) },
    {
      metric: 'softHarmonic',
      rA: softHarmonicMean(teamA),
      rB: softHarmonicMean(teamB),
    },
  ];
  return examples.map((e) => ({
    ...e,
    teamAWinProb: expected(e.rA, e.rB),
  }));
}

const matches = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
const doubles = matches.filter((m) => m.matchType === 'doubles');

console.log('\n=== TEAM RATING METRIC COMPARISON ===');
console.log(`Data: ${doubles.length} doubles matches from CSV\n`);

const results = [
  evaluateMetric(doubles, 'arithmetic'),
  evaluateMetric(doubles, 'harmonic'),
  evaluateMetric(doubles, 'softHarmonic'),
];

console.log('--- Predictive performance on real doubles matches ---');
console.log('| Metric        | Accuracy | logLoss | Brier  | calMAE |');
console.log('|---------------|----------|---------|--------|--------|');
for (const r of results) {
  const cal = r.calMae !== null ? r.calMae.toFixed(4) : 'n/a';
  console.log(
    `| ${r.metric.padEnd(13)} | ${(r.accuracy * 100).toFixed(1).padStart(6)}% | ${r.logLoss.toFixed(4)} | ${r.brier.toFixed(4)} | ${cal.padStart(6)} |`,
  );
}

console.log('\n--- 2000 + 1000 vs 1500 + 1500 expected win probabilities ---');
console.log('| Metric        | Team A rating | Team B rating | P(A wins) |');
console.log('|---------------|---------------|---------------|-----------|');
for (const e of syntheticExamples()) {
  console.log(
    `| ${e.metric.padEnd(13)} | ${e.rA.toFixed(0).padStart(13)} | ${e.rB.toFixed(0).padStart(13)} | ${(e.teamAWinProb * 100).toFixed(1).padStart(8)}% |`,
  );
}

console.log('\n--- Interpretation ---');
const best = results.reduce((a, b) => (a.logLoss < b.logLoss ? a : b));
console.log(
  `Lowest logLoss on real doubles data: ${best.metric} (${best.logLoss.toFixed(4)})`,
);
const mostCalibrated = results.reduce((a, b) => {
  if (a.calMae === null) return b;
  if (b.calMae === null) return a;
  return a.calMae < b.calMae ? a : b;
});
console.log(
  `Lowest calibration error: ${mostCalibrated.metric} (${mostCalibrated.calMae?.toFixed(4) ?? 'n/a'})`,
);
