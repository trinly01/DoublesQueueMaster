/**
 * Public (unauthenticated) read permissions for /book browsing.
 * Guests can discover venues, courts, hours, closures and slot
 * availability — but cannot create bookings, payments or proofs.
 * Item filters keep suspended/pending venues and inactive courts hidden.
 * Idempotent.
 */
const TOKEN = process.env.BOOKING_ADMIN_TOKEN || 'Bearer ***REMOVED***';
const BASE = 'https://api.dinkmatch.club';
const POLICY = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17'; // $t:public_label (Public)

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

const ACTIVE_VENUE = { tenant: { status: { _eq: 'active' } } };

// [collection, permissions(item filter), fields]
const PERMS = [
  ['book_tenants', { status: { _eq: 'active' } },
    ['id', 'name', 'slug', 'status', 'logo', 'description', 'address', 'latitude', 'longitude',
     'contact_phone', 'contact_email', 'gcash_name', 'gcash_number', 'bank_details',
     'timezone', 'currency', 'slot_minutes', 'min_duration', 'max_duration',
     'buffer_minutes', 'cancel_cutoff_hours', 'auto_confirm_payments',
     'allow_non_contiguous_slots']],
  ['book_courts', { status: { _eq: 'active' }, ...ACTIVE_VENUE },
    ['id', 'tenant', 'name', 'sport', 'surface', 'description', 'photo',
     'price_per_hour', 'peak_multiplier', 'status', 'sort']],
  ['book_sport_types', {}, ['id', 'name', 'icon', 'sort']],
  ['book_opening_hours', ACTIVE_VENUE,
    ['id', 'tenant', 'court', 'day_of_week', 'open_time', 'close_time', 'closed']],
  ['book_closures', ACTIVE_VENUE,
    ['id', 'tenant', 'court', 'date', 'date_start', 'date_end', 'all_day',
     'start_time', 'end_time', 'reason']],
  // slot grid: no PII on slots — booking id is opaque, bookings stay own-only
  ['book_booking_slots', {},
    ['id', 'booking', 'court', 'date', 'start_time', 'end_time',
     'duration_minutes', 'price', 'status', 'held_until']],
];

async function main() {
  const existing = await api('GET', '/permissions?limit=-1&fields=id,collection,action,policy,fields');
  const have = new Map(existing.filter((p) => p.policy === POLICY).map((p) => [`${p.collection}:${p.action}`, p]));
  let created = 0, updated = 0, skipped = 0;
  for (const [collection, permissions, fields] of PERMS) {
    const key = `${collection}:read`;
    const cur = have.get(key);
    if (cur) {
      // upsert fields so whitelist stays in sync (filters on non-readable fields 403)
      const same = JSON.stringify([...(cur.fields || [])].sort()) === JSON.stringify([...fields].sort());
      if (same) { skipped++; console.log(`= ${key}`); continue; }
      await api('PATCH', `/permissions/${cur.id}`, { fields });
      updated++; console.log(`~ ${key} fields updated`);
      continue;
    }
    try {
      await api('POST', '/permissions', {
        policy: POLICY, collection, action: 'read', permissions, fields,
      });
      created++; console.log(`+ ${key}`);
    } catch (e) { console.log(`! ${key}: ${e.message}`); }
  }
  console.log(`done — ${created} created, ${updated} updated, ${skipped} unchanged`);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
