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
// Create-time scoping: `permissions` item-filters do NOT apply to creates —
// validation is the only payload check. book_tenant_ids = membership mirror
// maintained by tenant_user_sync (same pattern as the directus_users self-update perm).
// Active-venue model: staff create records only at their CURRENT venue
// (book_tenant). Preset fills tenant when omitted; _eq rejects forging
// another member venue. Deep-filter validation (booking.tenant...) FAILS
// CLOSED on create — child-record ownership is enforced by the
// child_record_guard flow instead (deletes rogue rows).
const VACTIVE = { tenant: { _eq: '$CURRENT_USER.book_tenant' } };
const PRESET_TENANT = { tenant: '$CURRENT_USER.book_tenant' };

// field lists (exclude Zyberlab-only / computed where relevant)
const TENANT_EDITABLE_TENANT = ['id', 'name', 'slug', 'logo', 'description', 'address',
  'latitude', 'longitude', 'contact_phone', 'contact_email', 'gcash_name', 'gcash_number',
  'bank_details', 'timezone', 'currency', 'slot_minutes', 'min_duration', 'max_duration',
  'buffer_minutes', 'cancel_cutoff_hours', 'auto_confirm_payments',
  'allow_non_contiguous_slots']; // no status/settings
const BOOKING_TENANT_UPDATE = ['customer_name', 'customer_phone', 'customer_email', 'notes',
  'internal_notes', 'status', 'payment_status', 'source', 'checked_in_at', 'cancelled_at',
  'cancel_reason']; // no ref/subtotal/platform_fee/total/tenant
const PAYMENT_TENANT_UPDATE = ['method', 'amount', 'status', 'reference', 'paid_at', 'receipt_file'];
const PROOF_TENANT_UPDATE = ['status', 'reviewed_by', 'reviewed_at', 'rejection_reason'];
// book_tenant = active venue, book_tenant_ids = membership mirror (venue switcher)
const USER_SAFE_FIELDS = ['id', 'first_name', 'last_name', 'avatar',
  'book_tenant', 'book_tenant_ids'];
const FILE_FIELDS = ['id', 'title', 'filename_download', 'filename_disk', 'type',
  'filesize', 'width', 'height', 'timestamp_created', 'uploaded_by'];

// [collection, action, permissions(filter), fields, validation, presets]
const PERMS = [
  // --- tenants: own record only, no status/settings ---
  ['book_tenants', 'read', BT, ['*']],
  ['book_tenants', 'update', BT, TENANT_EDITABLE_TENANT],
  // --- courts ---
  ['book_courts', 'read', T, ['*']],
  ['book_courts', 'create', T, ['*'], VACTIVE, PRESET_TENANT],
  ['book_courts', 'update', T, ['name', 'sport', 'surface', 'description', 'photos', 'photo',
    'price_per_hour', 'peak_multiplier', 'status', 'sort']],
  // --- bookings: tenant creates = walk-ins only, auto confirmed+paid ---
  ['book_bookings', 'read', T, ['*']],
  ['book_bookings', 'create', T, ['*'], VACTIVE,
    { source: 'walk_in', status: 'confirmed', payment_status: 'paid',
      tenant: '$CURRENT_USER.book_tenant' }],
  ['book_bookings', 'update', T, BOOKING_TENANT_UPDATE],
  // --- slots (via booking) ---
  ['book_booking_slots', 'read', B, ['*']],
  ['book_booking_slots', 'create', B, ['*'], null],
  ['book_booking_slots', 'update', B, ['court', 'date', 'start_time', 'end_time',
    'duration_minutes', 'price', 'status', 'held_until']],
  // --- payments (via booking) ---
  ['book_payments', 'read', B, ['*']],
  ['book_payments', 'create', B, ['*'], null],
  ['book_payments', 'update', B, PAYMENT_TENANT_UPDATE],
  // --- proofs: read + approve/reject ONLY ---
  ['book_payment_proofs', 'read', B, ['*']],
  ['book_payment_proofs', 'update', B, PROOF_TENANT_UPDATE],
  // --- config tables ---
  ['book_opening_hours', 'read', T, ['*']],
  ['book_opening_hours', 'create', T, ['*'], VACTIVE, PRESET_TENANT],
  ['book_opening_hours', 'update', T, ['*']],
  ['book_opening_hours', 'delete', T, ['*']],
  ['book_closures', 'read', T, ['*']],
  ['book_closures', 'create', T, ['*'], VACTIVE, PRESET_TENANT],
  ['book_closures', 'update', T, ['*']],
  ['book_closures', 'delete', T, ['*']],
  ['book_tenant_users', 'read', T, ['*']],
  ['book_tenant_users', 'create', T, ['*'], VACTIVE, PRESET_TENANT],
  ['book_tenant_users', 'update', T, ['*']],
  ['book_tenant_users', 'delete', T, ['*']],
  // --- catalog + supporting ---
  ['book_sport_types', 'read', {}, ['*']],
  ['directus_users', 'read', {}, USER_SAFE_FIELDS],
  ['directus_files', 'read', {}, FILE_FIELDS],
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
      // upsert all perm aspects — fields whitelist AND filters/validation/presets
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
      created++;
      console.log(`+ ${key}`);
    } catch (e) {
      console.log(`! ${key}: ${e.message}`);
    }
  }
  console.log(`done — ${created} created, ${updated} updated, ${skipped} unchanged`);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
