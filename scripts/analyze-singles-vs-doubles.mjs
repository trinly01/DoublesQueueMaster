/**
 * Replay the June 22 2026 event and compare per-player rating swings
 * between singles and doubles under different K_SINGLES values.
 *
 * Uses the same production rating engine as src/services/matchmaking.ts
 * (arithmetic team mean, log margin multiplier, anti-carry winner split,
 * soft-underdog loser split, zero-sum integer allocation).
 *
 * Output: grid search of K_SINGLES values + top big-swing matches.
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
  'completed_matches_2026_06_22_event.csv',
);

const MARGIN_WEIGHT = 0.1;
const PARTNER_GAP_FACTOR = 0.75;
const LOSS_UNDERDOG_BLEND = 0.75;
const RATING_FLOOR = 100;
const MAX_PARTNER_RATIO = 2.0;

function parseCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  return lines.slice(1).map((line, idx) => {
    const firstComma = line.indexOf(',');
    const secondComma = line.indexOf(',', firstComma + 1);
    const thirdComma = line.indexOf(',', secondComma + 1);
    const fourthComma = line.indexOf(',', thirdComma + 1);
    const fifthComma = line.indexOf(',', fourthComma + 1);

    let date = line.slice(0, firstComma);
    if (date.startsWith('"') && date.endsWith('"')) date = date.slice(1, -1);
    let matchType = line.slice(firstComma + 1, secondComma);
    if (matchType.startsWith('"') && matchType.endsWith('"'))
      matchType = matchType.slice(1, -1);
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
  if (field.startsWith('"') && field.endsWith('"')) {
    field = field.slice(1, -1);
  }
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
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      return [rest.slice(0, i), rest.slice(i + 1)];
    }
  }
  return [rest, '[]'];
}

function arithmeticMean(players) {
  if (players.length === 0) return 1450;
  return players.reduce((sum, p) => sum + (p.rating || 1450), 0) / players.length;
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
  if (weights.length < 2) return weights;
  const max = Math.max(...weights);
  if (max <= 0) return weights;
  const minAllowed = max / maxRatio;
  return weights.map((w) => Math.max(w, minAllowed));
}

function calculateShift(winners, losers, scoreW, scoreL, kSingles, kDoubles) {
  const ratingW = arithmeticMean(winners);
  const ratingL = arithmeticMean(losers);

  const margin = Math.abs(scoreW - scoreL);
  const multiplier = 1 + MARGIN_WEIGHT * Math.log(1 + margin);

  const K = winners.length === 1 ? kSingles : kDoubles;

  const expectedW = 1 / (1 + Math.pow(10, (ratingL - ratingW) / 400));
  const pool = Math.round(K * multiplier * (1 - expectedW));

  const winnerCredits = winners.map((p, i) => {
    const partner = winners[(i + 1) % winners.length];
    const gap = Math.abs(partner.rating - p.rating);
    const base = 1 - 1 / (1 + Math.pow(10, (ratingL - p.rating) / 400));
    const weaker = p.rating < partner.rating;
    const penalty = weaker
      ? Math.max(0.1, 1 - (PARTNER_GAP_FACTOR * gap) / 400)
      : 1;
    return base * penalty;
  });
  const winnerGains = allocateInteger(
    pool,
    capWeights(winnerCredits, MAX_PARTNER_RATIO),
  );

  const loserBlames = losers.map((p) => {
    const expectedVsWinners =
      1 / (1 + Math.pow(10, (ratingW - p.rating) / 400));
    return 1 - LOSS_UNDERDOG_BLEND + LOSS_UNDERDOG_BLEND * expectedVsWinners;
  });
  const loserLosses = allocateInteger(
    pool,
    capWeights(loserBlames, MAX_PARTNER_RATIO),
  );

  const updatedWinners = winners.map((player, i) => ({
    ...player,
    rating: Math.max(RATING_FLOOR, player.rating + winnerGains[i]),
  }));

  const updatedLosers = losers.map((player, i) => ({
    ...player,
    rating: Math.max(RATING_FLOOR, player.rating - loserLosses[i]),
  }));

  return { updatedWinners, updatedLosers, winnerGains, loserLosses };
}

function replayEvent(csvPath, kSingles, kDoubles, eventDatePrefix) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const allMatches = parseCsv(raw);
  const eventMatches = allMatches.filter((m) => m.date.startsWith(eventDatePrefix));

  const players = {};
  const swings = { singles: [], doubles: [] };
  const biggestSingles = [];
  const biggestDoubles = [];

  for (const m of eventMatches) {
    const hydrate = (arr) =>
      arr.map((p) => {
        if (!players[p.username]) {
          players[p.username] = { ...p, rating: p.rating || 1450 };
        }
        return players[p.username];
      });

    const teamA = hydrate(m.teamA);
    const teamB = hydrate(m.teamB);
    const aWon = m.teamAScore > m.teamBScore;
    const winners = aWon ? teamA : teamB;
    const losers = aWon ? teamB : teamA;
    const sW = aWon ? m.teamAScore : m.teamBScore;
    const sL = aWon ? m.teamBScore : m.teamAScore;

    const { updatedWinners, updatedLosers, winnerGains, loserLosses } =
      calculateShift(winners, losers, sW, sL, kSingles, kDoubles);

    const allDeltas = [...winnerGains, ...loserLosses.map((x) => -x)];
    const avgAbsSwing =
      allDeltas.reduce((s, x) => s + Math.abs(x), 0) / allDeltas.length;
    const maxSwing = Math.max(...allDeltas.map(Math.abs));

    swings[m.matchType].push(avgAbsSwing);

    const record = {
      score: `${sW}-${sL}`,
      avgSwing: avgAbsSwing,
      maxSwing,
      winners: winners.map((p, i) => ({
        name: p.name || p.username,
        before: p.rating,
        change: winnerGains[i],
        after: p.rating + winnerGains[i],
      })),
      losers: losers.map((p, i) => ({
        name: p.name || p.username,
        before: p.rating,
        change: -loserLosses[i],
        after: p.rating - loserLosses[i],
      })),
    };

    if (m.matchType === 'singles') {
      biggestSingles.push(record);
    } else {
      biggestDoubles.push(record);
    }

    updatedWinners.forEach((p) => (players[p.username] = p));
    updatedLosers.forEach((p) => (players[p.username] = p));
  }

  const avgSingles = swings.singles.length
    ? swings.singles.reduce((a, b) => a + b, 0) / swings.singles.length
    : 0;
  const avgDoubles = swings.doubles.length
    ? swings.doubles.reduce((a, b) => a + b, 0) / swings.doubles.length
    : 0;

  biggestSingles.sort((a, b) => b.maxSwing - a.maxSwing);
  biggestDoubles.sort((a, b) => b.maxSwing - a.maxSwing);

  return {
    avgSingles,
    avgDoubles,
    singlesMatches: swings.singles.length,
    doublesMatches: swings.doubles.length,
    biggestSingles,
    biggestDoubles,
  };
}

function printMatch(r) {
  const w = r.winners
    .map((p) => `${p.name} ${p.before}->${p.after} (+${p.change})`)
    .join(' + ');
  const l = r.losers
    .map((p) => `${p.name} ${p.before}->${p.after} (${p.change})`)
    .join(' + ');
  console.log(`  ${w}  ${r.score}  ${l}  | max swing: ${r.maxSwing}`);
}

function main() {
  const eventDatePrefix = '2026-06-22';
  const kDoubles = 48;
  const kSinglesValues = [16, 20, 24, 28, 32];

  console.log('=== JUNE 22 RATING SWING GRID SEARCH ===\n');

  const gridResults = [];
  for (const kSingles of kSinglesValues) {
    const result = replayEvent(CSV_PATH, kSingles, kDoubles, eventDatePrefix);
    const ratio = result.avgSingles / result.avgDoubles;
    gridResults.push({ kSingles, ...result, ratio });
  }

  console.log(
    'K_SINGLES | Singles avg swing | Doubles avg swing | Ratio s:d | Ideal?',
  );
  console.log('-'.repeat(72));
  for (const r of gridResults) {
    const idealMarker = Math.abs(r.ratio - 1) < 0.05 ? ' <-- closest' : '';
    console.log(
      `${r.kSingles.toString().padStart(9)} | ${r.avgSingles.toFixed(1).padStart(17)} | ${r.avgDoubles.toFixed(1).padStart(17)} | ${r.ratio.toFixed(2).padStart(9)} |${idealMarker}`,
    );
  }

  const closest = gridResults.reduce((best, r) =>
    Math.abs(r.ratio - 1) < Math.abs(best.ratio - 1) ? r : best,
  );
  console.log(
    `\nClosest to ideal balance: K_SINGLES = ${closest.kSingles} (ratio ${closest.ratio.toFixed(2)})`,
  );

  const old32 = gridResults.find((r) => r.kSingles === 32);
  const new24 = gridResults.find((r) => r.kSingles === 24);

  console.log('\n=== JUNE 22 RATING SWING COMPARISON ===\n');
  console.log('CURRENT settings (K_SINGLES=32, K_DOUBLES=48)');
  console.log(
    `  Singles matches: ${old32.singlesMatches}, avg per-player swing: ${old32.avgSingles.toFixed(1)}`,
  );
  console.log(
    `  Doubles matches: ${old32.doublesMatches}, avg per-player swing: ${old32.avgDoubles.toFixed(1)}`,
  );
  console.log(`  Ratio singles:doubles = ${old32.ratio.toFixed(2)}\n`);

  console.log('SUGGESTED settings (K_SINGLES=24, K_DOUBLES=48)');
  console.log(
    `  Singles matches: ${new24.singlesMatches}, avg per-player swing: ${new24.avgSingles.toFixed(1)}`,
  );
  console.log(
    `  Doubles matches: ${new24.doublesMatches}, avg per-player swing: ${new24.avgDoubles.toFixed(1)}`,
  );
  console.log(`  Ratio singles:doubles = ${new24.ratio.toFixed(2)}\n`);

  console.log('TOP 5 BIGGEST SWINGS — K_SINGLES=32');
  old32.biggestSingles.slice(0, 5).forEach(printMatch);

  console.log('\nTOP 5 BIGGEST SWINGS — K_SINGLES=24');
  new24.biggestSingles.slice(0, 5).forEach(printMatch);

  console.log('\nTOP 5 BIGGEST DOUBLES SWINGS — K_DOUBLES=48');
  old32.biggestDoubles.slice(0, 5).forEach(printMatch);

  const outputPath = path.join(
    __dirname,
    '..',
    'test',
    'fixtures',
    'singles-vs-doubles-analysis.json',
  );
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        eventDatePrefix,
        kDoubles,
        gridResults: gridResults.map((r) => ({
          kSingles: r.kSingles,
          avgSingles: r.avgSingles,
          avgDoubles: r.avgDoubles,
          ratio: r.ratio,
          singlesMatches: r.singlesMatches,
          doublesMatches: r.doublesMatches,
          topSinglesSwings: r.biggestSingles.slice(0, 10),
          topDoublesSwings: r.biggestDoubles.slice(0, 10),
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nFull results written to ${outputPath}`);
}

main();
