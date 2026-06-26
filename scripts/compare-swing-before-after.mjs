const OLD_CONFIG = {
  kSingles: 24,
  kDoubles: 48,
  marginWeight: 0.1,
  partnerGapFactor: 0.75,
  lossUnderdogBlend: 0.75,
  maxPartnerRatio: 2.0,
  ratingFloor: 100,
  teamMetric: 'arithmetic',
  winnerMode: 'antiCarry',
  loserMode: 'softUnderdog',
};

const NEW_CONFIG = {
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

function calculateShift(config, winners, losers, scoreW, scoreL) {
  const ratingW = arithmeticMean(winners);
  const ratingL = arithmeticMean(losers);
  const margin = Math.abs(scoreW - scoreL);
  const multiplier = 1 + config.marginWeight * Math.log(1 + margin);
  const K = winners.length === 1 ? config.kSingles : config.kDoubles;
  const expectedW = expected(ratingW, ratingL);
  const pool = Math.round(K * multiplier * (1 - expectedW));
  if (pool <= 0) {
    return {
      winnerGains: winners.map(() => 0),
      loserLosses: losers.map(() => 0),
      pool: 0,
    };
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
  return { winnerGains, loserLosses, pool };
}

function sign(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function runScenario(config, winners, losers, scoreW, scoreL) {
  const { winnerGains, loserLosses, pool } = calculateShift(
    config,
    winners,
    losers,
    scoreW,
    scoreL,
  );
  const winnerChanges = winnerGains.map(sign).join(' / ');
  const loserChanges = loserLosses.map((n) => sign(-n)).join(' / ');
  return { pool, winnerChanges, loserChanges };
}

const scenarios = [
  {
    label: 'Singles even 1500 vs 1500, 11-10',
    winners: [{ rating: 1500 }],
    losers: [{ rating: 1500 }],
    scoreW: 11,
    scoreL: 10,
  },
  {
    label: 'Singles upset 1200 vs 1500, 11-9',
    winners: [{ rating: 1200 }],
    losers: [{ rating: 1500 }],
    scoreW: 11,
    scoreL: 9,
  },
  {
    label: 'Singles upset 1200 vs 1500, 11-2',
    winners: [{ rating: 1200 }],
    losers: [{ rating: 1500 }],
    scoreW: 11,
    scoreL: 2,
  },
  {
    label: 'Doubles even 1500+1500 vs 1500+1500, 11-10',
    winners: [{ rating: 1500 }, { rating: 1500 }],
    losers: [{ rating: 1500 }, { rating: 1500 }],
    scoreW: 11,
    scoreL: 10,
  },
  {
    label: 'Doubles upset 1200+1200 vs 1500+1500, 11-9',
    winners: [{ rating: 1200 }, { rating: 1200 }],
    losers: [{ rating: 1500 }, { rating: 1500 }],
    scoreW: 11,
    scoreL: 9,
  },
  {
    label: 'Doubles upset 1200+1200 vs 1500+1500, 11-2',
    winners: [{ rating: 1200 }, { rating: 1200 }],
    losers: [{ rating: 1500 }, { rating: 1500 }],
    scoreW: 11,
    scoreL: 2,
  },
];

console.log('\n=== RATING SWING: BEFORE vs AFTER ===\n');
console.log(
  'Old: K_SINGLES=24, K_DOUBLES=48, marginWeight=0.1, partnerGap=0.75, lossBlend=0.75, maxRatio=2.0',
);
console.log(
  'New: K_SINGLES=36, K_DOUBLES=64, marginWeight=0.15, partnerGap=0.5, lossBlend=1.0, maxRatio=4.0\n',
);

for (const s of scenarios) {
  const old = runScenario(OLD_CONFIG, s.winners, s.losers, s.scoreW, s.scoreL);
  const neu = runScenario(NEW_CONFIG, s.winners, s.losers, s.scoreW, s.scoreL);
  console.log(s.label);
  console.log(
    `  Old: pool ${old.pool.toString().padStart(2)} | winners ${old.winnerChanges.padStart(7)} | losers ${old.loserChanges.padStart(7)}`,
  );
  console.log(
    `  New: pool ${neu.pool.toString().padStart(2)} | winners ${neu.winnerChanges.padStart(7)} | losers ${neu.loserChanges.padStart(7)}`,
  );
  console.log(
    `  Pool change: ${(neu.pool > old.pool ? '+' : '')}${neu.pool - old.pool} points\n`,
  );
}
