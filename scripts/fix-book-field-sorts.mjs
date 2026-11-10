/**
 * Reassign meta.sort for all book_* fields - the schema script's sortCounter
 * was undefined at SPECS build time, so every field landed with sort=null,
 * which leaves Studio item forms empty/jumbled. Idempotent.
 * Usage: node scripts/fix-book-field-sorts.mjs
 */
const TOKEN = process.env.BOOKING_ADMIN_TOKEN || 'Bearer ***REMOVED***';
const BASE = 'https://api.dinkmatch.club';
const COLS = [
  'book_sport_types', 'book_tenants', 'book_tenant_users', 'book_courts',
  'book_opening_hours', 'book_closures', 'book_bookings',
  'book_booking_slots', 'book_payments', 'book_payment_proofs',
];

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method: method,
    headers: { 'Authorization': TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json && json.errors && json.errors[0] ? json.errors[0].message : JSON.stringify(json);
    throw new Error(method + ' ' + path + ' -> ' + res.status + ': ' + String(msg).slice(0, 200));
  }
  return json && json.data !== undefined ? json.data : json;
}

for (const c of COLS) {
  const fields = await api('GET', '/fields/' + c + '?limit=-1');
  const isGroup = (f) => f.meta && f.meta.special && f.meta.special.indexOf('group') >= 0;
  const rank = (f) => (f.field === 'id' ? 0 : isGroup(f) ? 1 : 2);
  const sorted = fields.slice().sort((a, b) => {
    const d = rank(a) - rank(b);
    return d !== 0 ? d : String(a.field).localeCompare(String(b.field));
  });
  let n = 0;
  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i];
    const want = i + 1;
    if (f.meta && f.meta.sort === want) continue;
    const meta = Object.assign({}, f.meta || {}, { sort: want });
    await api('PATCH', '/fields/' + c + '/' + f.field, { meta: meta });
    n++;
  }
  console.log(c + ': ' + n + '/' + fields.length + ' sorts patched');
}
console.log('done');
