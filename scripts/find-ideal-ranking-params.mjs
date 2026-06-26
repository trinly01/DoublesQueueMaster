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
  'ideal-ranking-params-output.txt',
);

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
  return { winnerGains, loserLosses };
}

function replay(matches, params) {
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

  return players;
}

function rankDistance(players) {
  const ranks = {};
  const sorted = Object.values(players)
    .filter((p) => IDEAL.includes(p.username))
    .sort((a, b) => b.rating - a.rating);
  sorted.forEach((p, i) => {
    ranks[p.username] = i + 1;
  });
  const idealRanks = {};
  IDEAL.forEach((u, i) => {
    idealRanks[u] = i + 1;
  });
  let inversions = 0;
  for (let i = 0; i < IDEAL.length; i++) {
    for (let j = i + 1; j < IDEAL.length; j++) {
      const a = IDEAL[i];
      const b = IDEAL[j];
      if (ranks[a] > ranks[b]) inversions += 1;
    }
  }
  const eddieRank = ranks['jundatuin#r7c'] || 9;
  const eddieAbove = Math.max(0, 9 - eddieRank);
  return { inversions, eddieAbove, ranks };
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
  kSingles: [24, 30],
  kDoubles: [48, 56],
  marginWeight: [0.05, 0.1, 0.15],
  partnerGapFactor: [0.25, 0.5],
  lossUnderdogBlend: [0.5, 1.0],
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
                  const players = replay(matches, params);
                  const dist = rankDistance(players);
                  results.push({
                    label: makeLabel(params),
                    params,
                    inversions: dist.inversions,
                    eddieAbove: dist.eddieAbove,
                    score: dist.inversions + dist.eddieAbove * 10,
                    ranks: dist.ranks,
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

results.sort((a, b) => a.score - b.score);

const lines = [];
lines.push('=== IDEAL RANKING PARAMETER SEARCH ===');
lines.push(`Grid size: ${results.length}`);
lines.push(`Ideal order: ${IDEAL.join(' > ')}`);
lines.push('');
lines.push('Top 10 configs by ranking match (lower score = better)');
lines.push(
  'Score = inversions + 10*eddieAbove. Max inversions = 36. eddieAbove = how many ideal-top-8 players EddieWow is ranked above.',
);
lines.push('');
lines.push(
  'Rank  Config                                      Inv  EddieAbove  Ranks (ideal players 1-9)',
);
for (let i = 0; i < Math.min(10, results.length); i++) {
  const r = results[i];
  const rankStr = IDEAL.map((u) => r.ranks[u]).join(' ');
  lines.push(
    `${String(i + 1).padStart(4)}  ${r.label.padEnd(44)} ${String(r.inversions).padStart(3)}  ${String(r.eddieAbove).padStart(10)}  ${rankStr}`,
  );
}

lines.push('');
lines.push('--- Best config details ---');
const best = results[0];
lines.push(`Config: ${best.label}`);
lines.push(`JSON: ${JSON.stringify(best.params, null, 2)}`);
lines.push('Computed ranks for ideal players:');
IDEAL.forEach((u, i) => {
  lines.push(`  ${i + 1}. ${u} => rank ${best.ranks[u]}`);
});

fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');
console.log(`Grid search complete. Results written to ${OUT_PATH}`);
console.log(
  `Best score: ${best.score} (inversions=${best.inversions}, eddieAbove=${best.eddieAbove})`,
);
