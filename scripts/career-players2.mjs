// SCRATCH — all-time pulls for Cyyy (quirimitcyrielle) + Jaira (jaijaipq431).
process.loadEnvFile(new URL('../.env', import.meta.url));
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
const CLUB = '22e52ef0-bf60-4bd1-bea8-ef66193edf35';
const BASE = 'https://api.dinkmatch.club';
const OUT = [];
const log = (...a) => { const s = a.join(' '); OUT.push(s); console.log(s); };
const FIELDS = encodeURIComponent('*,players.directus_users_id.*');
const NON_COMP = new Set(['fair_balance', 'variety_first']);
const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;

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

for (const [label, substr] of [['cyyy', 'cyrielle'], ['jaira', 'jaijaipq431'], ['shai', 'shaira.agaceta']]) {
  const f = { players: { directus_users_id: { username: { _contains: substr } } } };
  let rows = [];
  try {
    const j = await api(`/items/completed_match?filter=${encodeURIComponent(JSON.stringify(f))}&sort=-completed_at&limit=1000&fields=${FIELDS}`);
    rows = j.data || [];
  } catch (e) { log(`${label}: fetch failed ${e.message}`); continue; }
  const isTarget = (p) => (p.username || '').toLowerCase().includes(substr);
  const ids = new Map(); const clubs = new Map();
  for (const m of rows) {
    const c = typeof m.club === 'string' ? m.club : m.club?.id;
    clubs.set(c, (clubs.get(c) || 0) + 1);
    for (const p of [...(m.team_a || []), ...(m.team_b || [])]) {
      if (!isTarget(p)) continue;
      const tup = `${p.userId}|${p.username}|${p.firstName} ${p.lastName}`;
      ids.set(tup, (ids.get(tup) || 0) + 1);
    }
  }
  let gA = 0, wA = 0, lA = 0, tA = 0, gW = 0, wW = 0, lW = 0, gC = 0, wC = 0, lC = 0;
  const ratings = [];
  const sorted = [...rows].sort((a, b) => (a.completed_at || '') < (b.completed_at || '') ? -1 : 1);
  let firstRating = null;
  for (const m of sorted) {
    const aHas = (m.team_a || []).some((p) => isTarget(p));
    const bHas = (m.team_b || []).some((p) => isTarget(p));
    if (!aHas && !bHas) continue;
    const rec = [...(m.team_a || []), ...(m.team_b || [])].find((p) => isTarget(p));
    if (rec && typeof rec.rating === 'number') { ratings.push(rec.rating); if (firstRating === null) firstRating = rec.rating; }
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
  }
  const rv = [...ratings].sort((a, b) => a - b);
  const mean = rv.length ? (rv.reduce((a, b) => a + b, 0) / rv.length) : null;
  log(`\n### ${label} ('${substr}') — ${rows.length} rows`);
  log(`  identities: ${ids.size}`);
  for (const [t, n] of [...ids.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) log(`    ${n}x ${t}`);
  log(`  clubs: ${[...clubs.entries()].map(([k, v]) => `${String(k).slice(0, 8)}=${v}`).join('  ')}`);
  log(`  ALL-TIME : ${gA}g ${wA}W-${lA}L${tA ? `-${tA}T` : ''}  WR=${gA ? (100 * wA / (wA + lA)).toFixed(1) : '—'}%`);
  log(`  IN-WINDOW: ${gW}g ${wW}W-${lW}L`);
  log(`  COMP-WIN  : ${gC}g ${wC}W-${lC}L`);
  log(`  rating: n=${rv.length} first=${firstRating ?? '—'} min=${rv[0] ?? '—'} med=${rv[Math.floor(rv.length / 2)] ?? '—'} mean=${mean?.toFixed(0) ?? '—'} max=${rv[rv.length - 1] ?? '—'} latest=${ratings[ratings.length - 1] ?? '—'}`);
  log(`  span: ${sorted[0]?.completed_at?.slice(0, 10)} -> ${sorted[sorted.length - 1]?.completed_at?.slice(0, 10)}`);
}
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('../.tmp-analysis/career-players2-out.txt', import.meta.url), OUT.join('\n'));
log('\nwrote .tmp-analysis/career-players2-out.txt');
