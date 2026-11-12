/**
 * Patch book_tenant create/update permissions: add tenant-ownership
 * validation ($CURRENT_USER.book_tenant) + auto-fill preset.
 * Idempotent — PATCHes by policy+collection+action lookup.
 */
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* .env optional — vars may come from the shell */ }
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) throw new Error('BOOKING_ADMIN_TOKEN is not set — copy .env.example to .env and fill it in');
const BASE = 'https://api.dinkmatch.club';
const POLICY = '6dae3bf8-8f04-4223-b011-c64c5c1c2da1';

const OWN = { tenant: { _eq: '$CURRENT_USER.book_tenant' } };
const STAMP = { tenant: '$CURRENT_USER.book_tenant' };

// [collection, action, addValidation, addPresets]
const PATCHES = [
  ['book_courts', 'create', OWN, STAMP],
  ['book_courts', 'update', OWN, null],
  ['book_bookings', 'create', OWN, { ...STAMP, source: 'walk_in', status: 'confirmed', payment_status: 'paid' }],
  ['book_bookings', 'update', OWN, null],
  ['book_booking_slots', 'create', OWN, STAMP],
  ['book_booking_slots', 'update', OWN, null],
  ['book_payments', 'create', OWN, STAMP],
  ['book_payments', 'update', OWN, null],
  ['book_payment_proofs', 'update', OWN, null],
  ['book_opening_hours', 'create', OWN, STAMP],
  ['book_opening_hours', 'update', OWN, null],
  ['book_closures', 'create', OWN, STAMP],
  ['book_closures', 'update', OWN, null],
  ['book_tenant_users', 'create', OWN, STAMP],
  ['book_tenant_users', 'update', OWN, null],
];

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json?.errors?.[0] || json).slice(0, 250)}`);
  return json?.data ?? json;
}

async function main() {
  const perms = await api('GET', '/permissions?limit=-1&fields=id,collection,action,policy,validation,presets');
  const mine = perms.filter((p) => p.policy === POLICY);
  for (const [collection, action, validation, presets] of PATCHES) {
    const p = mine.find((x) => x.collection === collection && x.action === action);
    if (!p) { console.log(`! ${collection}:${action} — permission missing`); continue; }
    const body = {};
    if (validation) body.validation = validation;
    if (presets) body.presets = { ...(p.presets || {}), ...presets };
    try {
      await api('PATCH', `/permissions/${p.id}`, body);
      console.log(`+ ${collection}:${action}`);
    } catch (e) { console.log(`! ${collection}:${action}: ${e.message}`); }
  }
  console.log('done');
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
