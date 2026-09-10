/**
 * Fetch completed_match data from Directus for test fixtures.
 *
 * Saves last-60-days doubles matches for both Siklab clubs as JSON files
 * in test/fixtures/. These are used by duo leaderboard tests to verify
 * the algorithm against real-world data.
 *
 * Usage: npx tsx scripts/fetch-duo-fixtures.mts <token>
 * The token is a Directus static access token.
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('Usage: npx tsx scripts/fetch-duo-fixtures.mts <token>');
  process.exit(1);
}

const BASE = 'https://api.dinkmatch.club';
const DAYS = 60;
const FIELDS =
  'id,club,team_a,team_b,team_a_score,team_b_score,completed_at,meta,match_key,match_id,match_type';

const CLUBS = [
  {
    id: '22e52ef0-bf60-4bd1-bea8-ef66193edf35',
    name: 'siklab-pickleball-club',
  },
  {
    id: 'c4921ecb-bc3a-4daf-971c-e8157b7480a5',
    name: 'siklab-tryout',
  },
];

async function fetchAllMatches(clubId: string): Promise<unknown[]> {
  const all: unknown[] = [];
  const PAGE_SIZE = 500;
  const MAX_PAGES = 10;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url =
      `${BASE}/items/completed_match` +
      `?filter%5B_and%5D%5B0%5D%5Bclub%5D%5B_eq%5D=${clubId}` +
      `&filter%5B_and%5D%5B1%5D%5Bcompleted_at%5D%5B_gte%5D=%24NOW(-${DAYS}%20days)` +
      '&filter%5B_and%5D%5B2%5D%5Bmatch_type%5D%5B_eq%5D=doubles' +
      `&fields=${FIELDS}` +
      `&sort=-completed_at&limit=${PAGE_SIZE}&page=${page}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const batch = json.data || [];
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}

async function main() {
  const outDir = resolve(process.cwd(), 'test', 'fixtures');

  for (const club of CLUBS) {
    console.log(`Fetching ${club.name} (${club.id})...`);
    const matches = await fetchAllMatches(club.id);
    const filename = `completed_matches_${club.name}_${DAYS}d.json`;
    const filepath = resolve(outDir, filename);

    // Strip sensitive data (avatars, tokens, etc.) — keep only what the
    // duo algorithm needs: team_a, team_b, scores, meta, timestamps.
    const clean = matches.map((m: any) => ({
      id: m.id,
      club: m.club,
      match_key: m.match_key,
      match_id: m.match_id,
      match_type: m.match_type,
      team_a_score: m.team_a_score,
      team_b_score: m.team_b_score,
      completed_at: m.completed_at,
      meta: m.meta ? { matchmakingMode: m.meta.matchmakingMode } : null,
      team_a: (m.team_a || []).map((p: any) => ({
        userId: p.userId,
        username: p.username,
        firstName: p.firstName,
        lastName: p.lastName,
        level: p.level,
        rating: p.rating,
      })),
      team_b: (m.team_b || []).map((p: any) => ({
        userId: p.userId,
        username: p.username,
        firstName: p.firstName,
        lastName: p.lastName,
        level: p.level,
        rating: p.rating,
      })),
    }));

    writeFileSync(filepath, JSON.stringify(clean, null, 2));
    console.log(`  Saved ${clean.length} matches → ${filepath}`);

    // Mode breakdown
    const modes: Record<string, number> = {};
    for (const m of clean as any[]) {
      const mode = m.meta?.matchmakingMode || 'none';
      modes[mode] = (modes[mode] || 0) + 1;
    }
    console.log(`  Modes: ${JSON.stringify(modes)}`);
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
