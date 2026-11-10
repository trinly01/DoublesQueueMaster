/**
 * Customer-facing book_* permissions on the Player policy.
 * Customers = app users (Player role). book_tenant role inherits via
 * parent→Player so tenant staff keep app access too.
 * Idempotent.
 */
const TOKEN = process.env.BOOKING_ADMIN_TOKEN || 'Bearer ***REMOVED***';
const BASE = 'https://api.dinkmatch.club';
const POLICY = 'e42bc857-e635-4813-8df4-cce3477bb559'; // Player

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
const OWN_BOOKING = { customer: { _eq: '$CURRENT_USER.id' } };
const OWN_VIA_BOOKING = { booking: { customer: { _eq: '$CURRENT_USER.id' } } };

const BOOKING_CUSTOMER_FIELDS = ['id', 'ref', 'tenant', 'customer', 'customer_name',
  'customer_phone', 'customer_email', 'status', 'payment_status', 'subtotal', 'total',
  'notes', 'source', 'checked_in_at', 'cancelled_at', 'cancel_reason',
  'slots', 'payments', 'proofs']; // no internal_notes/platform_fee

// [collection, action, permissions, fields, validation, presets]
const PERMS = [
  // --- public browsing (active venues only) ---
  ['book_tenants', 'read', { status: { _eq: 'active' } },
    ['id', 'name', 'slug', 'logo', 'description', 'address', 'latitude', 'longitude',
     'contact_phone', 'contact_email', 'gcash_name', 'gcash_number', 'bank_details',
     'timezone', 'currency', 'slot_minutes', 'min_duration', 'max_duration',
     'buffer_minutes', 'cancel_cutoff_hours', 'auto_confirm_payments']],
  ['book_courts', 'read', { status: { _eq: 'active' }, ...ACTIVE_VENUE },
    ['id', 'tenant', 'name', 'sport', 'surface', 'description', 'photo',
     'price_per_hour', 'peak_multiplier', 'status', 'sort']],
  ['book_sport_types', 'read', {}, ['id', 'name', 'icon', 'sort']],
  ['book_opening_hours', 'read', ACTIVE_VENUE,
    ['id', 'tenant', 'court', 'day_of_week', 'open_time', 'close_time', 'closed']],
  ['book_closures', 'read', ACTIVE_VENUE,
    ['id', 'tenant', 'court', 'date', 'date_start', 'date_end', 'all_day',
     'start_time', 'end_time', 'reason']],
  // --- bookings: own only; create locked to pending_payment/unpaid/app ---
  ['book_bookings', 'read', OWN_BOOKING, BOOKING_CUSTOMER_FIELDS],
  ['book_bookings', 'create', {},
    ['tenant', 'customer_name', 'customer_phone', 'customer_email', 'notes', 'slots'],
    { status: { _eq: 'pending_payment' }, payment_status: { _eq: 'unpaid' }, source: { _eq: 'app' } },
    { status: 'pending_payment', payment_status: 'unpaid', source: 'app', customer: '$CURRENT_USER.id' }],
  // --- slots: customers create held slots; price/duration/tenant are flow-owned ---
  ['book_booking_slots', 'read', OWN_VIA_BOOKING,
    ['id', 'booking', 'court', 'date', 'start_time', 'end_time', 'duration_minutes',
     'price', 'status', 'held_until']],
  ['book_booking_slots', 'create', {},
    ['booking', 'court', 'date', 'start_time', 'end_time'],
    { status: { _eq: 'held' } },
    { status: 'held' }],
  // --- payments: read own (status display); never customer-created ---
  ['book_payments', 'read', OWN_VIA_BOOKING,
    ['id', 'booking', 'tenant', 'method', 'amount', 'status', 'reference',
     'paid_at', 'receipt_file']],
  // --- proofs: upload own; approve/reject is tenant-only ---
  ['book_payment_proofs', 'read', OWN_VIA_BOOKING,
    ['id', 'booking', 'payment', 'file', 'sender_name', 'reference_no', 'sent_at',
     'status', 'rejection_reason', 'reviewed_at']],
  ['book_payment_proofs', 'create', {},
    ['booking', 'payment', 'file', 'sender_name', 'reference_no', 'sent_at'],
    { status: { _eq: 'pending' } },
    { status: 'pending' }],
];

async function main() {
  const existing = await api('GET', '/permissions?limit=-1&fields=id,collection,action,policy');
  const have = new Set(existing.filter((p) => p.policy === POLICY).map((p) => `${p.collection}:${p.action}`));
  let created = 0, skipped = 0;
  for (const [collection, action, permissions, fields, validation, presets] of PERMS) {
    const key = `${collection}:${action}`;
    if (have.has(key)) { skipped++; console.log(`= ${key}`); continue; }
    try {
      await api('POST', '/permissions', {
        policy: POLICY, collection, action,
        permissions, fields, validation: validation || null, presets: presets || null,
      });
      created++; console.log(`+ ${key}`);
    } catch (e) { console.log(`! ${key}: ${e.message}`); }
  }
  console.log(`done — ${created} created, ${skipped} existed`);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
