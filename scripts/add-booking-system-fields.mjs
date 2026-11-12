/**
 * Add Directus system fields (date_created/date_updated/user_created/
 * user_updated) to all book_* collections — collections created via API
 * with schema:{} lack them, which broke the sweeper (b.date_created).
 * Idempotent. Usage: node scripts/add-booking-system-fields.mjs
 */
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* .env optional — vars may come from the shell */ }
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) throw new Error('BOOKING_ADMIN_TOKEN is not set — copy .env.example to .env and fill it in');
const BASE = 'https://api.dinkmatch.club';
const COLS = ['book_sport_types','book_tenants','book_tenant_users','book_courts',
  'book_opening_hours','book_closures','book_bookings','book_booking_slots',
  'book_payments','book_payment_proofs'];
const FIELDS = [
  ['date_created','timestamp',['date-created']],
  ['date_updated','timestamp',['date-updated']],
  ['user_created','uuid',['user-created']],
  ['user_updated','uuid',['user-updated']],
];
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method,
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json?.errors?.[0]||json).slice(0,200)}`);
  return json?.data ?? json;
}
for (const c of COLS) {
  const existing = new Set((await api('GET', `/fields/${c}`)).map((f) => f.field));
  for (const [field, type, special] of FIELDS) {
    if (existing.has(field)) continue;
    const schema = { is_nullable: true };
    if (field.startsWith('date')) schema.default_value = 'now()';
    try {
      await api('POST', `/fields/${c}`, { field, type,
        meta: { special, hidden: true, width: 'half' }, schema });
      console.log(`+ ${c}.${field}`);
    } catch (e) { console.log(`! ${c}.${field}: ${e.message}`); }
  }
}
console.log('done');
