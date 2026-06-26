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
  'completed_matches_20260626.csv',
);
const OUT_PATH = path.join(
  __dirname,
  '..',
  'test',
  'fixtures',
  'best-predictive-params-output.txt',
);

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i]);
    if (f.length < 7) continue;
    rows.push({
      date: f[0],
      matchType: f[1],
      matchId: f[2],
      teamAScore: parseInt(f[3], 10),
      teamBScore: parseInt(f[4], 10),
      teamA: JSON.parse(f[5]),
      teamB: JSON.parse(f[6]),
    });
  }
  return rows;
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

function calculateShift(winners, losers, scoreW, scoreL, params) {
  const ratingW = teamRating(winners, params.teamMetric);
  const ratingL = teamRating(losers, params.teamMetric);
  const margin = Math.abs(scoreW - scoreL);
  const multiplier = 1 + params.marginWeight * Math.log(1 + margin);
  const K = winners.length === 1 ? params.kSingles : params.kDoubles;
  const expectedW = expected(ratingW, ratingL);
  const pool = Math.round(K * multiplier * (1 - expectedW));
  if (pool <= 0) {
    return {
      winnerGains: winners.map(() => 0),
      loserLosses: losers.map(() => 0),
      expectedW,
    };
  }

  let wWeights;
  if (params.winnerMode === 'equal') {
    wWeights = winners.map(() => 1);
  } else if (params.winnerMode === 'ratingProp') {
    wWeights = winners.map((p) => p.rating);
  } else {
    wWeights = winners.map((p) => 1 - expected(p.rating, ratingL));
    if (params.winnerMode === 'antiCarry') {
      wWeights = wWeights.map((base, i) => {
        const p = winners[i];
        const partner = winners[(i + 1) % winners.length];
        const gap = Math.abs(partner.rating - p.rating);
        const weaker = p.rating < partner.rating;
        const penalty = weaker
          ? Math.max(0.1, 1 - (params.partnerGapFactor * gap) / 400)
          : 1;
        return base * penalty;
      });
    }
  }

  let lWeights;
  if (params.loserMode === 'equal') {
    lWeights = losers.map(() => 1);
  } else if (params.loserMode === 'ratingProp') {
    lWeights = losers.map((p) => p.rating);
  } else {
    lWeights = losers.map((p) => {
      const e = expected(p.rating, ratingW);
      return 1 - params.lossUnderdogBlend + params.lossUnderdogBlend * e;
    });
  }

  const winnerGains = allocateInteger(
    pool,
    capWeights(wWeights, params.maxPartnerRatio),
  );
  const loserLosses = allocateInteger(
    pool,
    capWeights(lWeights, params.maxPartnerRatio),
  );
  return { winnerGains, loserLosses, expectedW };
}

function evaluate(matches, params) {
  const players = {};
  let logLossSum = 0;
  let brierSum = 0;
  let predictions = 0;
  const buckets = {};

  const hydrate = (arr) =>
    arr.map((p) => {
      const key = p.username || p.name;
      if (!players[key]) {
        players[key] = {
          username: key,
          name: p.name || p.firstName || p.username,
          rating: 1450,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
        };
      }
      return players[key];
    });

  for (const m of matches) {
    if (m.matchType !== 'doubles') continue;
    const tA = hydrate(m.teamA);
    const tB = hydrate(m.teamB);
    const rA = teamRating(tA, params.teamMetric);
    const rB = teamRating(tB, params.teamMetric);
    const probA = expected(rA, rB);
    const aWon = m.teamAScore > m.teamBScore ? 1 : 0;

    logLossSum -=
      aWon * Math.log(Math.max(1e-4, probA)) +
      (1 - aWon) * Math.log(Math.max(1e-4, 1 - probA));
    brierSum += Math.pow(aWon - probA, 2);
    predictions += 1;

    const b = Math.round(probA * 10) / 10;
    if (!buckets[b]) buckets[b] = { c: 0, w: 0 };
    buckets[b].c += 1;
    buckets[b].w += aWon;

    const winners = aWon ? tA : tB;
    const losers = aWon ? tB : tA;
    const sW = aWon ? m.teamAScore : m.teamBScore;
    const sL = aWon ? m.teamBScore : m.teamAScore;
    const { winnerGains, loserLosses } = calculateShift(
      winners,
      losers,
      sW,
      sL,
      params,
    );

    winners.forEach((p, i) => {
      p.rating = Math.max(100, p.rating + winnerGains[i]);
      p.matchesPlayed += 1;
      p.wins += 1;
    });
    losers.forEach((p, i) => {
      p.rating = Math.max(100, p.rating - loserLosses[i]);
      p.matchesPlayed += 1;
      p.losses += 1;
    });
  }

  let calMaeSum = 0;
  let calCount = 0;
  for (const b of Object.keys(buckets).sort((a, b) => +a - +b)) {
    const { c, w } = buckets[b];
    if (c < 5) continue;
    calMaeSum += Math.abs(+b - w / c);
    calCount += 1;
  }

  return {
    logLoss: logLossSum / predictions,
    brier: brierSum / predictions,
    calMae: calCount > 0 ? calMaeSum / calCount : null,
    predictions,
  };
}

function makeLabel(params) {
  return [
    `kS${params.kSingles}`,
    `kD${params.kDoubles}`,
    `mw${params.marginWeight}`,
    `gf${params.partnerGapFactor}`,
    `lb${params.lossUnderdogBlend}`,
    `mpr${params.maxPartnerRatio}`,
    params.teamMetric,
    `w_${params.winnerMode}`,
    `l_${params.loserMode}`,
  ].join(' ');
}

const csvText = fs.readFileSync(CSV_PATH, 'utf8');
const matches = parseCsv(csvText).sort(
  (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
);

const grid = {
  kSingles: [20, 24, 30, 36],
  kDoubles: [40, 48, 56, 64],
  marginWeight: [0.05, 0.1, 0.15],
  partnerGapFactor: [0.5],
  lossUnderdogBlend: [1.0],
  maxPartnerRatio: [2.0, 4.0],
  teamMetric: ['arithmetic', 'softHarmonic'],
  winnerMode: ['antiCarry', 'underdog'],
  loserMode: ['softUnderdog', 'underdog'],
};

const results = [];
for (const kSingles of grid.kSingles) {
  for (const kDoubles of grid.kDoubles) {
    for (const marginWeight of grid.marginWeight) {
      for (const partnerGapFactor of grid.partnerGapFactor) {
        for (const lossUnderdogBlend of grid.lossUnderdogBlend) {
          for (const maxPartnerRatio of grid.maxPartnerRatio) {
            for (const teamMetric of grid.teamMetric) {
              for (const winnerMode of grid.winnerMode) {
                for (const loserMode of grid.loserMode) {
                  const params = {
                    kSingles,
                    kDoubles,
                    marginWeight,
                    partnerGapFactor,
                    lossUnderdogBlend,
                    maxPartnerRatio,
                    teamMetric,
                    winnerMode,
                    loserMode,
                  };
                  const metrics = evaluate(matches, params);
                  results.push({
                    label: makeLabel(params),
                    params,
                    ...metrics,
                  });
                }
              }
            }
          }
        }
      }
    }
  }
}

const bestLogLoss = results.reduce((a, b) => (a.logLoss < b.logLoss ? a : b));
const bestBrier = results.reduce((a, b) => (a.brier < b.brier ? a : b));
const bestCal = results.reduce((a, b) => {
  if (a.calMae === null) return b;
  if (b.calMae === null) return a;
  return a.calMae < b.calMae ? a : b;
});

const lines = [];
lines.push('=== BEST PREDICTIVE PARAMETERS (new CSV) ===');
lines.push(`Doubles matches evaluated: ${bestLogLoss.predictions}`);
lines.push('');
lines.push(`Best logLoss: ${bestLogLoss.logLoss.toFixed(4)}`);
lines.push(`  ${bestLogLoss.label}`);
lines.push('');
lines.push(`Best Brier: ${bestBrier.brier.toFixed(4)}`);
lines.push(`  ${bestBrier.label}`);
lines.push('');
lines.push(`Best calibration: ${bestCal.calMae?.toFixed(4) ?? 'n/a'}`);
lines.push(`  ${bestCal.label}`);
lines.push('');
lines.push('--- Top 25 by logLoss ---');
lines.push(
  'Rank  Config                                      logLoss  Brier    calMAE   Predictions',
);
const sorted = [...results].sort((a, b) => a.logLoss - b.logLoss);
for (let i = 0; i < Math.min(25, sorted.length); i++) {
  const r = sorted[i];
  const cal = r.calMae !== null ? r.calMae.toFixed(4) : 'n/a';
  lines.push(
    `${String(i + 1).padStart(4)}  ${r.label.padEnd(44)} ${r.logLoss.toFixed(4)} ${r.brier.toFixed(4)} ${cal.padStart(8)} ${String(r.predictions).padStart(11)}`,
  );
}

fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');
console.log(`Predictive grid search complete. Results written to ${OUT_PATH}`);
console.log(
  `Best logLoss: ${bestLogLoss.logLoss.toFixed(4)} (${bestLogLoss.label})`,
);
