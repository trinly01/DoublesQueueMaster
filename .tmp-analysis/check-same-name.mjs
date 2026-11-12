try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* .env optional */ }
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) throw new Error('BOOKING_ADMIN_TOKEN is not set — copy .env.example to .env and fill it in');
const BASE = 'https://api.dinkmatch.club/items';
const SIKLAB = '22e52ef0-bf60-4bd1-bea8-ef66193edf35';

// Fetch all player junctions for Siklab with user identity fields
const rows = [];
for (let page = 1; page <= 10; page++) {
  const res = await fetch(
    `${BASE}/club_directus_users_1?limit=500&page=${page}&filter[club_id][_eq]=${SIKLAB}&fields=id,directus_users_id.id,directus_users_id.username,directus_users_id.first_name,directus_users_id.last_name`,
    { headers: { Authorization: TOKEN } },
  );
  const j = await res.json();
  rows.push(...(j.data || []));
  if ((j.data || []).length < 500) break;
}
console.log(`junction rows: ${rows.length}`);

// Group by display name and by username
const byName = {}, byUser = {};
for (const r of rows) {
  const u = r.directus_users_id;
  if (!u?.id) continue;
  const name = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase() || (u.username || '').toLowerCase();
  (byName[name] = byName[name] || []).push({ id: u.id, username: u.username, junction: r.id });
  byUser[u.id] = (byUser[u.id] || 0) + 1;
}
const nameDupes = Object.entries(byName).filter(([, v]) => v.length > 1);
console.log(`\nSame display name, different accounts: ${nameDupes.length}`);
for (const [name, list] of nameDupes) {
  console.log(`  "${name}": ${list.map(x => `${x.username}(${x.id.slice(0,8)})`).join(', ')}`);
}
const userDupes = Object.entries(byUser).filter(([, c]) => c > 1);
console.log(`\nSame userId multiple junctions: ${userDupes.length}`);
