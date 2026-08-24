/**
 * Shared fixture loader with explicit cleaning policy.
 *
 * Cleaning rules (mirror production behaviour at matchmaking.ts:1492-1502):
 *   - Drop matches with matchmakingMode 'variety_first' or 'fair_balance'
 *     from RATING updates (production skips them). They may still be used
 *     for W/L counting and prediction scoring.
 *   - Drop matches with winning score > 22 or < 7 (data-entry errors).
 *   - Drop tied matches (margin 0) — defensive; none currently present.
 *   - Flag but keep isEdited matches.
 *
 * Prints a full exclusion report so nothing is silently dropped.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NON_COMPETITIVE_MODES = new Set(['variety_first', 'fair_balance']);

export function parseCsvLine(line) {
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

/**
 * Parse the new-format CSV (with club, match_key, meta columns).
 * Falls back to old format if those columns are absent.
 */
export function parseCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);

  // Detect column indices
  const col = (name) => header.indexOf(name);
  const idx = {
    date: col('date_created') >= 0 ? col('date_created') : 0,
    matchType: col('match_type') >= 0 ? col('match_type') : 1,
    matchId: col('match_id') >= 0 ? col('match_id') : 2,
    matchKey: col('match_key'),
    matchmakingMode: col('meta.matchmakingMode'),
    teamAScore: col('team_a_score') >= 0 ? col('team_a_score') : 3,
    teamBScore: col('team_b_score') >= 0 ? col('team_b_score') : 4,
    teamA: col('team_a') >= 0 ? col('team_a') : 5,
    teamB: col('team_b') >= 0 ? col('team_b') : 6,
    club: col('club'),
    isEdited: col('meta.isEdited'),
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i]);
    if (f.length < 7) continue;
    const teamAJson = f[idx.teamA] || '[]';
    const teamBJson = f[idx.teamB] || '[]';
    let teamA, teamB;
    try {
      teamA = JSON.parse(teamAJson);
      teamB = JSON.parse(teamBJson);
    } catch {
      continue; // skip malformed
    }
    rows.push({
      date: f[idx.date],
      matchType: f[idx.matchType],
      matchId: f[idx.matchId],
      matchKey: idx.matchKey >= 0 ? f[idx.matchKey] : f[idx.matchId],
      matchmakingMode: idx.matchmakingMode >= 0 ? f[idx.matchmakingMode] : '',
      teamAScore: parseInt(f[idx.teamAScore], 10),
      teamBScore: parseInt(f[idx.teamBScore], 10),
      teamA,
      teamB,
      club: idx.club >= 0 ? f[idx.club] : '',
      isEdited: idx.isEdited >= 0 ? f[idx.isEdited] === 'true' : false,
    });
  }
  return rows;
}

/**
 * Load and clean a fixture file. Returns { competitive, nonCompetitive, excluded, all }.
 * - competitive: matches that should affect ratings (mirror production)
 * - nonCompetitive: matches that count for W/L but NOT ratings
 * - excluded: dropped matches with reason
 */
export function loadFixture(filename) {
  const csvPath = path.join(__dirname, '..', '..', 'test', 'fixtures', filename);
  const text = fs.readFileSync(csvPath, 'utf8');
  const all = parseCsv(text);

  const competitive = [];
  const nonCompetitive = [];
  const excluded = [];

  for (const m of all) {
    const winScore = Math.max(m.teamAScore, m.teamBScore);
    const margin = Math.abs(m.teamAScore - m.teamBScore);

    // Exclusion: data-entry errors
    if (winScore > 22 || winScore < 7) {
      excluded.push({ match: m, reason: `extreme score ${m.teamAScore}-${m.teamBScore}` });
      continue;
    }
    if (margin === 0) {
      excluded.push({ match: m, reason: 'tied match' });
      continue;
    }
    if (m.matchType !== 'doubles') {
      excluded.push({ match: m, reason: `non-doubles (${m.matchType})` });
      continue;
    }

    // Split competitive vs non-competitive
    if (NON_COMPETITIVE_MODES.has(m.matchmakingMode)) {
      nonCompetitive.push(m);
    } else {
      competitive.push(m);
    }
  }

  // Print exclusion report
  console.log(`\n=== Fixture: ${filename} ===`);
  console.log(`Total parsed: ${all.length}`);
  console.log(`Competitive doubles: ${competitive.length}`);
  console.log(`Non-competitive (W/L only, no rating): ${nonCompetitive.length}`);
  console.log(`Excluded: ${excluded.length}`);
  const reasons = {};
  for (const e of excluded) {
    reasons[e.reason] = (reasons[e.reason] || 0) + 1;
  }
  for (const [r, c] of Object.entries(reasons)) {
    console.log(`  ${r}: ${c}`);
  }
  if (competitive.length > 0) {
    const clubs = new Set(competitive.map((m) => m.club).filter(Boolean));
    console.log(`Clubs (competitive): ${clubs.size}`);
    const perClub = {};
    for (const m of competitive) {
      perClub[m.club] = (perClub[m.club] || 0) + 1;
    }
    const sorted = Object.entries(perClub).sort((a, b) => b[1] - a[1]);
    for (const [c, n] of sorted.slice(0, 5)) {
      console.log(`  ${c.substring(0, 8)}... : ${n}`);
    }
  }
  console.log('');

  return { competitive, nonCompetitive, excluded, all };
}

/**
 * Load multiple fixtures and merge, deduplicating by matchKey.
 */
export function loadMerged(filenames) {
  const seen = new Set();
  const competitive = [];
  const nonCompetitive = [];
  const excluded = [];

  for (const f of filenames) {
    const result = loadFixture(f);
    for (const m of result.competitive) {
      if (!seen.has(m.matchKey)) {
        seen.add(m.matchKey);
        competitive.push(m);
      }
    }
    for (const m of result.nonCompetitive) {
      if (!seen.has(m.matchKey)) {
        seen.add(m.matchKey);
        nonCompetitive.push(m);
      }
    }
    excluded.push(...result.excluded);
  }

  // Sort by date then matchKey (deterministic)
  competitive.sort((a, b) => {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    if (da !== db) return da - db;
    return a.matchKey < b.matchKey ? -1 : a.matchKey > b.matchKey ? 1 : 0;
  });
  nonCompetitive.sort((a, b) => {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    if (da !== db) return da - db;
    return a.matchKey < b.matchKey ? -1 : a.matchKey > b.matchKey ? 1 : 0;
  });

  console.log(`=== Merged: ${competitive.length} competitive, ${nonCompetitive.length} non-competitive, ${excluded.length} excluded ===\n`);
  return { competitive, nonCompetitive, excluded };
}
