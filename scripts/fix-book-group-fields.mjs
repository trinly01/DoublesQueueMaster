/**
 * Fix book_* group-tab fields: they were created with special:['group']
 * but Directus requires ['alias','no-data','group'] for group fields to be
 * visible in /fields lists, Data Model, and item forms. Idempotent.
 */
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* .env optional — vars may come from the shell */ }
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) throw new Error('BOOKING_ADMIN_TOKEN is not set — copy .env.example to .env and fill it in');
const BASE = 'https://api.dinkmatch.club';
const GROUPS = {
  book_tenants: ['g_venue', 'g_location', 'g_payments', 'g_rules', 'g_advanced', 'g_billing'],
  book_bookings: ['g_booking', 'g_schedule', 'g_money', 'g_internal'],
  book_payment_proofs: ['g_proof', 'g_details', 'g_review'],
};
const WANT = ['alias', 'no-data', 'group'];

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Authorization': TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(method + ' ' + path + ' -> ' + res.status + ': ' + JSON.stringify(json?.errors?.[0] || json).slice(0, 200));
  return json?.data ?? json;
}

for (const [col, names] of Object.entries(GROUPS)) {
  for (const name of names) {
    try {
      const f = await api('GET', `/fields/${col}/${name}`);
      const cur = f.meta?.special || [];
      const same = cur.length === WANT.length && WANT.every((s) => cur.includes(s));
      if (same) { console.log(`${col}.${name}: already ok`); continue; }
      const meta = { ...(f.meta || {}), special: WANT };
      await api('PATCH', `/fields/${col}/${name}`, { meta });
      console.log(`${col}.${name}: special ${JSON.stringify(cur)} -> ${JSON.stringify(WANT)}`);
    } catch (e) {
      console.log(`${col}.${name}: ERROR ${e.message}`);
    }
  }
}
console.log('done');
