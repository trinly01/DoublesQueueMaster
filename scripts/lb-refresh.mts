/**
 * SCRATCH — leaderboard refresh/re-baseline. NOT committed.
 *
 * 1. Re-fetch current completed_match window (club + last 30d, limit 1000).
 * 2. Determine which match set the new screenshot corresponds to:
 *    per-player games under (a) competitive-only and (b) all matches.
 *    Screenshot anchors: rands 105G 53W-52L, Mikki 95G 50W-45L,
 *    Jowinski 86G 53W-33L.
 * 3. On the matching dataset run CURRENT production algorithm
 *    (computeNetworkRanked → V5 directed edges + adaptive λ_i), report
 *    top-15, Spearman ρ(rank, games), tracked-player positions, counts.
 * 4. Rating availability on match participants for the top-30:
 *    coverage %, range, per-player variance (snapshot vs constant).
 *
 * Run: npx esbuild scripts/lb-refresh.mts --bundle --platform=node --format=esm --outfile=.tmp-analysis/lb-refresh.mjs && node .tmp-analysis/lb-refresh.mjs | tee .tmp-analysis/lb-refresh-out.txt
 */
import { computeNetworkRanked } from '../src/utils/leaderboardCompute';
import { playerIdentityKey } from '../src/utils/ratingReplay';
import type { DirectusCompletedMatch } from '../src/services/playerProfile';

const CLUB = '22e52ef0-bf60-4bd1-bea8-ef66193edf35';
const BASE = 'https://api.dinkmatch.club';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch { /* already loaded */ }
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) { console.error('BOOKING_ADMIN_TOKEN missing'); process.exit(1); }

async function api(path: string): Promise<any> {
  for (const auth of [`Bearer ${TOKEN}`, TOKEN as string]) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: auth } });
    if (res.status === 401 || res.status === 403) continue;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  }
  throw new Error('auth failed');
}

const filter = {
  _and: [
    { club: { _eq: CLUB } },
    { completed_at: { _gte: '$NOW(-30 days)' } },
  ],
};
const url =
  `/items/completed_match?filter=${encodeURIComponent(JSON.stringify(filter))}` +
  `&sort=-completed_at&limit=1000` +
  `&fields=${encodeURIComponent('*,players.directus_users_id.*')}`;
const fetched = await api(url);
const matches = (fetched.data || []) as DirectusCompletedMatch[];
console.log(`fetched ${matches.length} completed_match rows`);
if (matches.length) {
  console.log(`window: ${matches[matches.length - 1]?.completed_at} -> ${matches[0]?.completed_at}`);
}
if (matches.length === 1000) console.log('WARNING: limit=1000 hit — truncation identical to app fetch');

// mode histogram of the fetched set
const modeHist = new Map<string, number>();
for (const m of matches) {
  const mode = m.meta?.matchmakingMode || '(none)';
  modeHist.set(mode, (modeHist.get(mode) || 0) + 1);
}
console.log('matchmakingMode histogram:', [...modeHist.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  '));

// ---------- registered-user set (junction), for display filter ----------
const registered = new Set<string>();
for (const m of matches) {
  for (const jp of m.players || []) {
    const u = jp.directus_users_id?.username;
    if (u) registered.add(u);
  }
}
console.log(`registered usernames (junction): ${registered.size}`);

// ---------- run production algorithm on BOTH datasets ----------
const comp = computeNetworkRanked(matches, false);   // includeNonCompetitive=false
const all = computeNetworkRanked(matches, true);     // includeNonCompetitive=true
console.log(`\ncomputeNetworkRanked(false): ${comp.length} players | (true): ${all.length} players`);

const ANCHORS: Record<string, { g: number; w: number; l: number }> = {
  rands: { g: 105, w: 53, l: 52 },
  mikki: { g: 95, w: 50, l: 45 },
  jowinski: { g: 86, w: 53, l: 33 },
};
const findBy = (list: typeof comp, name: string) =>
  list.find((p) =>
    `${p.name} ${p.firstName} ${p.lastName} ${p.username} ${p.key}`.toLowerCase().includes(name),
  );

function compareSet(label: string, list: typeof comp) {
  console.log(`\n--- ${label} ---`);
  for (const [name, a] of Object.entries(ANCHORS)) {
    const p = findBy(list, name);
    if (!p) { console.log(`  ${name}: NOT FOUND`); continue; }
    const ok = p.matchesPlayed === a.g && p.wins === a.w && p.losses === a.l;
    console.log(
      `  ${name}: g=${p.matchesPlayed} w=${p.wins} l=${p.losses}${p.ties ? ` t=${p.ties}` : ''}` +
      `  net=${p.networkScore} raw=${p.rawScore.toFixed(4)} | screenshot ${a.g}G ${a.w}W-${a.l}L ${ok ? '<< MATCH' : ''}`,
    );
  }
}
compareSet('competitive-only (includeNonCompetitive=false)', comp);
compareSet('all matches (includeNonCompetitive=true)', all);

// ---------- pick dataset matching screenshot ----------
// Score each dataset by anchor agreement.
function anchorScore(list: typeof comp): number {
  let s = 0;
  for (const [name, a] of Object.entries(ANCHORS)) {
    const p = findBy(list, name);
    if (p) s += (p.matchesPlayed === a.g ? 1 : 0) + (p.wins === a.w ? 1 : 0) + (p.losses === a.l ? 1 : 0);
  }
  return s;
}
const useAll = anchorScore(all) > anchorScore(comp);
const chosen = useAll ? all : comp;
const chosenLabel = useAll ? 'ALL MATCHES (includeNonCompetitive=true)' : 'COMPETITIVE-ONLY';
console.log(`\n>>> screenshot dataset = ${chosenLabel} (anchor hits: comp=${anchorScore(comp)}/9, all=${anchorScore(all)}/9)`);

// display-filtered view (registered users only — what the app renders)
const displayed = chosen.filter((p) => registered.has(p.username));
console.log(`display-filtered players: ${displayed.length} (of ${chosen.length} engine players)`);

// ---------- stats helpers ----------
function ranksBy<T>(items: T[], scoreOf: (t: T) => number): number[] {
  const order = items.map((t, i) => ({ t, i, s: scoreOf(t) }))
    .sort((a, b) => b.s - a.s || a.i - b.i);
  const ranks = new Array<number>(items.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].s === order[i].s) j++;
    const avg = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks[order[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}
function pearson(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}
const scoreRanks = ranksBy(displayed, (p) => p.rawScore);
const gameRanks = ranksBy(displayed, (p) => p.matchesPlayed);
const rho = pearson(scoreRanks, gameRanks); // both rank1=best → + means aligned
console.log(`\nSpearman ρ(scoreRank, gamesRank) on display list = ${rho.toFixed(4)}`);

// ---------- top 15 + tracked positions ----------
console.log('\n=== TOP 15 (production algorithm, display-filtered) ===');
console.log('rk  name                                   net  raw      g    W-L');
displayed.slice(0, 15).forEach((p, i) => {
  console.log(
    `${String(i + 1).padStart(3)}  ${(p.name || p.username).padEnd(38)} ${String(p.networkScore).padStart(3)}  ${p.rawScore.toFixed(4)}  ${String(p.matchesPlayed).padStart(4)}  ${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ''}`,
  );
});

const TRACKED = ['jeo', 'shirwin', 'atthan', 'sandro', 'juha', 'trin', 'marivic', 'jowinski', 'cara', 'mark', 'ednalyn'];
console.log('\n=== tracked positions (engine rank / display rank) ===');
const engPos = new Map(chosen.map((p, i) => [p.key, i + 1]));
const dispPos = new Map(displayed.map((p, i) => [p.key, i + 1]));
for (const t of TRACKED) {
  const hits = chosen.filter((p) =>
    `${p.name} ${p.firstName} ${p.lastName} ${p.username} ${p.key}`.toLowerCase().includes(t),
  );
  if (!hits.length) { console.log(`  '${t}': NOT FOUND`); continue; }
  for (const p of hits) {
    const dp = dispPos.get(p.key);
    console.log(
      `  '${t}': ${p.name || p.username} (@${p.username || p.key}) net=${p.networkScore} g=${p.matchesPlayed} ${p.wins}-${p.losses} | engine=#${engPos.get(p.key)} display=#${dp ?? '—(not registered)'}`,
    );
  }
}
// matches actually consumed by the engine (both sides non-empty after
// identity dedupe, no cross-team collision, n>=2) — mirrors computeNetworkScores skips.
const NON_COMP = new Set(['fair_balance', 'variety_first']);
const chosenRaw = useAll ? matches : matches.filter((m) => !NON_COMP.has(m.meta?.matchmakingMode || ''));
let usableMatches = 0, skippedMatches = 0;
{
  const keyOfP = (p: any) =>
    p.userId || p.username || `guest:${p.firstName || ''}|${p.lastName || ''}|${p.name || ''}`;
  for (const m of chosenRaw) {
    const ka = new Set((m.team_a || []).map(keyOfP));
    const kb = new Set((m.team_b || []).map(keyOfP));
    if (ka.size === 0 || kb.size === 0) { skippedMatches++; continue; }
    let coll = false;
    for (const k of kb) if (ka.has(k)) { coll = true; break; }
    if (coll || ka.size + kb.size < 2) { skippedMatches++; continue; }
    usableMatches++;
  }
}
console.log(`\ntotals: fetched=${matches.length} chosenSet=${chosenRaw.length} usableMatches=${usableMatches} skipped=${skippedMatches} enginePlayers=${chosen.length} displayPlayers=${displayed.length}`);

// ---------- rating availability on participants ----------
// Collect per-match rating values keyed by identity, over the CHOSEN dataset.
const matchSet = useAll ? matches : matches.filter(
  (m) => !new Set(['fair_balance', 'variety_first']).has(m.meta?.matchmakingMode || ''),
);
const ratingSamples = new Map<string, { key: string; vals: (number | undefined)[]; isGuest: boolean }>();
let participantSlots = 0;
let slotsWithRating = 0;
let guestSlots = 0;
let guestWithRating = 0;
const seenInMatch = new Set<string>(); // dedupe within a match per key
for (const m of matchSet) {
  seenInMatch.clear();
  for (const side of [m.team_a, m.team_b] as const) {
    for (const p of side || []) {
      const key = playerIdentityKey({
        userId: p.userId, username: p.username, firstName: p.firstName,
        lastName: p.lastName, name: p.name, rating: p.rating,
      });
      if (seenInMatch.has(key)) continue; // same identity twice in one match
      seenInMatch.add(key);
      participantSlots++;
      const has = typeof p.rating === 'number' && Number.isFinite(p.rating);
      if (has) slotsWithRating++;
      const isGuest = key.startsWith('guest:') || (!p.userId && !p.username);
      if (isGuest) { guestSlots++; if (has) guestWithRating++; }
      let rec = ratingSamples.get(key);
      if (!rec) ratingSamples.set(key, (rec = { key, vals: [], isGuest }));
      rec.vals.push(has ? p.rating : undefined);
      rec.isGuest = rec.isGuest || isGuest;
    }
  }
}
const allRatings = [...ratingSamples.values()].flatMap((r) =>
  r.vals.filter((v): v is number => typeof v === 'number'),
);
allRatings.sort((a, b) => a - b);
const q = (arr: number[], p: number) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : NaN;
console.log('\n=== rating availability (chosen dataset participants) ===');
console.log(`participant slots=${participantSlots}  withRating=${slotsWithRating} (${((100 * slotsWithRating) / participantSlots).toFixed(1)}%)`);
console.log(`guest slots=${guestSlots}  guestWithRating=${guestWithRating} (${guestSlots ? ((100 * guestWithRating) / guestSlots).toFixed(1) : '0.0'}%)`);
console.log(`rating values: n=${allRatings.length} min=${allRatings[0]} p10=${q(allRatings, 0.1)} median=${q(allRatings, 0.5)} p90=${q(allRatings, 0.9)} max=${allRatings[allRatings.length - 1]}`);

// top-30 display players: per-player rating stats
console.log('\n=== top-30 display players: rating field behavior ===');
const top30 = displayed.slice(0, 30);
let varyCount = 0, constCount = 0, noRating = 0;
for (const p of top30) {
  const rec = ratingSamples.get(p.key);
  const vals = rec ? rec.vals.filter((v): v is number => typeof v === 'number') : [];
  if (!vals.length) { noRating++; console.log(`  ${String(displayed.indexOf(p) + 1).padStart(2)} ${p.name || p.username} (@${p.username}) g=${p.matchesPlayed}: NO rating on any appearance`); continue; }
  const uniq = new Set(vals);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const coverage = `${vals.length}/${rec!.vals.length}`;
  if (uniq.size > 1) {
    varyCount++;
    console.log(`  ${String(displayed.indexOf(p) + 1).padStart(2)} ${p.name || p.username} (@${p.username}) g=${p.matchesPlayed}: VARIES n=${uniq.size} range=[${mn},${mx}] cov=${coverage} latest=${p.rating}`);
  } else {
    constCount++;
    console.log(`  ${String(displayed.indexOf(p) + 1).padStart(2)} ${p.name || p.username} (@${p.username}) g=${p.matchesPlayed}: CONSTANT=${mn} cov=${coverage} appearances=${rec!.vals.length}`);
  }
}
console.log(`top30 summary: constant=${constCount} varies=${varyCount} noRating=${noRating}`);

// global per-player variance summary (all players with ≥2 rated appearances)
let playersWith2plus = 0, playersVary = 0;
for (const rec of ratingSamples.values()) {
  const vals = rec.vals.filter((v): v is number => typeof v === 'number');
  if (vals.length >= 2) {
    playersWith2plus++;
    if (new Set(vals).size > 1) playersVary++;
  }
}
console.log(`all players: with≥2 rated appearances=${playersWith2plus}, of which varying=${playersVary} (${playersWith2plus ? ((100 * playersVary) / playersWith2plus).toFixed(1) : '0'}%)`);
