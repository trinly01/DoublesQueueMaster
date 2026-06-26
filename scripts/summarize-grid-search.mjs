import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const results = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'test', 'fixtures', 'full-grid-search-results.json'),
    'utf8',
  ),
);

function table(rows, columns) {
  const colWidths = columns.map((col) =>
    Math.max(col.label.length, ...rows.map((r) => String(r[col.key]).length)),
  );
  const sep = '+' + colWidths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const header =
    '|' + columns.map((col, i) => ` ${col.label.padEnd(colWidths[i])} `).join('|') + '|';
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

function printTop(label, rows, n = 10) {
  console.log(`\n--- ${label} ---`);
  table(
    rows.slice(0, n).map((r, i) => ({ rank: i + 1, ...r })),
    [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'label', label: 'Engine', align: 'left' },
      { key: 'compositeScore', label: 'composite', align: 'right' },
      { key: 'logLoss', label: 'logLoss', align: 'right' },
      { key: 'brier', label: 'brier', align: 'right' },
      { key: 'calMae', label: 'calMAE', align: 'right' },
      { key: 'partnerDiffPct', label: 'partnerDiff', align: 'right' },
      { key: 'absDriftPerMatch', label: 'absDrift', align: 'right' },
    ],
  );
}

function currentProduction() {
  const labels = [
    'first_observed arithmetic antiCarry softUnderdog kD48 kS24 mw0.1 gf0.75 lb0.75 mpr2',
    'reset_per_event arithmetic antiCarry softUnderdog kD48 kS24 mw0.1 gf0.75 lb0.75 mpr2',
  ];
  return labels
    .map((label) => results.find((r) => r.label === label))
    .filter(Boolean)
    .map((r) => ({
      role: r.label.startsWith('first_observed') ? 'PROD (first_observed)' : 'PROD (reset/event)',
      label: r.label,
      composite: r.compositeScore.toFixed(4),
      logLoss: r.logLoss.toFixed(4),
      brier: r.brier.toFixed(4),
      calMae: r.calMae.toFixed(4),
      partnerDiff: r.partnerDiffPct,
      absDrift: r.absDriftPerMatch.toFixed(4),
    }));
}

function main() {
  const reset = results.filter((r) => r.params.seeding === 'reset_per_event');
  const first = results.filter((r) => r.params.seeding === 'first_observed');

  const resetBest = reset.sort((a, b) => a.compositeScore - b.compositeScore).slice(0, 10);
  const firstBest = first.sort((a, b) => a.compositeScore - b.compositeScore).slice(0, 10);
  const resetLogLoss = [...reset].sort((a, b) => a.logLoss - b.logLoss).slice(0, 5);
  const firstLogLoss = [...first].sort((a, b) => a.logLoss - b.logLoss).slice(0, 5);

  printTop('TOP 10 RESET-PER-EVENT (best fair for tournaments)', resetBest);
  printTop('TOP 10 FIRST-OBSERVED (uses existing player ratings)', firstBest);

  console.log('\n--- TOP 5 PREDICTIVE (reset_per_event) ---');
  table(
    resetLogLoss.map((r, i) => ({ rank: i + 1, ...r })),
    [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'label', label: 'Engine', align: 'left' },
      { key: 'logLoss', label: 'logLoss', align: 'right' },
      { key: 'brier', label: 'brier', align: 'right' },
      { key: 'calMae', label: 'calMAE', align: 'right' },
      { key: 'partnerDiffPct', label: 'partnerDiff', align: 'right' },
    ],
  );

  console.log('\n--- TOP 5 PREDICTIVE (first_observed) ---');
  table(
    firstLogLoss.map((r, i) => ({ rank: i + 1, ...r })),
    [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'label', label: 'Engine', align: 'left' },
      { key: 'logLoss', label: 'logLoss', align: 'right' },
      { key: 'brier', label: 'brier', align: 'right' },
      { key: 'calMae', label: 'calMAE', align: 'right' },
      { key: 'partnerDiffPct', label: 'partnerDiff', align: 'right' },
    ],
  );

  const currentRows = currentProduction();
  if (currentRows.length > 0) {
    console.log('\n--- CURRENT PRODUCTION CONFIG ---');
    table(currentRows, [
      { key: 'role', label: 'Role', align: 'left' },
      { key: 'label', label: 'Engine', align: 'left' },
      { key: 'composite', label: 'composite', align: 'right' },
      { key: 'logLoss', label: 'logLoss', align: 'right' },
      { key: 'brier', label: 'brier', align: 'right' },
      { key: 'calMae', label: 'calMAE', align: 'right' },
      { key: 'partnerDiff', label: 'partnerDiff', align: 'right' },
      { key: 'absDrift', label: 'absDrift', align: 'right' },
    ]);
  }

  const bestReset = resetBest[0];
  const bestFirst = firstBest[0];
  const bestResetPredictive = resetLogLoss[0];
  const bestFirstPredictive = firstLogLoss[0];

  console.log('\n=== FINAL RECOMMENDATION ===');
  console.log(`Best fair tournament engine (reset per event): ${bestReset.label}`);
  console.log(`  logLoss=${bestReset.logLoss.toFixed(4)} brier=${bestReset.brier.toFixed(4)} calMAE=${bestReset.calMae.toFixed(4)} partnerDiff=${bestReset.partnerDiffPct} absDrift=${bestReset.absDriftPerMatch.toFixed(4)}`);
  console.log(`\nBest engine using existing ratings (first_observed): ${bestFirst.label}`);
  console.log(`  logLoss=${bestFirst.logLoss.toFixed(4)} brier=${bestFirst.brier.toFixed(4)} calMAE=${bestFirst.calMae.toFixed(4)} partnerDiff=${bestFirst.partnerDiffPct} absDrift=${bestFirst.absDriftPerMatch.toFixed(4)}`);
  console.log(`\nBest predictive (reset per event): ${bestResetPredictive.label}`);
  console.log(`  logLoss=${bestResetPredictive.logLoss.toFixed(4)} brier=${bestResetPredictive.brier.toFixed(4)} calMAE=${bestResetPredictive.calMae.toFixed(4)}`);
  console.log(`\nBest predictive (first_observed): ${bestFirstPredictive.label}`);
  console.log(`  logLoss=${bestFirstPredictive.logLoss.toFixed(4)} brier=${bestFirstPredictive.brier.toFixed(4)} calMAE=${bestFirstPredictive.calMae.toFixed(4)}`);
}

main();
