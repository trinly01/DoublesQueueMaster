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

function arithmeticMean(players) {
  return players.reduce((s, p) => s + p.rating, 0) / players.length;
}

function harmonicMean(players) {
  const sum = players.reduce((s, p) => s + 1 / Math.max(1, p.rating), 0);
  return players.length / sum;
}

function softHarmonicMean(players) {
  return 0.6 * harmonicMean(players) + 0.4 * arithmeticMean(players);
}

function teamRating(players) {
  if (CONFIG.teamMetric === 'harmonic') return harmonicMean(players);
  if (CONFIG.teamMetric === 'softHarmonic') return softHarmonicMean(players);
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
      pool: 0,
      expectedW,
    };
  }

  let wWeights;
  if (CONFIG.winnerMode === 'equal') {
    wWeights = winners.map(() => 1);
  } else {
    wWeights = winners.map((p, i) => {
      const base = 1 - expected(p.rating, ratingL);
      const partner = winners[(i + 1) % winners.length];
      const gap = Math.abs(partner.rating - p.rating);
      const weaker = p.rating < partner.rating;
      const penalty = weaker
        ? Math.max(0.1, 1 - (CONFIG.partnerGapFactor * gap) / 400)
        : 1;
      return base * penalty;
    });
  }

  let lWeights;
  if (CONFIG.loserMode === 'equal') {
    lWeights = losers.map(() => 1);
  } else {
    lWeights = losers.map((p) => {
      const e = expected(p.rating, ratingW);
      return 1 - CONFIG.lossUnderdogBlend + CONFIG.lossUnderdogBlend * e;
    });
  }

  const winnerGains = allocateInteger(pool, capWeights(wWeights));
  const loserLosses = allocateInteger(pool, capWeights(lWeights));
  return { winnerGains, loserLosses, pool, expectedW };
}

function table(rows, columns) {
  const colWidths = columns.map((col) =>
    Math.max(col.label.length, ...rows.map((r) => String(r[col.key]).length)),
  );
  const sep = '+' + colWidths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const header =
    '|' +
    columns.map((col, i) => ` ${col.label.padEnd(colWidths[i])} `).join('|') +
    '|';
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

function sign(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function simulateSingles() {
  const ratings = [1200, 1300, 1400, 1500, 1600, 1700, 1800];
  const scores = [
    { label: 'close', sw: 11, sl: 9 },
    { label: 'moderate', sw: 11, sl: 5 },
    { label: 'blowout', sw: 11, sl: 2 },
  ];
  const rows = [];
  for (let i = 0; i < ratings.length; i++) {
    for (let j = i + 1; j < ratings.length; j++) {
      const r1 = ratings[i];
      const r2 = ratings[j];
      for (const s of scores) {
        // P1 (lower rated) wins -> upset
        {
          const p1 = { name: 'P1', rating: r1 };
          const p2 = { name: 'P2', rating: r2 };
          const { winnerGains, loserLosses, pool, expectedW } = calculateShift(
            [p1],
            [p2],
            s.sw,
            s.sl,
          );
          rows.push({
            p1: r1,
            p2: r2,
            score: `${s.sw}-${s.sl}`,
            outcome: 'P1 upset',
            expected: (expectedW * 100).toFixed(1) + '%',
            pool,
            p1Change: sign(winnerGains[0]),
            p2Change: sign(-loserLosses[0]),
            totalMoved: pool * 2,
          });
        }
        // P2 (higher rated) wins -> expected
        {
          const p1 = { name: 'P1', rating: r1 };
          const p2 = { name: 'P2', rating: r2 };
          const { winnerGains, loserLosses, pool, expectedW } = calculateShift(
            [p2],
            [p1],
            s.sw,
            s.sl,
          );
          rows.push({
            p1: r1,
            p2: r2,
            score: `${s.sw}-${s.sl}`,
            outcome: 'P2 expected',
            expected: (expectedW * 100).toFixed(1) + '%',
            pool,
            p1Change: sign(-loserLosses[0]),
            p2Change: sign(winnerGains[0]),
            totalMoved: pool * 2,
          });
        }
      }
    }
  }
  console.log('\n=== SINGLES GAINS/LOSSES ===');
  table(rows, [
    { key: 'p1', label: 'P1 rating', align: 'right' },
    { key: 'p2', label: 'P2 rating', align: 'right' },
    { key: 'score', label: 'Score', align: 'left' },
    { key: 'outcome', label: 'Outcome', align: 'left' },
    { key: 'expected', label: 'P1 win exp', align: 'right' },
    { key: 'pool', label: 'Pool', align: 'right' },
    { key: 'p1Change', label: 'P1 change', align: 'right' },
    { key: 'p2Change', label: 'P2 change', align: 'right' },
    { key: 'totalMoved', label: 'Total moved', align: 'right' },
  ]);
}

function simulateDoubles() {
  const archetypes = [
    { label: 'balanced', p1: 1500, p2: 1500 },
    { label: 'weak+strong', p1: 1300, p2: 1700 },
    { label: 'huge gap', p1: 1200, p2: 1800 },
    { label: 'weak+weak', p1: 1300, p2: 1300 },
    { label: 'strong+strong', p1: 1700, p2: 1700 },
  ];
  const scores = [
    { label: 'close', sw: 11, sl: 9 },
    { label: 'moderate', sw: 11, sl: 5 },
    { label: 'blowout', sw: 11, sl: 2 },
  ];
  const rows = [];
  for (const team of archetypes) {
    for (const opp of archetypes) {
      const teamAvg = (team.p1 + team.p2) / 2;
      const oppAvg = (opp.p1 + opp.p2) / 2;
      for (const s of scores) {
        // Team wins
        {
          const tA = [
            { name: 'P1', rating: team.p1 },
            { name: 'P2', rating: team.p2 },
          ];
          const tB = [
            { name: 'O1', rating: opp.p1 },
            { name: 'O2', rating: opp.p2 },
          ];
          const { winnerGains, loserLosses, pool, expectedW } = calculateShift(
            tA,
            tB,
            s.sw,
            s.sl,
          );
          const weakChange =
            team.p1 < team.p2 ? winnerGains[0] : winnerGains[1];
          const strongChange =
            team.p1 < team.p2 ? winnerGains[1] : winnerGains[0];
          const carryScore = weakChange - strongChange;
          rows.push({
            team: team.label,
            teamAvg: teamAvg.toFixed(0),
            opp: opp.label,
            oppAvg: oppAvg.toFixed(0),
            score: `${s.sw}-${s.sl}`,
            outcome:
              teamAvg < oppAvg
                ? 'underdog win'
                : teamAvg > oppAvg
                  ? 'favorite win'
                  : 'even win',
            expected: (expectedW * 100).toFixed(1) + '%',
            pool,
            p1Change: sign(winnerGains[0]),
            p2Change: sign(winnerGains[1]),
            o1Change: sign(-loserLosses[0]),
            o2Change: sign(-loserLosses[1]),
            carry: sign(carryScore),
            totalMoved: pool * 2,
          });
        }
        // Team loses
        {
          const tA = [
            { name: 'P1', rating: team.p1 },
            { name: 'P2', rating: team.p2 },
          ];
          const tB = [
            { name: 'O1', rating: opp.p1 },
            { name: 'O2', rating: opp.p2 },
          ];
          const { winnerGains, loserLosses, pool, expectedW } = calculateShift(
            tB,
            tA,
            s.sw,
            s.sl,
          );
          const weakChange =
            team.p1 < team.p2 ? -loserLosses[0] : -loserLosses[1];
          const strongChange =
            team.p1 < team.p2 ? -loserLosses[1] : -loserLosses[0];
          const carryScore = weakChange - strongChange;
          rows.push({
            team: team.label,
            teamAvg: teamAvg.toFixed(0),
            opp: opp.label,
            oppAvg: oppAvg.toFixed(0),
            score: `${s.sw}-${s.sl}`,
            outcome:
              teamAvg < oppAvg
                ? 'expected loss'
                : teamAvg > oppAvg
                  ? 'upset loss'
                  : 'even loss',
            expected: (expectedW * 100).toFixed(1) + '%',
            pool,
            p1Change: sign(-loserLosses[0]),
            p2Change: sign(-loserLosses[1]),
            o1Change: sign(winnerGains[0]),
            o2Change: sign(winnerGains[1]),
            carry: sign(carryScore),
            totalMoved: pool * 2,
          });
        }
      }
    }
  }
  console.log('\n=== DOUBLES GAINS/LOSSES ===');
  table(rows, [
    { key: 'team', label: 'Team', align: 'left' },
    { key: 'teamAvg', label: 'T Avg', align: 'right' },
    { key: 'opp', label: 'Opp', align: 'left' },
    { key: 'oppAvg', label: 'O Avg', align: 'right' },
    { key: 'score', label: 'Score', align: 'left' },
    { key: 'outcome', label: 'Outcome', align: 'left' },
    { key: 'expected', label: 'Team win exp', align: 'right' },
    { key: 'pool', label: 'Pool', align: 'right' },
    { key: 'p1Change', label: 'P1', align: 'right' },
    { key: 'p2Change', label: 'P2', align: 'right' },
    { key: 'o1Change', label: 'O1', align: 'right' },
    { key: 'o2Change', label: 'O2', align: 'right' },
    { key: 'carry', label: 'Carry', align: 'right' },
    { key: 'totalMoved', label: 'Total', align: 'right' },
  ]);
}

function main() {
  console.log('\n=== SIMULATED RECOMMENDED ENGINE ===');
  console.log('Config:', JSON.stringify(CONFIG, null, 2));
  simulateSingles();
  simulateDoubles();
}

main();
