/**
 * Create book_tenant policy permissions — tenant isolation via item filters.
 * Idempotent: skips existing policy+collection+action rows.
 * Usage: node scripts/setup-booking-permissions.mjs
 */
const TOKEN = process.env.BOOKING_ADMIN_TOKEN || 'Bearer ***REMOVED***';
const BASE = 'https://api.dinkmatch.club';
const POLICY = '6dae3bf8-8f04-4223-b011-c64c5c1c2da1'; // book_tenant

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

// Item-filter building blocks (verified working on this instance)
const T = { tenant: { tenant_users: { user: { _eq: '$CURRENT_USER.id' } } } };          // tenant-FK collections
const B = { booking: { tenant: { tenant_users: { user: { _eq: '$CURRENT_USER.id' } } } } }; // via booking
const BT = { tenant_users: { user: { _eq: '$CURRENT_USER.id' } } };                      // book_tenants self

// field lists (exclude Zyberlab-only / computed where relevant)
const TENANT_EDITABLE_TENANT = ['id', 'name', 'slug', 'logo', 'description', 'address',
  'latitude', 'longitude', 'contact_phone', 'contact_email', 'gcash_name', 'gcash_number',
  'bank_details', 'timezone', 'currency', 'slot_minutes', 'min_duration', 'max_duration',
  'buffer_minutes', 'cancel_cutoff_hours', 'auto_confirm_payments']; // no status/settings
const BOOKING_TENANT_UPDATE = ['customer_name', 'customer_phone', 'customer_email', 'notes',
  'internal_notes', 'status', 'payment_status', 'source', 'checked_in_at', 'cancelled_at',
  'cancel_reason']; // no ref/subtotal/platform_fee/total/tenant
const PAYMENT_TENANT_UPDATE = ['method', 'amount', 'status', 'reference', 'paid_at', 'receipt_file'];
const PROOF_TENANT_UPDATE = ['status', 'reviewed_by', 'reviewed_at', 'rejection_reason'];
const USER_SAFE_FIELDS = ['id', 'first_name', 'last_name', 'avatar'];
const FILE_FIELDS = ['id', 'title', 'filename_download', 'filename_disk', 'type',
  'filesize', 'width', 'height', 'timestamp_created', 'uploaded_by'];

// [collection, action, permissions(filter), fields, validation, presets]
const PERMS = [
  // --- tenants: own record only, no status/settings ---
  ['book_tenants', 'read', BT, ['*']],
  ['book_tenants', 'update', BT, TENANT_EDITABLE_TENANT],
  // --- courts ---
  ['book_courts', 'read', T, ['*']],
  ['book_courts', 'create', T, ['*']],
  ['book_courts', 'update', T, ['name', 'sport', 'surface', 'description', 'photos', 'photo',
    'price_per_hour', 'peak_multiplier', 'status', 'sort']],
  // --- bookings: tenant creates = walk-ins only, auto confirmed+paid ---
  ['book_bookings', 'read', T, ['*']],
  ['book_bookings', 'create', T, ['*'], null,
    { source: 'walk_in', status: 'confirmed', payment_status: 'paid' }],
  ['book_bookings', 'update', T, BOOKING_TENANT_UPDATE],
  // --- slots (via booking) ---
  ['book_booking_slots', 'read', B, ['*']],
  ['book_booking_slots', 'create', B, ['*']],
  ['book_booking_slots', 'update', B, ['court', 'date', 'start_time', 'end_time',
    'duration_minutes', 'price', 'status', 'held_until']],
  // --- payments (via booking) ---
  ['book_payments', 'read', B, ['*']],
  ['book_payments', 'create', B, ['*']],
  ['book_payments', 'update', B, PAYMENT_TENANT_UPDATE],
  // --- proofs: read + approve/reject ONLY ---
  ['book_payment_proofs', 'read', B, ['*']],
  ['book_payment_proofs', 'update', B, PROOF_TENANT_UPDATE],
  // --- config tables ---
  ['book_opening_hours', 'read', T, ['*']],
  ['book_opening_hours', 'create', T, ['*']],
  ['book_opening_hours', 'update', T, ['*']],
  ['book_opening_hours', 'delete', T, ['*']],
  ['book_closures', 'read', T, ['*']],
  ['book_closures', 'create', T, ['*']],
  ['book_closures', 'update', T, ['*']],
  ['book_closures', 'delete', T, ['*']],
  ['book_tenant_users', 'read', T, ['*']],
  ['book_tenant_users', 'create', T, ['*']],
  ['book_tenant_users', 'update', T, ['*']],
  ['book_tenant_users', 'delete', T, ['*']],
  // --- catalog + supporting ---
  ['book_sport_types', 'read', {}, ['*']],
  ['directus_users', 'read', {}, USER_SAFE_FIELDS],
  ['directus_files', 'read', {}, FILE_FIELDS],
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
      created++;
      console.log(`+ ${key}`);
    } catch (e) {
      console.log(`! ${key}: ${e.message}`);
    }
  }
  console.log(`done — ${created} created, ${skipped} existed`);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
