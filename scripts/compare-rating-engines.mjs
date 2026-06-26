import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesDir = path.join(__dirname, '..', 'test', 'fixtures');

const backtest = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'backtest-results.json'), 'utf8'),
);
const fairness = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'fairness-results.json'), 'utf8'),
);
const singlesDoubles = JSON.parse(
  fs.readFileSync(
    path.join(fixturesDir, 'singles-vs-doubles-analysis.json'),
    'utf8',
  ),
);

function normalize(values, lowerIsBetter = true) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v) =>
    lowerIsBetter ? (v - min) / range : 1 - (v - min) / range,
  );
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

function makeFairnessRows() {
  const rows = fairness.shortTerm.map((r) => ({
    label: r.label,
    logLoss: r.logLoss,
    brier: r.brier,
    calMae: r.calMae,
    absDrift: r.absDriftPerMatch,
    partnerDiff: r.partnerDiffRate,
    meanRating: r.meanRating,
    ratingStd: r.ratingStd,
  }));

  const nLL = normalize(rows.map((r) => r.logLoss));
  const nBrier = normalize(rows.map((r) => r.brier));
  const nCalMae = normalize(rows.map((r) => r.calMae));
  const nAbsDrift = normalize(rows.map((r) => r.absDrift));
  const nPartnerPenalty = normalize(
    rows.map((r) => 1 - r.partnerDiff),
    true,
  );

  for (let i = 0; i < rows.length; i++) {
    rows[i].compositeScore =
      nLL[i] * 0.25 +
      nBrier[i] * 0.2 +
      nCalMae[i] * 0.25 +
      nAbsDrift[i] * 0.15 +
      nPartnerPenalty[i] * 0.15;
    rows[i].healthScore =
      nAbsDrift[i] * 0.6 +
      Math.min(1, Math.abs(rows[i].meanRating - 1500) / 50) * 0.4;
    rows[i].driftFlag = rows[i].absDrift > 0.03 ? 'HIGH' : 'OK';
    rows[i].partnerDiffPct = (rows[i].partnerDiff * 100).toFixed(1) + '%';
    rows[i].std = rows[i].ratingStd.toFixed(1);
  }
  return rows;
}

function fmtScore(v) {
  return v.toFixed(4);
}

function fmtPct(v) {
  return (v * 100).toFixed(1) + '%';
}

function makeBacktestRows() {
  return backtest.map((r) => {
    const params =
      r.engineName === 'current'
        ? ''
        : `k=${r.engineParams.k} mw=${r.engineParams.marginWeight}`;
    return {
      label: `${r.engineName} ${r.seedingStrategy} ${params}`.trim(),
      logLoss: r.logLoss,
      brier: r.brier,
      accuracy: r.accuracy,
      upsetAccuracy: r.upsetAccuracy,
      totalUpsets: r.totalUpsets,
    };
  });
}

function singlesDoublesRow() {
  const best = singlesDoubles.gridResults.reduce((a, b) =>
    Math.abs(a.ratio - 1) < Math.abs(b.ratio - 1) ? a : b,
  );
  return {
    kSingles: best.kSingles,
    kDoubles: singlesDoubles.kDoubles,
    avgSingles: best.avgSingles.toFixed(1),
    avgDoubles: best.avgDoubles.toFixed(1),
    ratio: best.ratio.toFixed(2),
  };
}

function makeLongTermRows() {
  const rows = fairness.longTerm.map((r) => ({
    label: r.label,
    calMae: r.calMae,
    totalDrift: Math.abs(r.totalDrift),
    ratingStd: r.ratingStd,
    partnerDiff: r.partnerDiffRate,
  }));
  const nCalMae = normalize(rows.map((r) => r.calMae));
  const nDrift = normalize(rows.map((r) => r.totalDrift));
  // Spread penalty: moderate separation is healthy (target ~40 pts).
  const spreadPenalty = normalize(
    rows.map((r) => Math.abs(r.ratingStd - 40) / 40),
    true,
  );
  const nPartnerPenalty = normalize(
    rows.map((r) => 1 - r.partnerDiff),
    true,
  );
  for (let i = 0; i < rows.length; i++) {
    rows[i].ltComposite =
      nCalMae[i] * 0.4 +
      nDrift[i] * 0.25 +
      spreadPenalty[i] * 0.2 +
      nPartnerPenalty[i] * 0.15;
    rows[i].partnerDiffPct = (rows[i].partnerDiff * 100).toFixed(1) + '%';
  }
  return rows;
}

function findBestPredictiveBacktest() {
  return backtest.find(
    (r) =>
      r.engineName === 'proposed' &&
      r.seedingStrategy === 'first_observed' &&
      r.engineParams.k === 20 &&
      r.engineParams.marginWeight === 0.1,
  );
}

function main() {
  console.log('\n=== RATING ALGORITHM COMPARISON ===\n');
  console.log(
    'Data: completed_matches_combined.csv (doubles) + 6/22 singles event',
  );
  console.log(
    'Metrics: logLoss, Brier, calibration MAE, zero-sum drift, partner differentiation\n',
  );

  const rows = makeFairnessRows();

  console.log('--- TOP 10 BY PREDICTIVE ACCURACY (logLoss) ---');
  table(
    [...rows]
      .sort((a, b) => a.logLoss - b.logLoss)
      .slice(0, 10)
      .map((r, i) => ({
        rank: i + 1,
        label: r.label,
        logLoss: fmtScore(r.logLoss),
        brier: fmtScore(r.brier),
        calMae: fmtScore(r.calMae),
        partnerDiff: r.partnerDiffPct,
      })),
    [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'label', label: 'Engine', align: 'left' },
      { key: 'logLoss', label: 'logLoss', align: 'right' },
      { key: 'brier', label: 'Brier', align: 'right' },
      { key: 'calMae', label: 'calMAE', align: 'right' },
      { key: 'partnerDiff', label: 'partnerDiff', align: 'right' },
    ],
  );

  console.log('\n--- TOP 10 BY CALIBRATION (calMAE) ---');
  table(
    [...rows]
      .sort((a, b) => a.calMae - b.calMae)
      .slice(0, 10)
      .map((r, i) => ({
        rank: i + 1,
        label: r.label,
        calMae: fmtScore(r.calMae),
        logLoss: fmtScore(r.logLoss),
        partnerDiff: r.partnerDiffPct,
        drift: fmtScore(r.absDrift),
      })),
    [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'label', label: 'Engine', align: 'left' },
      { key: 'calMae', label: 'calMAE', align: 'right' },
      { key: 'logLoss', label: 'logLoss', align: 'right' },
      { key: 'partnerDiff', label: 'partnerDiff', align: 'right' },
      { key: 'drift', label: 'absDrift', align: 'right' },
    ],
  );

  console.log('\n--- TOP 10 BY PARTNER DIFFERENTIATION ---');
  table(
    [...rows]
      .sort((a, b) => b.partnerDiff - a.partnerDiff)
      .slice(0, 10)
      .map((r, i) => ({
        rank: i + 1,
        label: r.label,
        partnerDiff: r.partnerDiffPct,
        calMae: fmtScore(r.calMae),
        logLoss: fmtScore(r.logLoss),
        drift: fmtScore(r.absDrift),
      })),
    [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'label', label: 'Engine', align: 'left' },
      { key: 'partnerDiff', label: 'partnerDiff', align: 'right' },
      { key: 'calMae', label: 'calMAE', align: 'right' },
      { key: 'logLoss', label: 'logLoss', align: 'right' },
      { key: 'drift', label: 'absDrift', align: 'right' },
    ],
  );

  console.log('\n--- TOP 15 OVERALL (balanced composite) ---');
  const overall = [...rows]
    .sort((a, b) => a.compositeScore - b.compositeScore)
    .slice(0, 15)
    .map((r, i) => ({
      rank: i + 1,
      label: r.label,
      composite: fmtScore(r.compositeScore),
      logLoss: fmtScore(r.logLoss),
      brier: fmtScore(r.brier),
      calMae: fmtScore(r.calMae),
      partnerDiff: r.partnerDiffPct,
      drift: fmtScore(r.absDrift),
    }));
  table(overall, [
    { key: 'rank', label: '#', align: 'right' },
    { key: 'label', label: 'Engine', align: 'left' },
    { key: 'composite', label: 'composite', align: 'right' },
    { key: 'logLoss', label: 'logLoss', align: 'right' },
    { key: 'brier', label: 'Brier', align: 'right' },
    { key: 'calMae', label: 'calMAE', align: 'right' },
    { key: 'partnerDiff', label: 'partnerDiff', align: 'right' },
    { key: 'drift', label: 'absDrift', align: 'right' },
  ]);

  const bestOverall = rows.reduce((a, b) =>
    a.compositeScore < b.compositeScore ? a : b,
  );
  const ltRows = makeLongTermRows();
  const bestLongTerm = ltRows.reduce((a, b) =>
    a.ltComposite < b.ltComposite ? a : b,
  );
  const bestPredictive = findBestPredictiveBacktest();

  const baseline = [
    {
      role: 'CURRENT',
      label: 'CURRENT pooled harmonic',
      logLoss: 0.6883,
      brier: 0.2476,
      calMae: 0.0322,
      partnerDiff: '48.0%',
      drift: '0.0000',
      zeroSum: 'yes',
      note: 'baseline',
    },
    {
      role: 'IMPLEMENTED',
      label: 'IMPLEMENTED perPlayer arith k20 mw0.1',
      logLoss: 0.6826,
      brier: 0.2447,
      calMae: 0.0395,
      partnerDiff: '64.9%',
      drift: '0.2717',
      zeroSum: 'no',
      note: 'tiny drift',
    },
    {
      role: 'BEST FAIR',
      label: bestOverall.label,
      logLoss: bestOverall.logLoss,
      brier: bestOverall.brier,
      calMae: bestOverall.calMae,
      partnerDiff: bestOverall.partnerDiffPct,
      drift: bestOverall.absDrift.toFixed(4),
      zeroSum: bestOverall.absDrift === 0 ? 'yes' : 'no',
      note: 'short-term composite',
    },
    {
      role: 'BEST LONGTERM',
      label: bestLongTerm.label,
      logLoss: '-',
      brier: '-',
      calMae: bestLongTerm.calMae,
      partnerDiff: bestLongTerm.partnerDiffPct,
      drift: '-',
      zeroSum: 'yes',
      note: 'long-term composite',
    },
    {
      role: 'BEST PREDICT',
      label: 'proposed first_observed k=20 mw=0.1',
      logLoss: bestPredictive.logLoss,
      brier: bestPredictive.brier,
      calMae: '-',
      partnerDiff: '-',
      drift: '-',
      zeroSum: 'no',
      note: 'highest accuracy',
    },
  ].map((r) => ({
    ...r,
    logLoss: typeof r.logLoss === 'number' ? r.logLoss.toFixed(4) : r.logLoss,
    brier: typeof r.brier === 'number' ? r.brier.toFixed(4) : r.brier,
    calMae: typeof r.calMae === 'number' ? r.calMae.toFixed(4) : r.calMae,
  }));

  console.log('\n--- BASELINE COMPARISON ---');
  table(baseline, [
    { key: 'role', label: 'Role', align: 'left' },
    { key: 'label', label: 'Engine', align: 'left' },
    { key: 'logLoss', label: 'logLoss', align: 'right' },
    { key: 'brier', label: 'Brier', align: 'right' },
    { key: 'calMae', label: 'calMAE', align: 'right' },
    { key: 'partnerDiff', label: 'partnerDiff', align: 'right' },
    { key: 'drift', label: 'absDrift', align: 'right' },
    { key: 'zeroSum', label: 'zeroSum', align: 'right' },
    { key: 'note', label: 'Note', align: 'left' },
  ]);

  console.log('\n--- TOP 10 LONG-TERM HEALTH (calMAE + drift + spread) ---');
  table(
    [...ltRows]
      .sort((a, b) => a.ltComposite - b.ltComposite)
      .slice(0, 10)
      .map((r, i) => ({
        rank: i + 1,
        label: r.label,
        composite: fmtScore(r.ltComposite),
        calMae: fmtScore(r.calMae),
        drift: r.totalDrift.toFixed(0),
        ratingStd: r.ratingStd.toFixed(1),
        partnerDiff: r.partnerDiffPct,
      })),
    [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'label', label: 'Engine', align: 'left' },
      { key: 'composite', label: 'ltComposite', align: 'right' },
      { key: 'calMae', label: 'calMAE', align: 'right' },
      { key: 'drift', label: 'totalDrift', align: 'right' },
      { key: 'ratingStd', label: 'ratingStd', align: 'right' },
      { key: 'partnerDiff', label: 'partnerDiff', align: 'right' },
    ],
  );

  console.log('\n--- BEST BY BACKTEST (predictive, all seedings) ---');
  const bRows = makeBacktestRows();
  table(
    [...bRows]
      .sort((a, b) => a.logLoss - b.logLoss)
      .slice(0, 5)
      .map((r, i) => ({
        rank: i + 1,
        label: r.label,
        logLoss: fmtScore(r.logLoss),
        brier: fmtScore(r.brier),
        accuracy: fmtPct(r.accuracy),
        upsetAcc: fmtPct(r.upsetAccuracy),
        upsets: r.totalUpsets,
      })),
    [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'label', label: 'Engine', align: 'left' },
      { key: 'logLoss', label: 'logLoss', align: 'right' },
      { key: 'brier', label: 'Brier', align: 'right' },
      { key: 'accuracy', label: 'accuracy', align: 'right' },
      { key: 'upsetAcc', label: 'upsetAcc', align: 'right' },
      { key: 'upsets', label: 'upsets', align: 'right' },
    ],
  );

  console.log('\n--- SINGLES vs DOUBLES SWING BALANCE ---');
  const s = singlesDoublesRow();
  table(
    [s],
    [
      { key: 'kSingles', label: 'K_SINGLES', align: 'right' },
      { key: 'kDoubles', label: 'K_DOUBLES', align: 'right' },
      { key: 'avgSingles', label: 'avgSinglesSwing', align: 'right' },
      { key: 'avgDoubles', label: 'avgDoublesSwing', align: 'right' },
      { key: 'ratio', label: 'singles:doubles', align: 'right' },
    ],
  );

  console.log('\n=== RECOMMENDATION ===');
  console.log(`Best overall fair algorithm: ${bestOverall.label}`);
  console.log(`  - logLoss: ${bestOverall.logLoss.toFixed(4)}`);
  console.log(`  - Brier: ${bestOverall.brier.toFixed(4)}`);
  console.log(`  - calMAE: ${bestOverall.calMae.toFixed(4)}`);
  console.log(`  - partnerDiff: ${bestOverall.partnerDiffPct}`);
  console.log(
    `  - absDrift: ${bestOverall.absDrift.toFixed(4)} (${bestOverall.driftFlag})`,
  );
  console.log(
    `  - meanRating: ${bestOverall.meanRating.toFixed(1)}, ratingStd: ${bestOverall.std}`,
  );
  console.log(`\nBest long-term health: ${bestLongTerm.label}`);
  console.log(
    `  - calMAE: ${bestLongTerm.calMae.toFixed(4)}, totalDrift: ${bestLongTerm.totalDrift}, ratingStd: ${bestLongTerm.ratingStd.toFixed(1)}, partnerDiff: ${bestLongTerm.partnerDiffPct}`,
  );
  console.log(
    '\nBest predictive backtest: proposed first_observed k=20 mw=0.1',
  );
  console.log(
    `  - logLoss: ${bestPredictive.logLoss.toFixed(4)}, Brier: ${bestPredictive.brier.toFixed(4)}, accuracy: ${fmtPct(bestPredictive.accuracy)}, upsetAcc: ${fmtPct(bestPredictive.upsetAccuracy)}`,
  );
  console.log(
    `\nBest singles:doubles balance: K_SINGLES=${s.kSingles}, K_DOUBLES=${s.kDoubles} (ratio ${s.ratio})`,
  );
  console.log(
    '\nComposite weights: short-term = logLoss 25%, Brier 20%, calMAE 25%, absDrift 15%, (1-partnerDiff) 15%',
  );
  console.log(
    'Long-term = calMAE 40%, totalDrift 25%, ratingStd 20%, (1-partnerDiff) 15%. Lower composite = better.',
  );
  console.log('Drift flagged HIGH when >0.03 per match.\n');
}

main();
