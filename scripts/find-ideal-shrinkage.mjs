/**
 * Tune the club-leaderboard shrinkage parameters C (prior weight) and k
 * (uncertainty penalty) against the real 387-match fixture.
 *
 * Methodology mirrors find-best-predictive-params.mjs:
 *   - Prequential evaluation: ratings are updated match-by-match, and each
 *     match's outcome is predicted using the ratings *before* that match.
 *   - The *shrunk* rating (not the raw Elo) is used as the predictor, so we
 *     measure whether shrinkage improves out-of-sample prediction.
 *   - Secondary metrics: rank stability (Kendall tau between mid-season and
 *     final board) and top-5 retention.
 *
 * Shrinkage formula:
 *   shrunk = initialRating + (rating - initialRating) * n / (n + C)
 *   rankingScore = shrunk - k * |rating - initialRating| / sqrt(n + C)
 *
 * If C=0 wins on all metrics, shrinkage is not justified and we report that.
 */

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
  'ideal-shrinkage-output.txt',
);

// ---- CSV parsing (same as sibling scripts) ----
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

// ---- Elo engine (shipped CONFIG, identical to ratingReplay.ts) ----
const ENGINE = {
  kSingles: 36,
  kDoubles: 64,
  marginWeight: 0.15,
  partnerGapFactor: 0.5,
  lossUnderdogBlend: 1.0,
  maxPartnerRatio: 2.0,
  ratingFloor: 100,
};

function expected(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function teamRating(players) {
  if (players.length === 0) return 1450;
  return players.reduce((s, p) => s + (p.rating || 1450), 0) / players.length;
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
  const maxRatio = ENGINE.maxPartnerRatio;
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
  const multiplier = 1 + ENGINE.marginWeight * Math.log(1 + margin);
  const K = winners.length === 1 ? ENGINE.kSingles : ENGINE.kDoubles;
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
      ? Math.max(0.1, 1 - (ENGINE.partnerGapFactor * gap) / 400)
      : 1;
    return base * penalty;
  });
  const lWeights = losers.map((p) => {
    const e = expected(p.rating, ratingW);
    return 1 - ENGINE.lossUnderdogBlend + ENGINE.lossUnderdogBlend * e;
  });
  return {
    winnerGains: allocateInteger(pool, capWeights(wWeights)),
    loserLosses: allocateInteger(pool, capWeights(lWeights)),
  };
}

// ---- Identity key (fix #1: same-named guests don't merge) ----
function playerKey(p) {
  if (p.userId) return p.userId;
  if (p.username) return p.username;
  return `guest:${p.firstName || ''}|${p.lastName || ''}|${p.name || ''}`;
}

// ---- Seed from level (fix: seed missing ratings from level, not flat 1450) ----
function seedRating(p) {
  if (p.rating != null) return p.rating;
  if (p.level === 3) return 1550;
  if (p.level === 2) return 1500;
  return 1450;
}

// ---- Shrinkage ----
function shrunkRating(p, C) {
  const n = p.matchesPlayed;
  if (n === 0) return p.initialRating;
  return p.initialRating + (p.rating - p.initialRating) * (n / (n + C));
}

function rankingScore(p, C, k) {
  const n = p.matchesPlayed;
  const shrunk = shrunkRating(p, C);
  if (k === 0 || n === 0) return shrunk;
  const uncertainty = Math.abs(p.rating - p.initialRating) / Math.sqrt(n + C);
  return shrunk - k * uncertainty;
}

// ---- Kendall tau (for rank stability) ----
function kendallTau(rankA, rankB, keys) {
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const aDiff = rankA[keys[i]] - rankA[keys[j]];
      const bDiff = rankB[keys[i]] - rankB[keys[j]];
      if (aDiff * bDiff > 0) concordant++;
      else if (aDiff * bDiff < 0) discordant++;
    }
  }
  const total = concordant + discordant;
  return total === 0 ? 0 : concordant / total;
}

// ---- Evaluation ----
function evaluate(matches, C, k) {
  const players = {};
  let logLossSum = 0;
  let brierSum = 0;
  let predictions = 0;
  let tiesSkipped = 0;

  const hydrate = (arr) =>
    arr.map((p) => {
      const key = playerKey(p);
      if (!players[key]) {
        const init = seedRating(p);
        players[key] = {
          username: p.username || key,
          name: p.name || p.firstName || '',
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          rating: init,
          initialRating: init,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
        };
      }
      return players[key];
    });

  // For rank stability: snapshot at 60% of season
  const snapshotIdx = Math.floor(matches.length * 0.6);
  let snapshot = null;

  for (let idx = 0; idx < matches.length; idx++) {
    const m = matches[idx];
    if (m.matchType !== 'doubles') continue;

    // Fix #2: skip tied matches
    if (m.teamAScore === m.teamBScore) {
      tiesSkipped++;
      continue;
    }

    const tA = hydrate(m.teamA);
    const tB = hydrate(m.teamB);

    // Predict using shrunk ratings (prequential: before the update)
    const shrunkA = tA.map((p) => ({ rating: shrunkRating(p, C) }));
    const shrunkB = tB.map((p) => ({ rating: shrunkRating(p, C) }));
    const rA = teamRating(shrunkA);
    const rB = teamRating(shrunkB);
    const probA = expected(rA, rB);
    const aWon = m.teamAScore > m.teamBScore ? 1 : 0;

    logLossSum -=
      aWon * Math.log(Math.max(1e-4, probA)) +
      (1 - aWon) * Math.log(Math.max(1e-4, 1 - probA));
    brierSum += Math.pow(aWon - probA, 2);
    predictions++;

    // Update ratings
    const winners = aWon ? tA : tB;
    const losers = aWon ? tB : tA;
    const sW = aWon ? m.teamAScore : m.teamBScore;
    const sL = aWon ? m.teamBScore : m.teamAScore;
    const { winnerGains, loserLosses } = calculateShift(winners, losers, sW, sL);

    winners.forEach((p, i) => {
      p.rating = Math.max(ENGINE.ratingFloor, p.rating + winnerGains[i]);
      p.matchesPlayed++;
      p.wins++;
    });
    losers.forEach((p, i) => {
      p.rating = Math.max(ENGINE.ratingFloor, p.rating - loserLosses[i]);
      p.matchesPlayed++;
      p.losses++;
    });

    // Snapshot at 60%
    if (idx === snapshotIdx) {
      snapshot = {};
      for (const [key, p] of Object.entries(players)) {
        snapshot[key] = rankingScore(p, C, k);
      }
    }
  }

  // Final rankings
  const finalScores = {};
  for (const [key, p] of Object.entries(players)) {
    finalScores[key] = rankingScore(p, C, k);
  }

  // Rank stability: Kendall tau between snapshot and final
  const commonKeys = snapshot
    ? Object.keys(finalScores).filter((k) => k in snapshot)
    : [];
  let stability = 0;
  let top5Retention = 0;
  if (snapshot && commonKeys.length > 1) {
    const rankSnap = {};
    const rankFinal = {};
    commonKeys.forEach((k) => {
      rankSnap[k] = snapshot[k];
      rankFinal[k] = finalScores[k];
    });
    stability = kendallTau(rankSnap, rankFinal, commonKeys);

    // Top-5 retention
    const snapTop5 = new Set(
      commonKeys.sort((a, b) => snapshot[b] - snapshot[a]).slice(0, 5),
    );
    const finalTop5 = new Set(
      commonKeys.sort((a, b) => finalScores[b] - finalScores[a]).slice(0, 5),
    );
    let retained = 0;
    for (const k of snapTop5) if (finalTop5.has(k)) retained++;
    top5Retention = retained / snapTop5.size;
  }

  return {
    logLoss: predictions > 0 ? logLossSum / predictions : null,
    brier: predictions > 0 ? brierSum / predictions : null,
    predictions,
    tiesSkipped,
    stability,
    top5Retention,
  };
}

// ---- Main ----
const csvText = fs.readFileSync(CSV_PATH, 'utf8');
// Fix #4: deterministic sort by date then match_id
const matches = parseCsv(csvText).sort((a, b) => {
  const da = new Date(a.date).getTime();
  const db = new Date(b.date).getTime();
  if (da !== db) return da - db;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
});

const C_GRID = [0, 2, 4, 6, 8, 10, 12, 16, 20, 30];
const K_GRID = [0, 0.5, 1, 2];

const results = [];
for (const C of C_GRID) {
  for (const k of K_GRID) {
    const metrics = evaluate(matches, C, k);
    results.push({ C, k, ...metrics });
  }
}

// Sort by logLoss (primary)
const sorted = [...results].sort(
  (a, b) => (a.logLoss ?? 1e9) - (b.logLoss ?? 1e9),
);

const lines = [];
lines.push('=== SHRINKAGE PARAMETER SEARCH ===');
lines.push(`Doubles matches: ${sorted[0].predictions} (ties skipped: ${sorted[0].tiesSkipped})`);
lines.push('Formula: shrunk = initialRating + (rating - initialRating) * n / (n + C)');
lines.push('         rankingScore = shrunk - k * |rating - initialRating| / sqrt(n + C)');
lines.push('');
lines.push('--- All configs by logLoss ---');
lines.push(
  'Rank  C    k    logLoss  Brier    Stability  Top5Ret  Preds',
);
for (let i = 0; i < sorted.length; i++) {
  const r = sorted[i];
  lines.push(
    `${String(i + 1).padStart(4)}  ${String(r.C).padStart(2)}  ${String(r.k).padStart(3)}  ${r.logLoss?.toFixed(4) ?? 'n/a'}  ${r.brier?.toFixed(4) ?? 'n/a'}  ${r.stability.toFixed(4)}     ${r.top5Retention.toFixed(2)}    ${r.predictions}`,
  );
}

lines.push('');
lines.push('--- Best by logLoss ---');
const bestLL = sorted[0];
lines.push(`C=${bestLL.C}, k=${bestLL.k} → logLoss=${bestLL.logLoss?.toFixed(4)}, brier=${bestLL.brier?.toFixed(4)}, stability=${bestLL.stability.toFixed(4)}, top5Ret=${bestLL.top5Retention.toFixed(2)}`);

lines.push('');
lines.push('--- Best by rank stability ---');
const bestStab = [...results].sort((a, b) => b.stability - a.stability)[0];
lines.push(`C=${bestStab.C}, k=${bestStab.k} → stability=${bestStab.stability.toFixed(4)}, logLoss=${bestStab.logLoss?.toFixed(4)}, top5Ret=${bestStab.top5Retention.toFixed(2)}`);

lines.push('');
lines.push('--- Best by top-5 retention ---');
const bestRet = [...results].sort((a, b) => b.top5Retention - a.top5Retention)[0];
lines.push(`C=${bestRet.C}, k=${bestRet.k} → top5Ret=${bestRet.top5Retention.toFixed(2)}, stability=${bestRet.stability.toFixed(4)}, logLoss=${bestRet.logLoss?.toFixed(4)}`);

lines.push('');
lines.push('--- Verdict ---');
const baseline = results.find((r) => r.C === 0 && r.k === 0);
const best = sorted[0];
if (baseline && best.logLoss < baseline.logLoss) {
  lines.push(`Shrinkage IMPROVES prediction: C=${best.C}, k=${best.k} (logLoss ${best.logLoss?.toFixed(4)} vs baseline ${baseline.logLoss?.toFixed(4)})`);
  lines.push(`Recommendation: C=${best.C}, k=${best.k}`);
} else {
  lines.push(`Shrinkage does NOT improve prediction. Baseline (C=0, k=0) logLoss=${baseline?.logLoss?.toFixed(4)} is already optimal or better.`);
  lines.push(`Recommendation: C=0, k=0 (no shrinkage)`);
}

fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');
console.log(`Shrinkage search complete. Results written to ${OUT_PATH}`);
console.log(`Best: C=${best.C}, k=${best.k} → logLoss=${best.logLoss?.toFixed(4)}`);
