// SCRATCH — is a usable DUPR *rating* reachable in completed_match payloads?
process.loadEnvFile(new URL('../.env', import.meta.url));
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
const CLUB = '22e52ef0-bf60-4bd1-bea8-ef66193edf35';
const BASE = 'https://api.dinkmatch.club';
const filter = { _and: [ { club: { _eq: CLUB } }, { completed_at: { _gte: '$NOW(-30 days)' } } ] };
const url = `/items/completed_match?filter=${encodeURIComponent(JSON.stringify(filter))}&sort=-completed_at&limit=200&fields=${encodeURIComponent('*,players.directus_users_id.*')}`;
const res = await fetch(`${BASE}${url}`, { headers: { Authorization: TOKEN } });
const { data } = await res.json();

const singles = new Map(), doubles = new Map(), duprIds = new Map();
let userRows = 0;
for (const m of data) {
  for (const jp of m.players || []) {
    const u = jp.directus_users_id;
    if (!u) continue;
    userRows++;
    if (u.dupr_singles_rating != null) singles.set(u.dupr_singles_rating, (singles.get(u.dupr_singles_rating) || 0) + 1);
    if (u.dupr_doubles_rating != null) doubles.set(u.dupr_doubles_rating, (doubles.get(u.dupr_doubles_rating) || 0) + 1);
    if (u.dupr_id) duprIds.set(u.dupr_id, (duprIds.get(u.dupr_id) || 0) + 1);
  }
}
console.log(`matches=${data.length} junction user rows=${userRows}`);
console.log(`dupr_singles_rating distinct=${singles.size} top:`, [...singles.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8));
console.log(`dupr_doubles_rating distinct=${doubles.size} top:`, [...doubles.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8));
console.log(`dupr_id distinct=${duprIds.size} sample:`, [...duprIds.keys()].slice(0,8));
// team_a duprId values vs junction dupr_id — same id space?
const teamDupr = new Map();
for (const m of data) for (const p of [...(m.team_a||[]), ...(m.team_b||[])]) if (p.duprId) teamDupr.set(p.duprId, (teamDupr.get(p.duprId)||0)+1);
console.log(`team duprId distinct=${teamDupr.size} sample:`, [...teamDupr.keys()].slice(0,8));
// any numeric dupr-ish rating on participant objects themselves?
const pFields = new Set();
for (const m of data.slice(0,50)) for (const p of [...(m.team_a||[]),...(m.team_b||[])]) for (const k of Object.keys(p)) if (/dupr|rating/i.test(k)) pFields.add(k);
console.log('participant fields matching dupr|rating:', [...pFields]);
// sample one full junction user dupr block
for (const m of data) for (const jp of m.players||[]) { const u=jp.directus_users_id; if (u && (u.dupr_singles_rating!=null||u.dupr_doubles_rating!=null)) { console.log('sample dupr user:', JSON.stringify({dupr_id:u.dupr_id,s:u.dupr_singles_rating,d:u.dupr_doubles_rating})); process.exit(0);} }
console.log('no junction user with non-null dupr rating found in sample');
