try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* .env optional */ }
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) throw new Error('BOOKING_ADMIN_TOKEN is not set — copy .env.example to .env and fill it in');
const BASE = 'https://api.dinkmatch.club/items';
const COLLECTIONS = {
  club_directus_users: 'admins',
  club_directus_users_1: 'players',
  club_directus_users_2: 'moderators',
};

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

const plan = {};
for (const [col, rel] of Object.entries(COLLECTIONS)) {
  const rows = await fetchAll(col);
  const valid = rows.filter((r) => r.club_id && r.directus_users_id);
  const groups = {};
  for (const r of valid) {
    const k = `${r.club_id}|${r.directus_users_id}`;
    (groups[k] = groups[k] || []).push(r.id);
  }
  const dupes = Object.entries(groups)
    .filter(([, ids]) => ids.length > 1)
    .map(([k, ids]) => {
      const [club_id, directus_users_id] = k.split('|');
      const sorted = [...ids].sort((a, b) => a - b);
      return { club_id, directus_users_id, keep: sorted[0], delete: sorted.slice(1) };
    });
  plan[rel] = { collection: col, totalRows: rows.length, validRows: valid.length, dupGroups: dupes.length, dupes };
  console.log(`${rel} (${col}): ${rows.length} rows, ${valid.length} valid, ${dupes.length} dup groups, ${dupes.reduce((s, d) => s + d.delete.length, 0)} rows to delete`);
}
const fs = await import('fs');
fs.writeFileSync('.tmp-analysis/dedupe-plan.json', JSON.stringify(plan, null, 2));
