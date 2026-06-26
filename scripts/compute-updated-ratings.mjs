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
  'updated-ratings-output.txt',
);

const CONFIG = {
  kSingles: 36,
  kDoubles: 64,
  marginWeight: 0.15,
  partnerGapFactor: 0.5,
  lossUnderdogBlend: 1.0,
  maxPartnerRatio: 2.0,
  ratingFloor: 100,
  teamMetric: 'arithmetic',
  winnerMode: 'antiCarry',
  loserMode: 'softUnderdog',
};

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

function teamRating(players) {
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

function capWeights(weights) {
  const maxRatio = CONFIG.maxPartnerRatio;
  if (weights.length < 2 || maxRatio <= 0) return weights;
  const max = Math.max(...weights);
  if (max <= 0) return weights;
  const minAllowed = max / maxRatio;
  return weights.map((w) => Math.max(w, minAllowed));
}

function calculateShift(winners, losers, scoreW, scoreL) {
  const ratingW = teamRating(winners);
  const ratingL = teamRating(losers);
  const margin = Math.abs(scoreW - scoreL);
  const multiplier = 1 + CONFIG.marginWeight * Math.log(1 + margin);
  const K = winners.length === 1 ? CONFIG.kSingles : CONFIG.kDoubles;
  const expectedW = expected(ratingW, ratingL);
  const pool = Math.round(K * multiplier * (1 - expectedW));
  if (pool <= 0) {
    return {
      winnerGains: winners.map(() => 0),
      loserLosses: losers.map(() => 0),
    };
  }

  const wWeights = winners.map((p, i) => {
    const base = 1 - expected(p.rating, ratingL);
    const partner = winners[(i + 1) % winners.length];
    const gap = Math.abs(partner.rating - p.rating);
    const weaker = p.rating < partner.rating;
    const penalty = weaker
      ? Math.max(0.1, 1 - (CONFIG.partnerGapFactor * gap) / 400)
      : 1;
    return base * penalty;
  });

  const lWeights = losers.map((p) => {
    const e = expected(p.rating, ratingW);
    return 1 - CONFIG.lossUnderdogBlend + CONFIG.lossUnderdogBlend * e;
  });

  const winnerGains = allocateInteger(pool, capWeights(wWeights));
  const loserLosses = allocateInteger(pool, capWeights(lWeights));
  return { winnerGains, loserLosses };
}

function replay(matches) {
  const players = {};
  const hydrate = (arr) =>
    arr.map((p) => {
      const key = p.username || p.name;
      if (!players[key]) {
        players[key] = {
          username: key,
          name: p.name || p.firstName || p.username,
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          rating: 1450,
          initialRating: 1450,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          avatar: p.avatar || '',
        };
      }
      return players[key];
    });

  for (const m of matches) {
    const tA = hydrate(m.teamA);
    const tB = hydrate(m.teamB);
    const aWon = m.teamAScore > m.teamBScore;
    const winners = aWon ? tA : tB;
    const losers = aWon ? tB : tA;
    const sW = aWon ? m.teamAScore : m.teamBScore;
    const sL = aWon ? m.teamBScore : m.teamAScore;
    const { winnerGains, loserLosses } = calculateShift(
      winners,
      losers,
      sW,
      sL,
    );

    winners.forEach((p, i) => {
      p.rating = Math.max(CONFIG.ratingFloor, p.rating + winnerGains[i]);
      p.matchesPlayed += 1;
      p.wins += 1;
    });
    losers.forEach((p, i) => {
      p.rating = Math.max(CONFIG.ratingFloor, p.rating - loserLosses[i]);
      p.matchesPlayed += 1;
      p.losses += 1;
    });
  }

  return players;
}

const csvText = fs.readFileSync(CSV_PATH, 'utf8');
const matches = parseCsv(csvText).sort(
  (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
);
const allPlayers = replay(matches);
const players = Object.values(allPlayers).filter(
  (p) => p.username && !p.username.toLowerCase().startsWith('club'),
);
const sorted = players.sort((a, b) => b.rating - a.rating);

const tierCounts = {
  Beginner: 0,
  Intermediate: 0,
  Advanced: 0,
  Expert: 0,
  Pro: 0,
};
for (const p of sorted) {
  if (p.rating < 1400) tierCounts.Beginner += 1;
  else if (p.rating < 1700) tierCounts.Intermediate += 1;
  else if (p.rating < 1900) tierCounts.Advanced += 1;
  else if (p.rating < 2100) tierCounts.Expert += 1;
  else tierCounts.Pro += 1;
}

const lines = [];
lines.push('=== UPDATED PLAYER RATINGS ===');
lines.push(`Matches processed: ${matches.length}`);
lines.push(`Players: ${sorted.length}`);
lines.push('');
lines.push(
  `Config: K_SINGLES=${CONFIG.kSingles}, K_DOUBLES=${CONFIG.kDoubles}, marginWeight=${CONFIG.marginWeight}, partnerGapFactor=${CONFIG.partnerGapFactor}, lossUnderdogBlend=${CONFIG.lossUnderdogBlend}, maxPartnerRatio=${CONFIG.maxPartnerRatio}, teamMetric=${CONFIG.teamMetric}`,
);
lines.push('');
lines.push('--- TIER DISTRIBUTION ---');
lines.push(`Beginner (<1400):      ${tierCounts.Beginner}`);
lines.push(`Intermediate (1400-1699): ${tierCounts.Intermediate}`);
lines.push(`Advanced (1700-1899):  ${tierCounts.Advanced}`);
lines.push(`Expert (1900-2099):    ${tierCounts.Expert}`);
lines.push(`Pro (2100+):           ${tierCounts.Pro}`);
lines.push('');
lines.push('--- LEADERBOARD ---');
lines.push(
  '#'.padStart(3) +
    '  ' +
    'Player'.padEnd(30) +
    'Username'.padEnd(30) +
    'Rating'.padStart(8) +
    '  ' +
    'Initial'.padStart(8) +
    '  ' +
    'Δ'.padStart(6) +
    '  ' +
    'G'.padStart(4) +
    '  ' +
    'W'.padStart(4) +
    '  ' +
    'L'.padStart(4),
);
for (let i = 0; i < sorted.length; i++) {
  const p = sorted[i];
  const delta = (p.rating - p.initialRating).toFixed(0);
  const deltaStr = delta > 0 ? `+${delta}` : delta;
  lines.push(
    `${String(i + 1).padStart(3)}  ${p.name.padEnd(30)}${p.username.padEnd(30)}${String(p.rating).padStart(8)}  ${String(p.initialRating).padStart(8)}  ${deltaStr.padStart(6)}  ${String(p.matchesPlayed).padStart(4)}  ${String(p.wins).padStart(4)}  ${String(p.losses).padStart(4)}`,
  );
}

lines.push('');
lines.push('--- PER-PLAYER RATINGS (alphabetical) ---');
for (const p of [...sorted].sort((a, b) => a.name.localeCompare(b.name))) {
  const delta = (p.rating - p.initialRating).toFixed(0);
  const deltaStr = delta > 0 ? `+${delta}` : delta;
  lines.push(
    `${p.name.padEnd(30)} ${p.username.padEnd(30)} rating=${String(p.rating).padStart(6)} initial=${String(p.initialRating).padStart(6)} Δ=${deltaStr.padStart(6)} G=${String(p.matchesPlayed).padStart(3)} W=${String(p.wins).padStart(3)} L=${String(p.losses).padStart(3)}`,
  );
}

const outText = lines.join('\n') + '\n';
fs.writeFileSync(OUT_PATH, outText, 'utf8');
console.log(`Updated ratings written to ${OUT_PATH}`);
console.log(`Players: ${sorted.length}`);
console.log(
  `Top player: ${sorted[0].name} ${sorted[0].username} ${sorted[0].rating}`,
);
