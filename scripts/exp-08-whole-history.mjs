/**
 * Experiment 8: Whole-history joint fitting (MAP Bradley-Terry).
 *
 * The user's requirement: price every match by each player's OVERALL
 * rating (one rating vector explaining all results), not by their rating
 * at that point in a chronological replay.
 *
 * Model: P(A wins) = expected(meanA, meanB) — same logistic as Elo.
 * Objective: Σ log-likelihood + Gaussian prior N(1450, tau^2) per player.
 * Solver: per-player Newton steps (Gauss-Seidel), converges quadratically.
 * The prior is what keeps undefeated players finite and plays the role
 * our n/(n+C) shrinkage plays in the Elo path.
 *
 * Benchmark: identical holdout protocol as exp-07 — fit on first 80%,
 * predict last 20% with frozen ratings, compare logLoss/accuracy vs the
 * current 8-pass iterated Elo engine.
 *
 * Run: node scripts/exp-08-whole-history.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadFixture } from './lib/loadFixtures.mjs';
import {
  replay,
  DEFAULT_PARAMS,
  playerKey,
  expected,
} from './lib/replayEngine.mjs';
import { scorePredictions } from './lib/evaluate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_PATH = path.join(
  __dirname,
  '..',
  'test',
  'fixtures',
  'exp-08-whole-history-output.txt',
);

const data = loadFixture('completed_matches_20261005.csv');
const matches = data.competitive;

const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

const S = 400 / Math.LN10; // logistic scale matching Elo expected()

/**
 * MAP Bradley-Terry solver.
 * @param {Array} matches - chronological doubles matches
 * @param {number} tau - prior sd in rating points (smaller = stronger pull to 1450)
 * @returns {Map} playerKey -> {rating, n, meta}
 */
function fitBT(ms, tau = 300) {
  const R = new Map();
  const games = new Map();
  const k = (p) => playerKey(p);
  for (const m of ms) {
    for (const p of [...m.teamA, ...m.teamB]) {
      if (!R.has(k(p))) {
        R.set(k(p), 1450);
        games.set(k(p), { n: 0, w: 0, meta: p });
      }
      games.get(k(p)).n++;
    }
    const aWon = m.teamAScore > m.teamBScore;
    for (const p of m.teamA) if (aWon) games.get(k(p)).w++;
    for (const p of m.teamB) if (!aWon) games.get(k(p)).w++;
  }
  const teamR = (team) =>
    team.reduce((s, p) => s + R.get(k(p)), 0) / team.length;

  // Per-player data gradient/hessian accumulation, then Newton step.
  // Recomputed per player (Gauss-Seidel) — converges fast in practice.
  for (let it = 0; it < 200; it++) {
    let maxMove = 0;
    for (const [key] of games) {
      let grad = -(R.get(key) - 1450) / (tau * tau); // prior gradient
      let hess = -1 / (tau * tau); // prior hessian
      for (const m of ms) {
        const inA = m.teamA.some((p) => k(p) === key);
        const inB = !inA && m.teamB.some((p) => k(p) === key);
        if (!inA && !inB) continue;
        const rA = teamR(m.teamA);
        const rB = teamR(m.teamB);
        const p = expected(rA, rB);
        const aWon = m.teamAScore > m.teamBScore;
        const y = aWon ? 1 : 0;
        const sign = inA ? 1 : -1;
        const nTeam = inA ? m.teamA.length : m.teamB.length;
        // d LL/d r_i = (y - p) * sign / (S * nTeam)
        grad += ((y - p) * sign) / (S * nTeam);
        // d2 LL/d r_i^2 = -p(1-p) / (S^2 * nTeam^2)
        hess += (-p * (1 - p)) / (S * S * nTeam * nTeam);
      }
      const move = -grad / hess; // Newton: r -= grad/hess (hess<0 -> r += grad/|hess|)
      const clamped = Math.max(-200, Math.min(200, move)); // damp wild steps
      R.set(key, R.get(key) + clamped);
      if (Math.abs(clamped) > maxMove) maxMove = Math.abs(clamped);
    }
    if (maxMove < 0.05) return { R, games, iters: it + 1, converged: true };
  }
  return { R, games, iters: 200, converged: false };
}

function predictLogLoss(R, ms) {
  const teamR = (team) =>
    team.reduce((s, p) => s + (R.get(playerKey(p)) ?? 1450), 0) / team.length;
  const preds = ms.map((m) => ({
    probA: expected(teamR(m.teamA), teamR(m.teamB)),
    actual: m.teamAScore > m.teamBScore ? 1 : 0,
  }));
  const { logLoss, brier } = scorePredictions(preds);
  const acc =
    preds.filter((p) => p.probA > 0.5 === (p.actual === 1)).length /
    preds.length;
  return { logLoss, brier, acc };
}

// ---------- holdout benchmark (same protocol as exp-07 C) ----------
log('=== EXP-08: WHOLE-HISTORY MAP BRADLEY-TERRY ===');
log(`Dataset: ${matches.length} competitive doubles matches`);
log('');

const splitIdx = Math.floor(matches.length * 0.8);
const train = matches.slice(0, splitIdx);
const test = matches.slice(splitIdx);

log('--- Holdout (train 80% / predict frozen 20%) ---');
// Baseline: current production engine, 8 iterated passes
const PROD = {
  ...DEFAULT_PARAMS,
  kSingles: 36,
  kDoubles: 64,
  movMode: 'log',
  marginWeight: 0.15,
  partnerGapFactor: 0.5,
  autocorrScale: 1000,
};
function trainIteratedElo(ms, passes) {
  let work = ms.map((m) => ({
    ...m,
    teamA: m.teamA.map((p) => ({ ...p })),
    teamB: m.teamB.map((p) => ({ ...p })),
  }));
  let res;
  for (let i = 0; i < passes; i++) {
    res = replay(work, PROD, { seedMode: i === 0 ? 'flat' : 'snapshot' });
    for (const m of work)
      for (const p of [...m.teamA, ...m.teamB]) {
        const pl = res.players[playerKey(p)];
        if (pl) p.rating = pl.rating;
      }
  }
  const R = new Map();
  for (const [kk, p] of Object.entries(res.players)) R.set(kk, p.rating);
  return R;
}

const eloR = trainIteratedElo(train, 8);
const eloHold = predictLogLoss(eloR, test);
log(
  `  Iterated Elo x8 : logLoss=${eloHold.logLoss.toFixed(4)} acc=${(eloHold.acc * 100).toFixed(1)}%`,
);

for (const tau of [150, 250, 300, 400, 600]) {
  const { R, converged, iters } = fitBT(train, tau);
  const h = predictLogLoss(R, test);
  log(
    `  BT tau=${String(tau).padStart(3)} : logLoss=${h.logLoss.toFixed(4)} acc=${(h.acc * 100).toFixed(1)}%  (${converged ? 'converged' : 'NOT converged'} in ${iters} iters)`,
  );
}
log('');

// ---------- full-data fit + ranking ----------
log('--- Full-data fit (tau=300), top 25 ---');
const { R, games, converged, iters } = fitBT(matches, 300);
log(`converged=${converged} iters=${iters}`);
const board = [...R.entries()]
  .map(([kk, r]) => ({ r, g: games.get(kk) }))
  .sort((a, b) => b.r - a.r || b.g.n - a.g.n);
board.slice(0, 25).forEach((e, i) => {
  const name = (
    (e.g.meta.firstName || e.g.meta.name || '') +
    ' ' +
    (e.g.meta.lastName || '')
  ).trim();
  log(
    `  ${String(i + 1).padStart(2)}  ${String(Math.round(e.r)).padStart(5)}  ${String(e.g.n).padStart(3)}G ${String(e.g.w).padStart(3)}W  ${name}`,
  );
});

fs.writeFileSync(OUT_PATH, lines.join('\n'));
console.log(`\nWrote ${OUT_PATH}`);
