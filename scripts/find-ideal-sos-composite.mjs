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
  'ideal-sos-composite-output.txt',
);

const CONFIG = {
  kSingles: 36,
  kDoubles: 64,
  marginWeight: 0.15,
  partnerGapFactor: 0.5,
  lossUnderdogBlend: 1.0,
  maxPartnerRatio: 4.0,
  ratingFloor: 100,
  teamMetric: 'arithmetic',
  winnerMode: 'antiCarry',
  loserMode: 'softUnderdog',
};

const IDEAL = [
  'shirwin.delacuadra#7la',
  'gabrielsaturnino101495#zg4',
  'trinmar.boado',
  'flores2flores78#j0q',
  'stannot16#5qp',
  'fjhemcarlo#xac',
  'mantappancing29#gk1',
  'sandoval.peejay02#pjf',
  'jundatuin#r7c',
];

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
          rating: 1450,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          oppRatingSum: 0,
          oppRatingCount: 0,
          partnerRatingSum: 0,
          partnerRatingCount: 0,
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

    const teamA = tA;
    const teamB = tB;
    const rA = teamRating(teamA);
    const rB = teamRating(teamB);

    const recordTeam = (team, oppRating) => {
      team.forEach((p) => {
        p.oppRatingSum += oppRating;
        p.oppRatingCount += 1;
        if (team.length === 2) {
          const partnerRating = teamRating(team) * 2 - p.rating;
          p.partnerRatingSum += partnerRating;
          p.partnerRatingCount += 1;
        }
      });
    };

    recordTeam(teamA, rB, aWon);
    recordTeam(teamB, rA, !aWon);

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

  for (const p of Object.values(players)) {
    p.avgOpp = p.oppRatingCount > 0 ? p.oppRatingSum / p.oppRatingCount : 1500;
    p.avgPartner =
      p.partnerRatingCount > 0
        ? p.partnerRatingSum / p.partnerRatingCount
        : p.rating;
  }

  return players;
}

function rankDistance(players, scoreFn) {
  const scored = Object.values(players)
    .filter((p) => p.matchesPlayed >= 1)
    .map((p) => ({ ...p, score: scoreFn(p) }))
    .sort((a, b) => b.score - a.score);
  const ranks = {};
  scored.forEach((p, i) => {
    ranks[p.username] = i + 1;
  });
  let inversions = 0;
  for (let i = 0; i < IDEAL.length; i++) {
    for (let j = i + 1; j < IDEAL.length; j++) {
      const a = IDEAL[i];
      const b = IDEAL[j];
      if ((ranks[a] || 999) > (ranks[b] || 999)) inversions += 1;
    }
  }
  const eddieRank = ranks['jundatuin#r7c'] || 999;
  const eddieAbove = IDEAL.filter((u) => u !== 'jundatuin#r7c').filter(
    (u) => (ranks[u] || 999) > eddieRank,
  ).length;
  return { inversions, eddieAbove, ranks };
}

const csvText = fs.readFileSync(CSV_PATH, 'utf8');
const matches = parseCsv(csvText).sort(
  (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
);
const players = replay(matches);

const results = [];
for (let a = 0; a <= 1; a += 0.1) {
  for (let b = 0; b <= 400; b += 10) {
    for (let c = 0; c <= 10; c += 0.5) {
      const scoreFn = (p) => {
        const g = p.matchesPlayed;
        const net = p.wins - p.losses;
        const norm = g > 0 ? net / Math.sqrt(g) : 0;
        const sos = p.avgOpp - p.avgPartner;
        return a * p.rating + b * norm + c * sos;
      };
      const dist = rankDistance(players, scoreFn);
      results.push({ a, b, c, ...dist });
    }
  }
}

results.sort(
  (a, b) => a.eddieAbove - b.eddieAbove || a.inversions - b.inversions,
);

const lines = [];
lines.push('=== SOS COMPOSITE SCORE SEARCH ===');
lines.push(
  'Formula: score = a*rating + b*(W-L)/sqrt(G) + c*(avgOpp - avgPartner)',
);
lines.push('');
lines.push('Top 10 combos by ranking match');
lines.push('a     b     c     Inv  EddieAbove  Ranks (ideal players 1-9)');
for (let i = 0; i < Math.min(10, results.length); i++) {
  const r = results[i];
  const rankStr = IDEAL.map((u) => r.ranks[u]).join(' ');
  lines.push(
    `${r.a.toFixed(1).padStart(5)} ${r.b.toFixed(0).padStart(5)} ${r.c.toFixed(1).padStart(5)} ${String(r.inversions).padStart(4)} ${String(r.eddieAbove).padStart(12)}  ${rankStr}`,
  );
}

const best = results[0];
lines.push('');
lines.push('--- Best composite formula ---');
lines.push(
  `score = ${best.a.toFixed(1)}*rating + ${best.b.toFixed(0)}*(W-L)/sqrt(G) + ${best.c.toFixed(1)}*(avgOpp - avgPartner)`,
);
lines.push(`Inversions: ${best.inversions}, EddieAbove: ${best.eddieAbove}`);
lines.push('Computed ranks for ideal players:');
IDEAL.forEach((u, i) => {
  lines.push(`  ${i + 1}. ${u} => rank ${best.ranks[u]}`);
});

fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');
console.log(`SOS composite search complete. Results written to ${OUT_PATH}`);
console.log(
  `Best: a=${best.a.toFixed(1)}, b=${best.b.toFixed(0)}, c=${best.c.toFixed(1)}, inversions=${best.inversions}, eddieAbove=${best.eddieAbove}`,
);
