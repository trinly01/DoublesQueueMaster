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
  'player-rating-path-output.txt',
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

const TARGETS = [
  'jundatuin#r7c', // EddieWow Datuin jr
  'flores2flores78#j0q', // Mac Flores
  'gabrielsaturnino101495#zg4', // Gab Saturnino
  'Franks', // Franks
  'fjhemcarlo#xac', // Jhem Fabular
  'stannot16#5qp', // Tristan Soriano
  'crisnrose556#ois', // Cristobal Eslabra
  'trinmar.boado', // Trin BOADO
  'mantappancing29#gk1', // Jimboy Carlos
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
      pool,
      expectedW,
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
  return { winnerGains, loserLosses, pool, expectedW };
}

function replay(matches) {
  const players = {};
  const history = {};
  const ensure = (key) => {
    if (!history[key]) history[key] = [];
  };

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
    const { winnerGains, loserLosses, pool, expectedW } = calculateShift(
      winners,
      losers,
      sW,
      sL,
    );

    const record = (team, deltas, isWin) => {
      const teamRating = arithmeticMean(team);
      const opp = isWin ? losers : winners;
      const oppRating = arithmeticMean(opp);
      team.forEach((p, i) => {
        const key = p.username;
        ensure(key);
        const before = p.rating;
        const change = isWin ? deltas[i] : -deltas[i];
        history[key].push({
          date: m.date,
          matchId: m.matchId,
          matchType: m.matchType,
          score: `${m.teamAScore}-${m.teamBScore}`,
          out: isWin ? 'W' : 'L',
          before,
          change,
          after: before + change,
          teamRating,
          oppRating,
          pool,
          expectedW: isWin ? expectedW : 1 - expectedW,
        });
        p.rating = Math.max(CONFIG.ratingFloor, p.rating + change);
        p.matchesPlayed += 1;
        if (isWin) p.wins += 1;
        else p.losses += 1;
      });
    };

    record(winners, winnerGains, true);
    record(losers, loserLosses, false);
  }

  return { players, history };
}

const csvText = fs.readFileSync(CSV_PATH, 'utf8');
const matches = parseCsv(csvText).sort(
  (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
);
const { players, history } = replay(matches);

function summarize(username) {
  const p = players[username];
  if (!p) return null;
  const h = history[username] || [];
  const wins = h.filter((e) => e.out === 'W');
  const losses = h.filter((e) => e.out === 'L');
  const avgGain = wins.length
    ? wins.reduce((s, e) => s + e.change, 0) / wins.length
    : 0;
  const avgLoss = losses.length
    ? losses.reduce((s, e) => s + Math.abs(e.change), 0) / losses.length
    : 0;
  const avgOpp = h.length
    ? h.reduce((s, e) => s + e.oppRating, 0) / h.length
    : 0;
  const partnerRatings = h
    .filter((e) => e.matchType === 'doubles')
    .map((e) => e.teamRating * 2 - e.before);
  const avgPartner = partnerRatings.length
    ? partnerRatings.reduce((s, r) => s + r, 0) / partnerRatings.length
    : 0;
  return {
    username,
    name: p.name,
    final: p.rating,
    g: p.matchesPlayed,
    w: p.wins,
    l: p.losses,
    winRate: p.matchesPlayed ? (p.wins / p.matchesPlayed) * 100 : 0,
    avgGain: avgGain,
    avgLoss: avgLoss,
    netPerGame: p.matchesPlayed ? (p.rating - 1450) / p.matchesPlayed : 0,
    avgOpp,
    avgPartner,
  };
}

const summaries = TARGETS.map(summarize).filter(Boolean);

const lines = [];
lines.push('=== PLAYER RATING PATH ANALYSIS ===');
lines.push(`Matches: ${matches.length}`);
lines.push('');
lines.push('--- SUMMARY COMPARISON ---');
lines.push(
  'Player'.padEnd(30) +
    'G'.padStart(4) +
    ' W'.padStart(4) +
    ' L'.padStart(4) +
    ' Win%'.padStart(7) +
    ' AvgGain'.padStart(8) +
    ' AvgLoss'.padStart(8) +
    ' Net/G'.padStart(7) +
    ' AvgOpp'.padStart(8) +
    ' AvgPartner'.padStart(11) +
    ' Final'.padStart(7),
);
for (const s of summaries) {
  lines.push(
    `${s.name.padEnd(30)}${String(s.g).padStart(4)}${String(s.w).padStart(4)}${String(s.l).padStart(4)}${s.winRate.toFixed(1).padStart(7)}${s.avgGain.toFixed(1).padStart(8)}${s.avgLoss.toFixed(1).padStart(8)}${s.netPerGame.toFixed(1).padStart(7)}${s.avgOpp.toFixed(0).padStart(8)}${s.avgPartner.toFixed(0).padStart(11)}${String(s.final).padStart(7)}`,
  );
}
lines.push('');

for (const username of TARGETS) {
  const p = players[username];
  if (!p) {
    lines.push(`No data for ${username}`);
    continue;
  }
  const h = history[username] || [];
  lines.push(`--- ${p.name} (${username}) ---`);
  lines.push(
    `Final rating: ${p.rating} | G:${p.matchesPlayed} W:${p.wins} L:${p.losses}`,
  );
  lines.push('');
  lines.push(
    'Date                Match        Type   Score   Out  Before  Change  After   TeamAvg OppAvg  Pool  ExpWin',
  );
  for (const e of h) {
    if (!e) continue;
    const changeStr = e.change > 0 ? `+${e.change}` : `${e.change}`;
    const dateStr = (e.date || '').slice(0, 19).padEnd(19);
    const matchIdStr = (e.matchId || '').slice(0, 12).padEnd(12);
    const typeStr = (e.matchType || '?').padEnd(6);
    const scoreStr = (e.score || '?').padEnd(7);
    const outStr = (e.out || '?').padEnd(4);
    lines.push(
      `${dateStr} ${matchIdStr} ${typeStr} ${scoreStr} ${outStr} ${String(e.before || 0).padStart(6)} ${changeStr.padStart(6)} ${String(e.after || 0).padStart(6)} ${String((e.teamRating || 0).toFixed(0)).padStart(6)} ${String((e.oppRating || 0).toFixed(0)).padStart(6)} ${String(e.pool || 0).padStart(5)} ${((e.expectedW || 0) * 100).toFixed(1).padStart(6)}%`,
    );
  }
  lines.push('');
}

fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');
console.log(`Player rating paths written to ${OUT_PATH}`);
for (const username of TARGETS) {
  const p = players[username];
  if (p) {
    console.log(`${p.name.padEnd(30)} ${username.padEnd(30)} ${p.rating}`);
  }
}
