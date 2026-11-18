// SCRATCH — find exact identities for Aira / Jaymar / Cyyy in the club window,
// then pull each player's ALL-TIME completed_match history via junction filter.
process.loadEnvFile(new URL('../.env', import.meta.url));
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
const CLUB = '22e52ef0-bf60-4bd1-bea8-ef66193edf35';
const BASE = 'https://api.dinkmatch.club';
const OUT = [];
const log = (...a) => { const s = a.join(' '); OUT.push(s); console.log(s); };
const FIELDS = encodeURIComponent('*,players.directus_users_id.*');

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

// ---------- phase 1: window scan for candidate identities ----------
const winFilter = { _and: [ { club: { _eq: CLUB } }, { completed_at: { _gte: '$NOW(-30 days)' } } ] };
const win = await api(`/items/completed_match?filter=${encodeURIComponent(JSON.stringify(winFilter))}&sort=-completed_at&limit=1000&fields=${FIELDS}`);
const windowMatches = win.data || [];
log(`window rows: ${windowMatches.length}`);

const PAT = /aira|jaymar|cyyy|cyy|shai/i;
const cands = new Map(); // username|uid|name -> {n, first,last}
for (const m of windowMatches) {
  for (const p of [...(m.team_a || []), ...(m.team_b || [])]) {
    const hay = `${p.username}|${p.firstName}|${p.lastName}|${p.name}`;
    if (!PAT.test(hay)) continue;
    const k = `${p.username}|uid=${p.userId}|name=${p.firstName} ${p.lastName}`;
    const e = cands.get(k) || { n: 0 };
    e.n++;
    cands.set(k, e);
  }
}
log('\n=== window candidates matching /aira|jaymar|cyyy|shai/ ===');
for (const [k, v] of [...cands.entries()].sort((a, b) => b[1].n - a[1].n)) log(`  ${v.n}x ${k}`);

// ---------- phase 2: all-time pulls per chosen username-substring ----------
// username substring for junction _contains (must be part of stored username)
const PULLS = {
  aira: 'nairettap',        // Aira — verify; also try 'aira' fallback below
  jaymar: 'jaymar',         // matches maratajaymar187 and any other *jaymar*
  cyyy: 'cyyy',
  angelo: 'baribalangelog', // re-confirm
};
const NON_COMP = new Set(['fair_balance', 'variety_first']);
const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;

for (const [label, substr] of Object.entries(PULLS)) {
  const f = { players: { directus_users_id: { username: { _contains: substr } } } };
  let rows = [];
  try {
    const j = await api(`/items/completed_match?filter=${encodeURIComponent(JSON.stringify(f))}&sort=-completed_at&limit=1000&fields=${FIELDS}`);
    rows = j.data || [];
  } catch (e) { log(`\n### ${label}: fetch failed ${e.message}`); continue; }
  // identity tuples + club histogram
  const ids = new Map(); const clubs = new Map();
  for (const m of rows) {
    const c = typeof m.club === 'string' ? m.club : m.club?.id;
    clubs.set(c, (clubs.get(c) || 0) + 1);
    for (const p of [...(m.team_a || []), ...(m.team_b || [])]) {
      if (!p.username || !p.username.toLowerCase().includes(substr.toLowerCase()) && substr !== 'jaymar') {
        // for jaymar we still want only *jaymar* usernames — filter below anyway
      }
      const un = (p.username || '').toLowerCase();
      const hit = substr === 'jaymar' ? un.includes('jaymar') : un.includes(substr);
      if (!hit) continue;
      const tup = `${p.userId}|${p.username}|${p.firstName} ${p.lastName}`;
      ids.set(tup, (ids.get(tup) || 0) + 1);
    }
  }
  // W-L splits: all-time / in-window(club+30d) / competitive-only
  const isTarget = (p) => {
    const un = (p.username || '').toLowerCase();
    return substr === 'jaymar' ? un.includes('jaymar') : un.includes(substr);
  };
  let gA = 0, wA = 0, lA = 0, tA = 0;
  let gW = 0, wW = 0, lW = 0;
  let gC = 0, wC = 0, lC = 0;
  const ratings = [];
  const perMatch = [];
  const sorted = [...rows].sort((a, b) => (a.completed_at || '') < (b.completed_at || '') ? -1 : 1);
  let firstSeenRating = null;
  for (const m of sorted) {
    const aHas = (m.team_a || []).some((p) => isTarget(p));
    const bHas = (m.team_b || []).some((p) => isTarget(p));
    if (!aHas && !bHas) continue;
    // collect rating snapshots from target's own record
    const rec = [...(m.team_a || []), ...(m.team_b || [])].find((p) => isTarget(p));
    if (rec && typeof rec.rating === 'number') {
      ratings.push(rec.rating);
      if (firstSeenRating === null) firstSeenRating = rec.rating;
    }
    const mode = m.meta?.matchmakingMode || '';
    const comp = !NON_COMP.has(mode);
    const inWin = m.club === CLUB && Date.parse(m.completed_at) >= thirtyDaysAgo;
    const sA = m.team_a_score, sB = m.team_b_score;
    if (typeof sA !== 'number' || typeof sB !== 'number') continue;
    const own = aHas ? sA : sB, opp = aHas ? sB : sA;
    const res = own === opp ? 'T' : own > opp ? 'W' : 'L';
    gA++; if (res === 'W') wA++; else if (res === 'L') lA++; else tA++;
    if (inWin) { gW++; if (res === 'W') wW++; else if (res === 'L') lW++; }
    if (inWin && comp) { gC++; if (res === 'W') wC++; else if (res === 'L') lC++; }
    perMatch.push({ d: m.completed_at?.slice(0, 10), mode: mode || '—', score: `${sA}-${sB}`, res, inWin, comp });
  }
  const rv = [...ratings].sort((a, b) => a - b);
  const mean = rv.length ? (rv.reduce((a, b) => a + b, 0) / rv.length) : null;
  const latest = ratings.length ? ratings[ratings.length - 1] : null;
  const firstM = perMatch[0], lastM = perMatch[perMatch.length - 1];
  log(`\n### ${label} (substring '${substr}') — ${rows.length} rows`);
  log(`  identities: ${ids.size}`);
  for (const [t, n] of [...ids.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) log(`    ${n}x ${t}`);
  log(`  clubs: ${[...clubs.entries()].map(([k, v]) => `${String(k).slice(0, 8)}=${v}`).join('  ')}`);
  log(`  ALL-TIME : ${gA}g ${wA}W-${lA}L${tA ? `-${tA}T` : ''}  WR=${gA ? (100 * wA / (wA + lA)).toFixed(1) : '—'}%`);
  log(`  IN-WINDOW: ${gW}g ${wW}W-${lW}L  (club+30d)`);
  log(`  COMP-WIN  : ${gC}g ${wC}W-${lC}L  (competitive modes only)`);
  log(`  rating snapshots: n=${rv.length} first=${firstSeenRating ?? '—'} min=${rv[0] ?? '—'} med=${rv[Math.floor(rv.length / 2)] ?? '—'} mean=${mean?.toFixed(0) ?? '—'} max=${rv[rv.length - 1] ?? '—'} latest=${latest ?? '—'}`);
  log(`  match span: ${firstM?.d ?? '—'} -> ${lastM?.d ?? '—'}  (${perMatch.length} scored)`);
  // recent 10 matches for flavor
  const recent = perMatch.slice(-10);
  log(`  last10: ${recent.map((x) => `${x.d} ${x.score} ${x.res}${x.comp ? '' : '*'}${x.inWin ? '' : '†'}`).join('  ')}`);
  log('    (*=non-competitive mode, †=outside 30d window)');
}

import { writeFileSync } from 'node:fs';
writeFileSync(new URL('../.tmp-analysis/career-players-out.txt', import.meta.url), OUT.join('\n'));
log('\nwrote .tmp-analysis/career-players-out.txt');
