/**
 * Create book_* collections + fields + relations for the Zyberlab booking
 * system. Idempotent — safe to re-run; skips what already exists.
 *
 * Usage: node scripts/setup-booking-schema.mjs
 * Token is read from BOOKING_ADMIN_TOKEN env or the constant below
 * (same admin token used by .tmp-analysis scripts — rotate if exposed).
 */
const TOKEN = process.env.BOOKING_ADMIN_TOKEN || 'Bearer ***REMOVED***';
const BASE = 'https://api.dinkmatch.club';

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.errors?.[0]?.message || text.slice(0, 300);
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return json?.data ?? json;
}

// ---------- field spec helpers ----------
// NOTE: SPECS is built at module load, so the counter must start here —
// resetting inside the runner loop is too late (meta.sort is captured eagerly).
let sortCounter = 1;
function F(field, type, meta = {}, schema = {}) {
  return {
    field, type,
    meta: {
      interface: 'input',
      width: 'full',
      sort: sortCounter++,
      ...meta,
    },
    schema: { is_nullable: true, ...schema },
  };
}
const half = { width: 'half' };
const req = { is_nullable: false };
const choices = (vals) => ({ choices: vals.map((v) => ({ text: v, value: v })) });
const m2o = (template) => ({
  interface: 'select-dropdown-m2o',
  options: { template },
});
const dt = (includeTime = true) => ({
  interface: 'datetime',
  options: { include_time: includeTime, include_seconds: false, '24hr': true },
});
const sel = (vals) => ({ interface: 'select-dropdown', options: choices(vals) });
const grp = (name, interfaceName = 'group-detail', group = null) => ({
  field: name, type: 'alias',
  meta: { interface: interfaceName, special: ['alias', 'no-data', 'group'], width: 'full', sort: sortCounter++, hidden: false,
    ...(group ? { group } : {}) },
  schema: null,
});
const o2m = (field, template, extraMeta = {}) => ({
  field, type: 'alias',
  meta: {
    interface: 'list-o2m', special: ['o2m'], width: 'full',
    options: { template }, sort: sortCounter++, ...extraMeta,
  },
  schema: null,
});

// ---------- collection specs ----------
// NOTE: id is uuid PK (created via collection payload — Directus does not
// auto-fill it unless schema.default_value is set). FKs to book_* = uuid,
// FKs to directus_users/directus_files = uuid. `seq` bigInteger auto-increment
// preserves creation ordering that integer ids used to give us (collision
// checks, court caps, refs) — uuid v4 has no order.
const UUID_PK = {
  field: 'id', type: 'uuid',
  meta: { interface: 'input', hidden: true, sort: 1 },
  schema: { is_primary_key: true, has_auto_increment: false, is_nullable: false, default_value: 'gen_random_uuid()' },
};
const seqF = () => F('seq', 'bigInteger',
  { hidden: true, readonly: true, note: 'Creation order — replaces int-id ordering' },
  { has_auto_increment: true, is_nullable: false });
const SPECS = [
  {
    collection: 'book_sport_types',
    meta: { icon: 'sports', note: 'Sports catalog — courts point here' },
    fields: [
      F('name', 'string', { ...half, note: 'Pickleball, Basketball, ...' }, req),
      F('icon', 'string', half),
      F('sort', 'integer', half),
    ],
  },
  {
    collection: 'book_tenants',
    meta: { icon: 'storefront', note: 'A venue/business that rents courts' },
    fields: [
      // tabs parent — each child group renders as a tab
      grp('g_main', 'group-tabs'),
      grp('g_venue', 'group-detail', 'g_main'), grp('g_location', 'group-detail', 'g_main'),
      grp('g_payments', 'group-detail', 'g_main'), grp('g_rules', 'group-detail', 'g_main'),
      grp('g_ops', 'group-detail', 'g_main'), grp('g_advanced', 'group-detail', 'g_main'),
      F('name', 'string', { ...half, group: 'g_venue', note: 'Shown to customers' }, req),
      F('slug', 'string', { ...half, group: 'g_venue', note: 'URL /book/v/{slug} — set once' }, req),
      F('logo', 'uuid', { ...half, group: 'g_venue', interface: 'file-image', note: 'Venue photo' }),
      F('description', 'text', { group: 'g_venue', interface: 'input-multiline' }),
      F('address', 'string', { group: 'g_location', note: 'Street address shown to customers' }),
      F('latitude', 'decimal', { ...half, group: 'g_location', note: 'From Google Maps — right-click the pin → copy the numbers before the comma' }),
      F('longitude', 'decimal', { ...half, group: 'g_location', note: 'From Google Maps — the number after the comma' }),
      F('contact_phone', 'string', { ...half, group: 'g_location' }),
      F('contact_email', 'string', { ...half, group: 'g_location' }),
      o2m('payment_methods', '{{name}} · {{account_number}}', { group: 'g_payments', note: 'Add every way customers can pay — wallets, banks, QR' }),
      F('payment_name', 'string', { ...half, group: 'g_payments', hidden: true, note: 'Legacy single-pay label — use Payment methods instead' }),
      F('payment_qr', 'uuid', { ...half, group: 'g_payments', interface: 'file-image', hidden: true, note: 'Legacy — use Payment methods' }),
      F('gcash_name', 'string', { ...half, group: 'g_payments', hidden: true, note: 'Legacy — use Payment methods' }),
      F('gcash_number', 'string', { ...half, group: 'g_payments', hidden: true, note: 'Legacy — use Payment methods' }),
      F('bank_details', 'text', { group: 'g_payments', interface: 'input-multiline', hidden: true, note: 'Legacy free-text pay info — use Payment methods' }),
      F('timezone', 'string', { ...half, group: 'g_rules', note: 'e.g. Asia/Manila — slot times are venue-local' }, { default_value: 'Asia/Manila' }),
      F('currency', 'string', { ...half, group: 'g_rules', note: 'e.g. PHP' }, { default_value: 'PHP' }),
      F('slot_minutes', 'integer', { ...half, group: 'g_rules', note: 'Time grid step customers pick from: 30 or 60' }, { default_value: 60 }),
      F('min_duration', 'integer', { ...half, group: 'g_rules', note: 'Shortest booking allowed, in minutes (60 = 1 hour)' }, { default_value: 60 }),
      F('max_duration', 'integer', { ...half, group: 'g_rules', note: 'Longest single booking, in minutes (360 = 6 hours). Counts booked slots — blocked cells inside a range don\'t count' }, { default_value: 240 }),
      F('buffer_minutes', 'integer', { ...half, group: 'g_rules', note: 'Gap between bookings' }, { default_value: 10 }),
      F('cancel_cutoff_hours', 'integer', { ...half, group: 'g_rules', note: 'Free-cancel window' }, { default_value: 24 }),
      F('refund_policy', 'text', { group: 'g_rules', interface: 'input-multiline', note: 'Cancellation/refund terms shown to customers — e.g. "No refunds within 24h of slot" or leave empty if none' }),
      F('payment_timeout_minutes', 'integer', { ...half, group: 'g_rules', note: 'Checkout hold length before held slots release — shorter = urgency/FIFO' }, { default_value: 15 }),
      F('allow_non_contiguous_slots', 'boolean', { ...half, group: 'g_rules', interface: 'boolean', note: 'OFF = one continuous run per court per day; ON = customers may skip slots' }, { default_value: false }),
      F('status', 'string', { ...half, group: 'g_advanced', ...sel(['pending', 'active', 'suspended']), note: 'Zyberlab controls — not tenant-editable' }),
      F('auto_confirm_payments', 'boolean', { ...half, group: 'g_advanced', interface: 'boolean', note: 'Trust mode: confirm on proof upload without review — use with care' }, { default_value: false }),
      F('settings', 'json', { group: 'g_advanced', interface: 'input-code', note: 'Future knobs — Zyberlab admin only' }),
      // O2M aliases — day-to-day venue data
      o2m('courts', '{{name}}', { group: 'g_ops', note: 'Bookable units — see book_courts' }),
      o2m('opening_hours', 'Day {{day_of_week}}', { group: 'g_ops' }),
      o2m('closures', '{{reason}} · {{date_start}}', { group: 'g_ops' }),
      o2m('tenant_users', '{{user.first_name}} {{user.last_name}}', { group: 'g_ops' }),
      o2m('bookings', '{{ref}} · {{customer_name}}', { group: 'g_ops' }),
    ],
  },
  {
    collection: 'book_tenant_users',
    meta: { icon: 'group', note: 'Staff accounts linked to a tenant' },
    fields: [
      seqF(),
      F('tenant', 'uuid', { ...half, ...m2o('{{name}}'), note: 'Venue this staff belongs to' }, req),
      F('user', 'uuid', { ...half, ...m2o('{{first_name}} {{last_name}} — {{email}}'), note: 'Directus login' }, req),
      F('role', 'string', { ...half, ...sel(['owner', 'manager', 'front_desk']), note: 'owner=full, manager=ops, front_desk=check-ins only' }),
    ],
  },
  {
    collection: 'book_courts',
    meta: { icon: 'sports_tennis', note: 'Bookable units — courts, tables, lanes' },
    fields: [
      seqF(),
      F('tenant', 'uuid', { ...half, ...m2o('{{name}}') }, req),
      F('name', 'string', { ...half, note: 'Court 1, Arena A, Table 3' }, req),
      F('sport', 'uuid', { ...half, ...m2o('{{name}}'), note: 'Pick a sport type' }),
      F('surface', 'string', { ...half, ...sel(['Indoor', 'Outdoor', 'Hardcourt', 'Grass', 'Synthetic', 'Other']) }),
      F('status', 'string', { ...half, ...sel(['active', 'maintenance', 'inactive']) }, { default_value: 'active' }),
      F('price_per_hour', 'decimal', { ...half, note: 'Per hour, PHP' }),
      F('peak_multiplier', 'decimal', { ...half, note: 'e.g. 1.5 for peak — Phase 2' }, { default_value: 1 }),
      F('sort', 'integer', half),
      F('photo', 'uuid', { ...half, interface: 'file-image', note: 'Court photo' }),
      F('description', 'text', { interface: 'input-multiline' }),
      o2m('photos', '{{photo.filename_download}}', { note: 'Gallery — photo above is the cover' }),
      o2m('slots', 'Slot {{date}} {{start_time}}', { note: 'Bookings on this court' }),
      o2m('opening_hours', 'Day {{day_of_week}}', { note: 'Per-court overrides (optional)' }),
      o2m('closures', '{{reason}} · {{date_start}}'),
    ],
  },
  {
    collection: 'book_court_photos',
    meta: { icon: 'photo_library', note: 'Gallery images for a court — court.photo stays the cover' },
    fields: [
      seqF(),
      F('court', 'uuid', { ...half, ...m2o('{{name}}'), note: 'Court this photo belongs to' }, req),
      F('photo', 'uuid', { ...half, interface: 'file-image', note: 'Gallery image' }, req),
      F('caption', 'string', { ...half }),
      F('sort', 'integer', half),
    ],
  },
  {
    collection: 'book_payment_methods',
    meta: { icon: 'account_balance_wallet', note: 'Ways customers can pay a venue — wallets, banks, QR' },
    fields: [
      seqF(),
      F('tenant', 'uuid', { ...half, ...m2o('{{name}}'), note: 'Venue' }, req),
      F('name', 'string', { ...half, note: 'Pay method — e.g. GCash, Maya, Maribank, BPI, UnionBank, cash' }, req),
      F('type', 'string', { ...half, ...sel(['wallet', 'bank', 'cash', 'other']), note: 'wallet = e-wallet (GCash/Maya), bank = transfer' }, { default_value: 'wallet' }),
      F('account_name', 'string', { ...half, note: 'Account holder name' }),
      F('account_number', 'string', { ...half, note: 'Mobile number or account digits' }),
      F('qr', 'uuid', { ...half, interface: 'file-image', note: 'QR image customers scan to pay' }),
      F('instructions', 'text', { interface: 'input-multiline', note: 'Shown under this method — bank branch, reference format, remarks' }),
      F('sort', 'integer', { hidden: true }, { default_value: 1 }),
    ],
  },
  {
    collection: 'book_opening_hours',
    meta: { icon: 'schedule', note: 'Weekly opening hours per venue' },
    fields: [
      F('tenant', 'uuid', { ...half, ...m2o('{{name}}') }, req),
      F('court', 'uuid', { ...half, ...m2o('{{name}}'), note: 'Empty = venue-wide default' }),
      F('day_of_week', 'integer', { ...half, ...sel(['0', '1', '2', '3', '4', '5', '6']), note: '0=Sun … 6=Sat' }),
      F('open_time', 'time', half, {}),
      F('close_time', 'time', half, {}),
      F('closed', 'boolean', { ...half, interface: 'boolean' }),
    ],
  },
  {
    collection: 'book_closures',
    meta: { icon: 'event_busy', note: 'Closures, maintenance, private events' },
    fields: [
      F('tenant', 'uuid', { ...half, ...m2o('{{name}}') }, req),
      F('court', 'uuid', { ...half, ...m2o('{{name}}'), note: 'Empty = whole venue' }),
      F('date', 'date', { ...half, ...dt(false) }),
      F('date_start', 'date', { ...half, ...dt(false) }),
      F('date_end', 'date', { ...half, ...dt(false) }),
      F('all_day', 'boolean', { ...half, interface: 'boolean' }),
      F('start_time', 'time', half),
      F('end_time', 'time', half),
      F('reason', 'string', { interface: 'input-multiline', note: 'Maintenance, private event, holiday…' }),
    ],
  },
  {
    collection: 'book_bookings',
    meta: { icon: 'event_note', note: 'Reservation headers — slots/payments hang off these' },
    fields: [
      seqF(),
      grp('g_booking', 'group-tabs'), grp('g_schedule', 'group-tabs'),
      grp('g_money', 'group-tabs'), grp('g_internal', 'group-tabs'),
      F('ref', 'string', { ...half, group: 'g_booking', readonly: true, note: 'Auto: BK-YYYY-NNNN' }),
      F('customer_name', 'string', { ...half, group: 'g_booking' }, req),
      F('customer_phone', 'string', { ...half, group: 'g_booking' }),
      F('customer_email', 'string', { ...half, group: 'g_booking' }),
      F('customer', 'uuid', { ...half, group: 'g_booking', ...m2o('{{first_name}} {{last_name}}') }),
      F('source', 'string', { ...half, group: 'g_booking', ...sel(['app', 'walk_in', 'phone', 'admin']), note: 'How booking was made' }),
      F('status', 'string', { ...half, group: 'g_booking', ...sel(['pending_payment', 'confirmed', 'checked_in', 'completed', 'cancelled', 'rejected', 'no_show', 'expired']) }, { default_value: 'pending_payment' }),
      F('payment_status', 'string', { ...half, group: 'g_booking', ...sel(['unpaid', 'pending_verification', 'paid', 'refunded', 'failed']), readonly: true, note: 'Owned by flows' }),
      F('notes', 'text', { group: 'g_booking', interface: 'input-multiline', note: 'Customer notes' }),
      o2m('slots', 'Court {{court.name}} · {{date}} {{start_time}}', { group: 'g_schedule' }),
      o2m('payments', '₱{{amount}} · {{method}}', { group: 'g_money' }),
      o2m('proofs', '{{sender_name}} · ₱{{payment.amount}}', { group: 'g_money', note: 'Verification queue' }),
      F('internal_notes', 'text', { group: 'g_internal', interface: 'input-multiline', note: 'Tenant-only — customers never see' }),
      F('subtotal', 'decimal', { ...half, group: 'g_internal', readonly: true }),
      F('platform_fee', 'decimal', { ...half, group: 'g_internal', readonly: true, note: 'Zyberlab — admin only' }),
      F('total', 'decimal', { ...half, group: 'g_internal', readonly: true }),
      F('tenant', 'uuid', { ...half, group: 'g_internal', ...m2o('{{name}}'), readonly: true }),
      F('checked_in_at', 'timestamp', { ...half, group: 'g_internal', ...dt(), readonly: true }),
      F('cancelled_at', 'timestamp', { ...half, group: 'g_internal', ...dt(), readonly: true }),
      F('cancel_reason', 'string', { ...half, group: 'g_internal' }),
    ],
  },
  {
    collection: 'book_booking_slots',
    meta: { icon: 'schedule', note: 'Per-court time pieces of a booking' },
    fields: [
      seqF(),
      F('booking', 'uuid', { ...half, ...m2o('{{ref}}') }, req),
      F('court', 'uuid', { ...half, ...m2o('{{name}}') }, req),
      F('date', 'date', { ...half, ...dt(false) }, req),
      F('start_time', 'time', half, req),
      F('end_time', 'time', half, req),
      F('duration_minutes', 'integer', { ...half, readonly: true, note: 'Derived' }),
      F('price', 'decimal', { ...half, note: 'Locked at booking time' }),
      F('status', 'string', { ...half, ...sel(['held', 'confirmed', 'released', 'cancelled']) }, { default_value: 'held' }),
      F('held_until', 'timestamp', { ...half, ...dt(), readonly: true, note: 'Auto: ~30min payment window' }),
    ],
  },
  {
    collection: 'book_payments',
    meta: { icon: 'payments', note: 'Money records per booking' },
    fields: [
      F('booking', 'uuid', { ...half, ...m2o('{{ref}}') }, req),
      F('method', 'string', { ...half, ...sel(['gcash', 'maya', 'qrph', 'card', 'bank', 'cash', 'other', 'xendit_invoice']), note: 'How the customer paid — set from the venue pay-method label' }, req),
      F('amount', 'decimal', { ...half, note: 'What customer paid, PHP' }, req),
      F('status', 'string', { ...half, ...sel(['pending', 'paid', 'failed', 'refunded', 'expired']) }, { default_value: 'pending' }),
      F('reference', 'string', { ...half, note: 'GCash ref no. / Xendit invoice id' }),
      F('paid_at', 'timestamp', { ...half, ...dt(), readonly: true }),
      F('receipt_file', 'uuid', { ...half, interface: 'file', note: 'Receipt image or PDF' }),
      F('platform_fee', 'decimal', { ...half, readonly: true, note: 'Zyberlab cut — admin only' }),
      F('tenant_payout', 'decimal', { ...half, readonly: true, note: 'What venue receives' }),
      F('xendit_invoice_id', 'string', { ...half, hidden: true, note: 'Phase 2' }),
      F('xendit_invoice_url', 'string', { ...half, hidden: true, note: 'Phase 2' }),
      o2m('proofs', '{{sender_name}} · {{status}}'),
    ],
  },
  {
    collection: 'book_payment_proofs',
    meta: { icon: 'receipt_long', note: 'Proof-of-payment uploads — tenant verification queue' },
    fields: [
      grp('g_proof', 'group-detail'), grp('g_details', 'group-detail'), grp('g_review', 'group-detail'),
      F('booking', 'uuid', { ...half, group: 'g_proof', ...m2o('{{ref}}') }, req),
      F('payment', 'uuid', { ...half, group: 'g_proof', ...m2o('₱{{amount}} · {{method}}') }),
      F('file', 'uuid', { group: 'g_proof', interface: 'file', note: 'Screenshot or PDF of payment' }, req),
      F('sender_name', 'string', { ...half, group: 'g_details' }),
      F('reference_no', 'string', { ...half, group: 'g_details', note: 'GCash reference number' }),
      F('sent_at', 'timestamp', { ...half, group: 'g_details', ...dt() }),
      F('status', 'string', { ...half, group: 'g_review', ...sel(['pending', 'approved', 'rejected']) }, { default_value: 'pending' }),
      F('rejection_reason', 'text', {
        group: 'g_review', interface: 'input-multiline',
        note: 'Shown to customer',
        conditions: [{ name: 'hide_unless_rejected', rule: { status: { _neq: 'rejected' } }, hidden: true }],
      }),
      F('reviewed_by', 'uuid', { ...half, group: 'g_review', ...m2o('{{first_name}} {{last_name}}'), readonly: true }),
      F('reviewed_at', 'timestamp', { ...half, group: 'g_review', ...dt(), readonly: true }),
    ],
  },
];

// ---------- relations: [childCollection, childField, parentCollection, onDelete]
const RELATIONS = [
  ['book_tenant_users', 'tenant', 'book_tenants', 'CASCADE'],
  ['book_tenant_users', 'user', 'directus_users', 'SET NULL'],
  ['book_courts', 'tenant', 'book_tenants', 'CASCADE'],
  ['book_courts', 'sport', 'book_sport_types', 'SET NULL'],
  ['book_opening_hours', 'tenant', 'book_tenants', 'CASCADE'],
  ['book_opening_hours', 'court', 'book_courts', 'SET NULL'],
  ['book_closures', 'tenant', 'book_tenants', 'CASCADE'],
  ['book_closures', 'court', 'book_courts', 'SET NULL'],
  ['book_bookings', 'tenant', 'book_tenants', 'CASCADE'],
  ['book_bookings', 'customer', 'directus_users', 'SET NULL'],
  ['book_booking_slots', 'booking', 'book_bookings', 'CASCADE'],
  ['book_booking_slots', 'court', 'book_courts', 'CASCADE'],
  ['book_payments', 'booking', 'book_bookings', 'CASCADE'],
  ['book_payment_proofs', 'booking', 'book_bookings', 'CASCADE'],
  ['book_payment_proofs', 'payment', 'book_payments', 'SET NULL'],
  ['book_payment_proofs', 'file', 'directus_files', 'RESTRICT'],
  ['book_payment_proofs', 'reviewed_by', 'directus_users', 'SET NULL'],
  ['book_payments', 'receipt_file', 'directus_files', 'SET NULL'],
  ['book_tenants', 'logo', 'directus_files', 'SET NULL'],
  ['book_courts', 'photo', 'directus_files', 'SET NULL'],
  ['book_court_photos', 'court', 'book_courts', 'CASCADE'],
  ['book_court_photos', 'photo', 'directus_files', 'SET NULL'],
  ['book_payment_methods', 'tenant', 'book_tenants', 'CASCADE'],
  ['book_payment_methods', 'qr', 'directus_files', 'SET NULL'],
];

// O2M alias field on parent for each M2O (childField → aliasName)
const O2M_ALIASES = {
  book_tenants: { courts: 'book_courts.tenant', opening_hours: 'book_opening_hours.tenant', closures: 'book_closures.tenant', tenant_users: 'book_tenant_users.tenant', bookings: 'book_bookings.tenant', payment_methods: 'book_payment_methods.tenant' },
  book_courts: { slots: 'book_booking_slots.court', opening_hours: 'book_opening_hours.court', closures: 'book_closures.court', photos: 'book_court_photos.court' },
  book_bookings: { slots: 'book_booking_slots.booking', payments: 'book_payments.booking', proofs: 'book_payment_proofs.booking' },
  book_payments: { proofs: 'book_payment_proofs.payment' },
  book_sport_types: { courts: 'book_courts.sport' },
};

// ---------- run ----------
async function main() {
  // cleanup probe
  try { await api('DELETE', '/collections/book_probe'); console.log('deleted book_probe'); }
  catch (e) { console.log('probe cleanup:', e.message); }

  for (const spec of SPECS) {
    // collection
    try {
      await api('GET', `/collections/${spec.collection}`);
      console.log(`= ${spec.collection} exists`);
    } catch {
      await api('POST', '/collections', {
        collection: spec.collection,
        meta: { icon: spec.meta.icon, note: spec.meta.note, hidden: false, singleton: false },
        schema: {},
        // seq must ride in the create payload — POST /fields treats
        // has_auto_increment as a PK and fails on tables that already have one
        fields: [UUID_PK, ...(spec.fields ?? []).filter((f) => f.field === 'seq')],
      });
      console.log(`+ ${spec.collection} created`);
    }
    // fields
    const existing = new Set(
      (await api('GET', `/fields/${spec.collection}?limit=-1`)).map((f) => f.field),
    );
    for (const f of spec.fields) {
      if (existing.has(f.field)) continue;
      const body = { field: f.field, type: f.type, meta: f.meta, schema: f.schema ?? null };
      try {
        await api('POST', `/fields/${spec.collection}`, body);
        console.log(`  + ${spec.collection}.${f.field} (${f.type})`);
      } catch (e) {
        console.log(`  ! ${spec.collection}.${f.field}: ${e.message}`);
      }
    }
  }

  // relations — find existing first
  const existingRels = await api('GET', '/relations?limit=-1');
  const relKey = (r) => `${r.collection}.${r.field}->${r.related_collection}`;
  const have = new Set(existingRels.map(relKey));

  for (const [child, field, parent, onDelete] of RELATIONS) {
    const key = `${child}.${field}->${parent}`;
    if (have.has(key)) { console.log(`= rel ${key} exists`); continue; }
    // find the o2m alias name on parent for this child.field
    const aliasEntry = Object.entries(O2M_ALIASES[parent] || {}).find(
      ([, v]) => v === `${child}.${field}`,
    );
    const oneField = aliasEntry ? aliasEntry[0] : null;
    try {
      await api('POST', '/relations', {
        collection: child,
        field,
        related_collection: parent,
        schema: { on_delete: onDelete, on_update: 'NO ACTION' },
        meta: {
          many_collection: child,
          many_field: field,
          one_collection: parent,
          one_field: oneField,
          one_allowed_collections: null,
          junction_field: null,
          sort_field: null,
        },
      });
      console.log(`+ rel ${key}${oneField ? ` (alias ${parent}.${oneField})` : ''}`);
    } catch (e) {
      console.log(`! rel ${key}: ${e.message}`);
    }
  }
  console.log('done');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
