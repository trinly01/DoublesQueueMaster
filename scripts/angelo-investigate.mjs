// SCRATCH — Angelo (@baribalangelog110408#7cx) data investigation. NOT committed.
// Pulls ALL his completed_match rows (no 30d bound, no club bound), plus the
// standard club window for comparison players' rating snapshots.
import { writeFileSync } from 'node:fs';

const BASE = 'https://api.dinkmatch.club';
process.loadEnvFile(new URL('../.env', import.meta.url));
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
const CLUB = '22e52ef0-bf60-4bd1-bea8-ef66193edf35';
const OUT = [];
const log = (...a) => { const s = a.join(' '); OUT.push(s); console.log(s); };

async function api(path) {
  for (const auth of [`Bearer ${TOKEN}`, TOKEN]) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: auth } });
    if (res.status === 401 || res.status === 403) continue;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  }
  throw new Error('auth failed');
}
const FIELDS = encodeURIComponent('*,players.directus_users_id.*');

// ---- Fetch 1: ALL of Angelo's matches via players junction username ----
const angeloFilter = { players: { directus_users_id: { username: { _contains: 'baribalangelog' } } } };
let angeloMatches = [];
try {
  const j = await api(`/items/completed_match?filter=${encodeURIComponent(JSON.stringify(angeloFilter))}&sort=-completed_at&limit=1000&fields=${FIELDS}`);
  angeloMatches = j.data || [];
  log(`angelo junction-filter rows: ${angeloMatches.length}`);
} catch (e) { log('angelo junction filter failed:', e.message); }

// Fallback: JSON-column filter on team_a/team_b (catches guest appearances
// with no players-junction row). Directus JSON filtering is version-
// dependent — try it, tolerate failure.
try {
  const jsonFilter = {
    _or: [
      { team_a: { username: { _contains: 'baribalangelog' } } },
      { team_b: { username: { _contains: 'baribalangelog' } } },
    ],
  };
  const j2 = await api(`/items/completed_match?filter=${encodeURIComponent(JSON.stringify(jsonFilter))}&sort=-completed_at&limit=1000&fields=${FIELDS}`);
  const extra = (j2.data || []).filter((m) => !angeloMatches.some((x) => x.id === m.id));
  log(`team-JSON filter rows: ${(j2.data || []).length} (new vs junction: ${extra.length})`);
  angeloMatches.push(...extra);
} catch (e) { log('team-JSON filter failed:', e.message); }
if (angeloMatches.length === 0) {
  log('both filters returned 0 — will rely on window scan only');
}

// ---- Fetch 2: standard club window (all modes, limit 1000) for context + other Angelo identities ----
const winFilter = { _and: [ { club: { _eq: CLUB } }, { completed_at: { _gte: '$NOW(-30 days)' } } ] };
const win = await api(`/items/completed_match?filter=${encodeURIComponent(JSON.stringify(winFilter))}&sort=-completed_at&limit=1000&fields=${FIELDS}`);
const windowMatches = win.data || [];
log(`club window rows: ${windowMatches.length}`);

// ---- Angelo identity resolution inside his matches ----
const isAngelo = (u) => /baribalangelog/i.test(u || '');
const angeloIdentities = new Map(); // tuple -> count
const clubCounts = new Map();
let inWindowCount = 0;
const angeloInWindow = windowMatches.filter((m) =>
  [...(m.team_a || []), ...(m.team_b || [])].some((p) => isAngelo(p.username)));
inWindowCount = angeloInWindow.length;

for (const m of angeloMatches) {
  const c = typeof m.club === 'string' ? m.club : m.club?.id;
  clubCounts.set(c, (clubCounts.get(c) || 0) + 1);
  for (const side of ['team_a', 'team_b']) {
    for (const p of m[side] || []) {
      if (!isAngelo(p.username)) continue;
      const tup = JSON.stringify({
        userId: p.userId, username: p.username, firstName: p.firstName,
        lastName: p.lastName, duprId: p.duprId, rating: p.rating, level: p.level,
      });
      angeloIdentities.set(tup, (angeloIdentities.get(tup) || 0) + 1);
    }
  }
}
log('\n=== ANGELO MATCH SET ===');
log(`total rows (all-time, all clubs): ${angeloMatches.length}`);
log(`of which inside current 30d club window: ${inWindowCount}`);
log(`clubs seen: ${[...clubCounts.entries()].map(([k, v]) => `${k}=${v}`).join('  ')}`);
if (angeloMatches.length) {
  const dates = angeloMatches.map((m) => m.completed_at).sort();
  log(`date range: ${dates[0]} -> ${dates[dates.length - 1]}`);
}
log(`distinct participant tuples (identity check): ${angeloIdentities.size}`);
for (const [t, n] of [...angeloIdentities.entries()].sort((a, b) => b[1] - a[1])) {
  log(`  ${n}x ${t}`);
}

// ---- W-L / margins / modes over his matches ----
// For each match find which side Angelo is on (by username or userId).
let W = 0, L = 0, T = 0, games = 0;
const modeHist = new Map();
const margins = [];
const opponents = new Map();
const teammates = new Map();
const anomalies = [];
const perMatch = [];
for (const m of angeloMatches) {
  const aHas = (m.team_a || []).some((p) => isAngelo(p.username));
  const bHas = (m.team_b || []).some((p) => isAngelo(p.username));
  if (!aHas && !bHas) continue;
  games++;
  const mode = m.meta?.matchmakingMode || '(none)';
  modeHist.set(mode, (modeHist.get(mode) || 0) + 1);
  const sA = m.team_a_score, sB = m.team_b_score;
  if (typeof sA !== 'number' || typeof sB !== 'number') { anomalies.push(`missing score ${m.match_key} ${m.completed_at}`); continue; }
  const heIsA = aHas;
  const own = heIsA ? sA : sB;
  const opp = heIsA ? sB : sA;
  if (own === opp) T++; else if (own > opp) W++; else L++;
  margins.push(Math.abs(own - opp));
  for (const p of (heIsA ? m.team_b : m.team_a) || []) {
    const un = p.username || p.userId || '?';
    opponents.set(un, (opponents.get(un) || 0) + 1);
  }
  for (const p of (heIsA ? m.team_a : m.team_b) || []) {
    if (isAngelo(p.username)) continue;
    const un = p.username || p.userId || '?';
    teammates.set(un, (teammates.get(un) || 0) + 1);
  }
  if (sA === sB || sA < 0 || sB < 0 || sA > 30 || sB > 30) {
    anomalies.push(`odd score ${sA}-${sB} ${m.match_key} ${m.completed_at} mode=${mode}`);
  }
  perMatch.push({ d: m.completed_at, mode, score: `${sA}-${sB}`, side: heIsA ? 'A' : 'B', club: typeof m.club === 'string' ? m.club : m.club?.id });
}
log('\n=== ANGELO RESULTS (all fetched matches) ===');
log(`games=${games} W=${W} L=${L} T=${T}  winrate(decisive)=${(W / (W + L) * 100).toFixed(1)}%`);
log(`modes: ${[...modeHist.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ')}`);
if (margins.length) {
  margins.sort((a, b) => a - b);
  const avg = margins.reduce((a, b) => a + b, 0) / margins.length;
  log(`margin |diff|: mean=${avg.toFixed(2)} median=${margins[Math.floor(margins.length / 2)]} min=${margins[0]} max=${margins[margins.length - 1]}`);
  log(`blowout losses (lost by >=5): ${perMatch.filter((x) => { const [a, b] = x.score.split('-').map(Number); return x.side === 'A' ? b - a >= 5 : a - b >= 5; }).length}`);
}
log(`top teammates: ${[...teammates.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}(${v})`).join('  ')}`);
log(`top opponents : ${[...opponents.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}(${v})`).join('  ')}`);
if (anomalies.length) { log(`ANOMALIES (${anomalies.length}):`); anomalies.slice(0, 15).forEach((a) => log('  ' + a)); }
else log('no score anomalies');

// ---- rating snapshots: Angelo vs comparison players (window data) ----
const keyOf = (p) => p.userId || p.username || `guest:${p.firstName || ''}|${p.lastName || ''}|${p.name || ''}`;
const targets = {
  angelo: (u) => /baribalangelog/i.test(u || ''),
  jeo: (u) => /jeovannizabala/i.test(u || ''),
  obal: (u) => /crisnrose556/i.test(u || ''),
  trin: (u) => /^trinmar\.boado$/i.test(u || ''),
  rands: (u) => /angelobaribal110408/i.test(u || ''),
  marivic: (u) => /margatch1771/i.test(u || ''),
  jowinski: (u) => /jowinskisoriano100/i.test(u || ''),
  cara: (u) => /eslabracassieralph/i.test(u || ''),
};
const stats = {};
for (const name of Object.keys(targets)) stats[name] = { vals: [], keys: new Set(), games: 0, w: 0, l: 0 };
// W/L within window for targets
for (const m of windowMatches) {
  const sides = { A: m.team_a || [], B: m.team_b || [] };
  for (const [tag, members] of Object.entries(sides)) {
    for (const p of members) {
      for (const [name, pred] of Object.entries(targets)) {
        if (!pred(p.username)) continue;
        const st = stats[name];
        st.keys.add(keyOf(p));
        if (typeof p.rating === 'number') st.vals.push(p.rating);
        st.games++;
        const own = tag === 'A' ? m.team_a_score : m.team_b_score;
        const opp = tag === 'A' ? m.team_b_score : m.team_a_score;
        if (own > opp) st.w++; else if (own < opp) st.l++;
      }
    }
  }
}
log('\n=== RATING SNAPSHOTS + W/L inside 30d club window ===');
for (const [name, st] of Object.entries(stats)) {
  if (!st.vals.length && !st.games) { log(`${name}: no appearances in window`); continue; }
  const v = [...st.vals].sort((a, b) => a - b);
  const mean = v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(0) : '—';
  log(`${name.padEnd(9)}: appearances=${st.games} keys=${[...st.keys].join(',')} W-L=${st.w}-${st.l} rating n=${v.length} min=${v[0] ?? '—'} med=${v[Math.floor(v.length / 2)] ?? '—'} mean=${mean} max=${v[v.length - 1] ?? '—'} latest=${v[v.length - 1] ?? '—'}`);
}

// ---- other 'angelo' identities in window (split check) ----
log('\n=== all usernames containing \'angelo\' in window ===');
const angeloUsers = new Map();
for (const m of windowMatches) {
  for (const p of [...(m.team_a || []), ...(m.team_b || [])]) {
    if (/angelo/i.test(p.username || '')) {
      const k = `${p.username}|uid=${p.userId}|name=${p.firstName} ${p.lastName}`;
      angeloUsers.set(k, (angeloUsers.get(k) || 0) + 1);
    }
  }
}
for (const [k, n] of [...angeloUsers.entries()].sort((a, b) => b[1] - a[1])) log(`  ${n}x ${k}`);

// ---- DUPR fields presence check (TASK B input) ----
let duprIdCount = 0, duprRatingFields = new Set(), participantSlots = 0, juncDupr = 0;
for (const m of windowMatches.slice(0, 300)) {
  for (const p of [...(m.team_a || []), ...(m.team_b || [])]) {
    participantSlots++;
    if (p.duprId) duprIdCount++;
    for (const k of Object.keys(p)) if (/dupr/i.test(k)) duprRatingFields.add(k);
  }
  for (const jp of m.players || []) {
    const u = jp.directus_users_id;
    if (u) { for (const k of Object.keys(u)) if (/dupr/i.test(k)) { duprRatingFields.add('junc.' + k); if (u[k] != null) juncDupr++; } }
  }
}
log('\n=== DUPR field presence (first 300 window matches) ===');
log(`participant slots=${participantSlots} with duprId=${duprIdCount} (${((100 * duprIdCount) / participantSlots).toFixed(1)}%)`);
log(`dupr-ish fields seen: ${[...duprRatingFields].join(', ') || '(none)'}`);
log(`junction dupr fields non-null count=${juncDupr}`);

writeFileSync(new URL('../.tmp-analysis/angelo-out.txt', import.meta.url), OUT.join('\n'));
log('\nwrote .tmp-analysis/angelo-out.txt');
