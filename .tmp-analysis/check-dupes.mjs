try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* .env optional */ }
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) throw new Error('BOOKING_ADMIN_TOKEN is not set — copy .env.example to .env and fill it in');
const BASE = 'https://api.dinkmatch.club/items';
const COLLECTIONS = {
  admins: 'club_directus_users',
  players: 'club_directus_users_1',
  moderators: 'club_directus_users_2',
};
const SIKLAB = '22e52ef0-bf60-4bd1-bea8-ef66193edf35';

async function fetchAll(collection) {
  const rows = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `${BASE}/${collection}?limit=500&page=${page}&fields=id,club_id,directus_users_id`,
      { headers: { Authorization: TOKEN } },
    );
    const j = await res.json();
    const data = j.data || [];
    rows.push(...data);
    if (data.length < 500) break;
  }
  return rows;
}

for (const [rel, col] of Object.entries(COLLECTIONS)) {
  const rows = await fetchAll(col);
  const valid = rows.filter((r) => r.club_id && r.directus_users_id);
  const groups = {};
  for (const r of valid) {
    const k = `${r.club_id}|${r.directus_users_id}`;
    (groups[k] = groups[k] || []).push(r.id);
  }
  const dupes = Object.entries(groups).filter(([, ids]) => ids.length > 1);
  console.log(`${rel}: ${rows.length} rows, ${valid.length} valid, ${dupes.length} dup groups`);
  for (const [k, ids] of dupes.slice(0, 30)) {
    const [club, uid] = k.split('|');
    console.log(`  ${club === SIKLAB ? 'SIKLAB' : club.slice(0,8)} user=${uid} junctions=[${ids}]`);
  }
}
