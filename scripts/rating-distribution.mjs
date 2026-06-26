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
    return { date, matchType, matchId, teamAScore, teamBScore, teamA, teamB, idx };
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
    else if (char === ',' && !inQuotes) return [rest.slice(0, i), rest.slice(i + 1)];
  }
  return [rest, '[]'];
}

function arithmeticMean(players) {
  return players.reduce((s, p) => s + (p.rating || 1500), 0) / players.length;
}

function expected(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function allocateInteger(total, weights) {
  const sum = weights.reduce((s, w) => s + w, 0);
  const norm = sum > 0 ? weights.map((w) => w / sum) : weights.map(() => 1 / weights.length);
  const raw = norm.map((n) => n * total);
  const floors = raw.map((r) => Math.floor(r));
  const remainder = total - floors.reduce((s, f) => s + f, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
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

function calculateShift(winners, losers, scoreW, scoreL, config) {
  const ratingW = arithmeticMean(winners);
  const ratingL = arithmeticMean(losers);
  const margin = Math.abs(scoreW - scoreL);
  const multiplier = 1 + config.marginWeight * Math.log(1 + margin);
  const K = winners.length === 1 ? config.kSingles : config.kDoubles;
  const expectedW = expected(ratingW, ratingL);
  const pool = Math.round(K * multiplier * (1 - expectedW));
  if (pool <= 0) {
    return { winnerGains: winners.map(() => 0), loserLosses: losers.map(() => 0) };
  }
  const wWeights = winners.map((p, i) => {
    const base = 1 - expected(p.rating, ratingL);
    const partner = winners[(i + 1) % winners.length];
    const gap = Math.abs(partner.rating - p.rating);
    const weaker = p.rating < partner.rating;
    const penalty = weaker
      ? Math.max(0.1, 1 - (config.partnerGapFactor * gap) / 400)
      : 1;
    return base * penalty;
  });
  const lWeights = losers.map((p) => {
    const e = expected(p.rating, ratingW);
    return 1 - config.lossUnderdogBlend + config.lossUnderdogBlend * e;
  });
  const winnerGains = allocateInteger(pool, capWeights(wWeights, config.maxPartnerRatio));
  const loserLosses = allocateInteger(pool, capWeights(lWeights, config.maxPartnerRatio));
  return { winnerGains, loserLosses };
}

function runConfig(matches, config) {
  const players = {};
  let lastDay = null;
  const hydrate = (arr) =>
    arr.map((p) => {
      const key = p.username || p.name;
      if (!players[key]) {
        const seed = config.seeding === 'first_observed' ? p.rating || 1500 : 1500;
        players[key] = { ...p, rating: seed };
      }
      return players[key];
    });

  for (const m of matches) {
    const day = m.date.split(' ')[0];
    if (config.seeding === 'reset_per_event' && lastDay !== day) {
      for (const k of Object.keys(players)) delete players[k];
      lastDay = day;
    }
    const tA = hydrate(m.teamA);
    const tB = hydrate(m.teamB);
    const aWon = m.teamAScore > m.teamBScore;
    const winners = aWon ? tA : tB;
    const losers = aWon ? tB : tA;
    const sW = aWon ? m.teamAScore : m.teamBScore;
    const sL = aWon ? m.teamBScore : m.teamAScore;
    const { winnerGains, loserLosses } = calculateShift(winners, losers, sW, sL, config);
    winners.forEach((p, i) => {
      const key = p.username || p.name;
      players[key] = { ...p, rating: Math.max(100, p.rating + winnerGains[i]) };
    });
    losers.forEach((p, i) => {
      const key = p.username || p.name;
      players[key] = { ...p, rating: Math.max(100, p.rating - loserLosses[i]) };
    });
  }
  return players;
}

const TIERS = [
  { name: 'Beginner', min: 0, max: 1449 },
  { name: 'Intermediate', min: 1450, max: 1599 },
  { name: 'Advanced', min: 1600, max: 1799 },
  { name: 'Expert', min: 1800, max: 1999 },
  { name: 'Pro', min: 2000, max: 9999 },
];

function categorize(rating) {
  return TIERS.find((t) => rating >= t.min && rating <= t.max)?.name || 'Unknown';
}

function analyzeDistribution(players, label) {
  const ratings = Object.values(players).map((p) => p.rating);
  const n = ratings.length;
  const mean = ratings.reduce((s, r) => s + r, 0) / n;
  const std = Math.sqrt(ratings.reduce((s, r) => s + (r - mean) ** 2, 0) / n);
  const counts = Object.fromEntries(TIERS.map((t) => [t.name, 0]));
  for (const r of ratings) counts[categorize(r)] += 1;
  return {
    label,
    n,
    min: Math.min(...ratings),
    max: Math.max(...ratings),
    mean,
    std,
    counts,
  };
}

function table(rows, columns) {
  const colWidths = columns.map((col) =>
    Math.max(col.label.length, ...rows.map((r) => String(r[col.key]).length)),
  );
  const sep = '+' + colWidths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const header = '|' + columns.map((col, i) => ` ${col.label.padEnd(colWidths[i])} `).join('|') + '|';
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
  const doubles = allMatches.filter((m) => m.matchType === 'doubles');
  const sorted = [...doubles].sort((a, b) => new Date(a.date) - new Date(b.date));

  const currentConfig = {
    kSingles: 24,
    kDoubles: 48,
    marginWeight: 0.1,
    partnerGapFactor: 0.75,
    lossUnderdogBlend: 0.75,
    maxPartnerRatio: 2.0,
    seeding: 'first_observed',
  };

  const recommendedConfig = {
    kSingles: 36,
    kDoubles: 64,
    marginWeight: 0.15,
    partnerGapFactor: 0.5,
    lossUnderdogBlend: 1.0,
    maxPartnerRatio: 4.0,
    seeding: 'first_observed',
  };

  const currentPlayers = runConfig(sorted, currentConfig);
  const recommendedPlayers = runConfig(sorted, recommendedConfig);

  const current = analyzeDistribution(currentPlayers, 'CURRENT');
  const recommended = analyzeDistribution(recommendedPlayers, 'RECOMMENDED');

  console.log('\n=== RATING DISTRIBUTION ===\n');
  console.log(`Players: ${current.n}`);
  table([current, recommended], [
    { key: 'label', label: 'Config', align: 'left' },
    { key: 'min', label: 'Min', align: 'right' },
    { key: 'max', label: 'Max', align: 'right' },
    { key: 'mean', label: 'Mean', align: 'right' },
    { key: 'std', label: 'Std', align: 'right' },
  ]);

  console.log('\n--- TIER COUNTS (current ranges) ---');
  table(
    TIERS.map((t) => ({
      tier: t.name,
      range: `${t.min}-${t.max === 9999 ? '2000+' : t.max}`,
      current: current.counts[t.name],
      currentPct: ((current.counts[t.name] / current.n) * 100).toFixed(1) + '%',
      recommended: recommended.counts[t.name],
      recommendedPct: ((recommended.counts[t.name] / recommended.n) * 100).toFixed(1) + '%',
    })),
    [
      { key: 'tier', label: 'Tier', align: 'left' },
      { key: 'range', label: 'Range', align: 'left' },
      { key: 'current', label: 'Current', align: 'right' },
      { key: 'currentPct', label: 'Current%', align: 'right' },
      { key: 'recommended', label: 'Recommended', align: 'right' },
      { key: 'recommendedPct', label: 'Rec%', align: 'right' },
    ],
  );
}

main();
