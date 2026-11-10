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
// availability read: own-booking slots OR any slot under an active venue
const SLOTS_READ = { _or: [OWN_VIA_BOOKING, { booking: { tenant: { status: { _eq: 'active' } } } }] };

const BOOKING_CUSTOMER_FIELDS = ['id', 'ref', 'tenant', 'customer', 'customer_name',
  'customer_phone', 'customer_email', 'status', 'payment_status', 'subtotal', 'total',
  'notes', 'source', 'checked_in_at', 'cancelled_at', 'cancel_reason',
  'slots', 'payments', 'proofs']; // no internal_notes/platform_fee

// [collection, action, permissions, fields, validation, presets]
const PERMS = [
  // --- public browsing (active venues only) ---
  ['book_tenants', 'read', { status: { _eq: 'active' } },
    ['id', 'name', 'slug', 'status', 'logo', 'description', 'address', 'latitude', 'longitude',
     'contact_phone', 'contact_email', 'gcash_name', 'gcash_number', 'bank_details',
     'timezone', 'currency', 'slot_minutes', 'min_duration', 'max_duration',
     'buffer_minutes', 'cancel_cutoff_hours', 'auto_confirm_payments',
     'allow_non_contiguous_slots']],
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
  // cancel only unpaid/pending: paid or verification-in-flight bookings need venue handling
  ['book_bookings', 'update',
    { _and: [OWN_BOOKING, { status: { _eq: 'pending_payment' } },
             { payment_status: { _eq: 'unpaid' } }] },
    ['status', 'cancel_reason'],
    { status: { _eq: 'cancelled' } },
    { status: 'cancelled' }],
  // --- slots: customers create held slots; price/duration/tenant are flow-owned ---
  ['book_booking_slots', 'read', SLOTS_READ,
    ['id', 'booking', 'court', 'date', 'start_time', 'end_time', 'duration_minutes',
     'price', 'status', 'held_until']],
  ['book_booking_slots', 'create', {},
    ['booking', 'court', 'date', 'start_time', 'end_time'],
    { status: { _eq: 'held' } },
    { status: 'held' }],
  // --- payments: read own + create pending GCash payment on own booking ---
  ['book_payments', 'read', OWN_VIA_BOOKING,
    ['id', 'booking', 'tenant', 'method', 'amount', 'status', 'reference',
     'paid_at', 'receipt_file']],
  // deep-filter validation fails closed on create — ownership enforced by child_record_guard flow
  ['book_payments', 'create', OWN_VIA_BOOKING,
    ['booking', 'method', 'amount', 'reference', 'receipt_file'],
    { status: { _eq: 'pending' } },
    { status: 'pending' }],
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
  const existing = await api('GET', '/permissions?limit=-1&fields=id,collection,action,policy,fields,permissions,validation,presets');
  const have = new Map(existing.filter((p) => p.policy === POLICY).map((p) => [`${p.collection}:${p.action}`, p]));
  const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  let created = 0, updated = 0, skipped = 0;
  for (const [collection, action, permissions, fields, validation, presets] of PERMS) {
    const key = `${collection}:${action}`;
    const cur = have.get(key);
    if (cur) {
      const patch = {};
      if (!eq([...(cur.fields || [])].sort(), [...(fields || [])].sort())) patch.fields = fields;
      if (!eq(cur.permissions, permissions)) patch.permissions = permissions;
      if (!eq(cur.validation, validation)) patch.validation = validation;
      if (!eq(cur.presets, presets)) patch.presets = presets;
      if (!Object.keys(patch).length) { skipped++; console.log(`= ${key}`); continue; }
      await api('PATCH', `/permissions/${cur.id}`, patch);
      updated++; console.log(`~ ${key} updated (${Object.keys(patch).join(',')})`);
      continue;
    }
    try {
      await api('POST', '/permissions', {
        policy: POLICY, collection, action,
        permissions, fields, validation: validation || null, presets: presets || null,
      });
      created++; console.log(`+ ${key}`);
    } catch (e) { console.log(`! ${key}: ${e.message}`); }
  }
  console.log(`done — ${created} created, ${updated} updated, ${skipped} unchanged`);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
