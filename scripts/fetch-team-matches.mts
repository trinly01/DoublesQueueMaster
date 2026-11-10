/**
 * Fetch completed_match data for the 10-player tournament roster.
 *
 * Pulls ALL completed matches in the window (any club), then keeps only
 * matches where at least one of the roster players appears. Saves to
 * test/fixtures/completed_matches_team_90d.json — NOT committed (contains
 * personal data beyond what existing fixtures carry? keep local anyway).
 *
 * Usage: npx tsx scripts/fetch-team-matches.mts <token> [days|all]
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import https from 'https';

// Node 16 — no global fetch; minimal GET helper.
function getJson(url: string, token: string): Promise<any> {
  return new Promise((resolvePromise, reject) => {
    https
      .get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if ((res.statusCode || 0) >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
            return;
          }
          try {
            resolvePromise(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('Usage: npx tsx scripts/fetch-team-matches.mts <token> [days]');
  process.exit(1);
}
const DAYS_ARG = process.argv[3] || '90';
const ALL_TIME = DAYS_ARG === 'all' || DAYS_ARG === '0';
const DAYS = ALL_TIME ? 0 : Number(DAYS_ARG) || 90;
const BASE = 'https://api.dinkmatch.club';
const PAGE_SIZE = 500;
const MAX_PAGES = 16; // 8000 match cap — collection is ~5k all-time
const FIELDS =
  'id,club,team_a,team_b,team_a_score,team_b_score,completed_at,meta,match_key,match_id,match_type';

// Roster — matched against team_a/team_b snapshot firstName/lastName.
// lastName is the strong key; firstName must start with the first token.
const ROSTER = [
  { first: 'jeovanni', last: 'zabala', gender: 'M' },
  { first: 'franco', last: 'gachallan', gender: 'M' },
  { first: 'franco', last: 'gatchallan', gender: 'M' },
  { first: 'franco', last: 'gatchalian', gender: 'M' },
  { first: 'james', last: 'manganaan', gender: 'M' },
  { first: 'timothy', last: 'eslabra', gender: 'M' },
  { first: 'timothy', last: 'eslaba', gender: 'M' },
  { first: 'hazel', last: 'eslabra', gender: 'F' },
  { first: 'hazel', last: 'eslaba', gender: 'F' },
  { first: 'grace', last: 'estayo', gender: 'F' },
  { first: 'nairetta', last: 'pastoral', gender: 'F' },
  { first: 'jaria', last: 'querimit', gender: 'F' },
  { first: 'jaria', last: 'quintana', gender: 'F' }, // alt spelling guard
  { first: 'michael', last: 'braganza', gender: 'M' },
  { first: 'michael', last: 'disu', gender: 'M' },
  { first: 'sheree', last: 'villegas', gender: 'F' },
];

const norm = (s: unknown) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

function matchPlayer(p: any): { roster: (typeof ROSTER)[number]; via: string } | null {
  const fn = norm(p?.firstName);
  const ln = norm(p?.lastName);
  const un = norm(p?.username);
  if (!ln && !fn && !un) return null;
  for (const r of ROSTER) {
    const lastOk = ln === r.last || ln.endsWith(` ${r.last}`) || un === r.last;
    const firstOk =
      fn.startsWith(r.first) ||
      fn === r.first ||
      un.startsWith(r.first) ||
      (un.includes(r.last) && un.includes(r.first));
    if (lastOk && firstOk) return { roster: r, via: `${fn}|${ln}|${un}` };
    // lastName-only fallback for clearly unique surnames
    if (!firstOk && lastOk && ['zabala', 'manganaan', 'estayo', 'pastoral', 'villegas'].includes(r.last)) {
      return { roster: r, via: `lastonly:${fn}|${ln}|${un}` };
    }
  }
  return null;
}

async function fetchAll(): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const dateFilter = ALL_TIME
      ? ''
      : `filter%5Bcompleted_at%5D%5B_gte%5D=%24NOW(-${DAYS}%20days)&`;
    const url =
      `${BASE}/items/completed_match?` +
      dateFilter +
      `fields=${encodeURIComponent(FIELDS)}` +
      `&sort=-completed_at&limit=${PAGE_SIZE}&page=${page}`;
    const json = await getJson(url, TOKEN);
    const batch = json.data || [];
    if (batch.length === 0) break;
    all.push(...batch);
    console.log(`  page ${page}: ${batch.length} (total ${all.length})`);
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}

async function main() {
  console.log(`Fetching completed_match ${ALL_TIME ? 'ALL TIME' : `last ${DAYS} days`} (all clubs)...`);
  const all = await fetchAll();
  console.log(`Fetched ${all.length} matches total.`);

  const kept: any[] = [];
  const seenPlayers = new Map<string, any>();
  for (const m of all) {
    const team = [...(m.team_a || []), ...(m.team_b || [])];
    const hits = team.map(matchPlayer).filter(Boolean);
    if (hits.length === 0) continue;
    kept.push(m);
    for (const h of hits) {
      const p = team.find((x) => matchPlayer(x) === h) || {};
      const key = p.userId || p.username || `${p.firstName}|${p.lastName}`;
      if (!seenPlayers.has(key)) seenPlayers.set(key, p);
    }
  }

  console.log(`\nRoster players found in data (${seenPlayers.size} distinct keys):`);
  const byLast = new Map<string, any>();
  for (const [k, p] of seenPlayers) {
    const ln = norm(p.lastName) || norm(p.username);
    if (!byLast.has(ln)) byLast.set(ln, []);
    byLast.get(ln).push({ k, p });
  }
  for (const r of ROSTER) {
    const entries = [...seenPlayers.values()].filter((p) => {
      const m = matchPlayer(p);
      return m?.roster.last === r.last && norm(p.firstName).startsWith(r.first.slice(0, 4));
    });
    const uniq = new Map(entries.map((p) => [p.userId || p.username, p]));
    console.log(
      `  ${r.first} ${r.last} [${r.gender}]: ${uniq.size ? [...uniq.values()].map((p) => `${p.firstName} ${p.lastName} (@${p.username || '?'})`).join(' ; ') : 'NOT FOUND'}`,
    );
  }

  const outDir = resolve(process.cwd(), 'test', 'fixtures');
  mkdirSync(outDir, { recursive: true });
  const tag = ALL_TIME ? 'all' : `${DAYS}d`;
  const file = resolve(outDir, `completed_matches_team_${tag}.json`);
  writeFileSync(file, JSON.stringify(kept, null, 2));
  console.log(`\nSaved ${kept.length} roster matches -> ${file}`);

  // Full unfiltered dump — needed for alternate-account discovery.
  const fullFile = resolve(outDir, `completed_matches_full_${tag}.json`);
  writeFileSync(fullFile, JSON.stringify(all, null, 2));
  console.log(`Saved ${all.length} ALL matches -> ${fullFile}`);

  const modes: Record<string, number> = {};
  const types: Record<string, number> = {};
  for (const m of kept as any[]) {
    const mode = m.meta?.matchmakingMode || 'none';
    modes[mode] = (modes[mode] || 0) + 1;
    types[m.match_type || '?'] = (types[m.match_type || '?'] || 0) + 1;
  }
  console.log('Modes:', JSON.stringify(modes));
  console.log('Types:', JSON.stringify(types));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
