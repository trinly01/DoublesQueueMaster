/**
 * Booking flows v2 — verified trigger shapes:
 *  - $trigger.keys = [item ids] (create & update)
 *  - $trigger.payload = created item / updated fields only
 *  - likha_sql bypasses Directus events → booking_status_mail needs an
 *    item-update "touch" to emit items.update for flow-driven confirms.
 * Rebuilds flows by name (delete + recreate).
 */
const TOKEN = process.env.BOOKING_ADMIN_TOKEN || 'Bearer ***REMOVED***';
const BASE = 'https://api.dinkmatch.club';

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json?.errors?.[0] || json).slice(0, 300)}`);
  return json?.data ?? json;
}
const sql = (query, binding = []) => ({ sql: query, binding });
const T = (v) => `{{${v}}}`;

// exec that extracts the affected item id regardless of trigger shape
const normalizeId = (key) => ({
  name: 'normalize', key: 'normalize', type: 'exec',
  options: { code: `module.exports = async function(data) {
    const t = data.$trigger || {};
    const id = (t.keys && t.keys[0]) ?? (t.payload && t.payload.id)
      ?? (Array.isArray(t.payload) ? t.payload[0] && t.payload[0].id : null);
    if (!id) throw new Error('no item id in trigger');
    return { itemId: id };
  };` },
});

const readBookingOfProof = {
  name: 'read_booking', key: 'read_booking', type: 'item-read',
  options: { permissions: '$full', emitEvents: false,
    collection: 'book_payment_proofs',
    key: [`${T('normalize.itemId')}`], fields: ['booking'] },
};
const touchBooking = {
  name: 'touch_booking', key: 'touch_booking', type: 'item-update',
  options: { permissions: '$full', emitEvents: true,
    collection: 'book_bookings',
    key: [`${T('read_booking.booking')}`],
    payload: { status: 'confirmed' } },
};

const FLOWS = [
  {
    name: 'booking_ref', icon: 'tag',
    description: 'Assign BK-YYYY-NNNN ref on booking create',
    trigger: 'event', options: { type: 'action', scope: ['items.create'], collections: ['book_bookings'] },
    ops: [
      normalizeId(),
      { name: 'assign_ref', key: 'assign_ref', type: 'likha_sql', options: sql(
        `UPDATE book_bookings SET ref = 'BK-' || to_char(now(),'YYYY') || '-' || lpad(id::text,4,'0')
         WHERE id = ? AND (ref IS NULL OR ref = '')`,
        [T('normalize.itemId')]) },
    ],
  },
  {
    name: 'slot_init', icon: 'schedule',
    description: 'On slot create: duration, hold expiry, tenant stamp, price snapshot',
    trigger: 'event', options: { type: 'action', scope: ['items.create'], collections: ['book_booking_slots'] },
    ops: [
      normalizeId(),
      { name: 'init_slot', key: 'init_slot', type: 'likha_sql', options: sql(
        `UPDATE book_booking_slots s SET
           duration_minutes = GREATEST(0, ROUND(EXTRACT(EPOCH FROM ((s.date + s.end_time) - (s.date + s.start_time))) / 60))::int,
           held_until = CASE WHEN s.status = 'held' THEN now() + interval '30 minutes' ELSE s.held_until END,
           tenant = COALESCE(s.tenant, b.tenant),
           price = COALESCE(s.price, ROUND(c.price_per_hour * EXTRACT(EPOCH FROM ((s.date + s.end_time) - (s.date + s.start_time))) / 3600, 2))
         FROM book_bookings b, book_courts c
         WHERE s.id = ? AND b.id = s.booking AND c.id = s.court`,
        [T('normalize.itemId')]) },
    ],
  },
  {
    name: 'collision_check', icon: 'block',
    description: 'Delete newly created slot if it overlaps an active slot on same court+date+time',
    trigger: 'event', options: { type: 'action', scope: ['items.create'], collections: ['book_booking_slots'] },
    ops: [
      normalizeId(),
      { name: 'drop_overlap', key: 'drop_overlap', type: 'likha_sql', options: sql(
        `DELETE FROM book_booking_slots n
         WHERE n.id = ? AND n.status IN ('held','confirmed')
           AND EXISTS (SELECT 1 FROM book_booking_slots s
             WHERE s.court_id = n.court_id AND s.id <> n.id
               AND s.status IN ('held','confirmed')
               AND s.date = n.date
               AND s.start_time < n.end_time AND s.end_time > n.start_time)`,
        [T('normalize.itemId')]) },
    ],
  },
  {
    name: 'hold_expire_sweeper', icon: 'timer_off',
    description: 'Every 5 min: release expired holds, expire unpaid bookings',
    trigger: 'schedule', options: { cron: '*/5 * * * *' },
    ops: [
      { name: 'sweep', key: 'sweep', type: 'likha_sql', options: sql(
        `WITH released AS (
           UPDATE book_booking_slots SET status='released'
           WHERE status='held' AND held_until IS NOT NULL AND held_until < now()
           RETURNING booking_id
         ), expired AS (
           UPDATE book_bookings b SET status='expired', payment_status='failed'
           WHERE b.status='pending_payment'
             AND EXISTS (SELECT 1 FROM book_booking_slots s WHERE s.booking_id=b.id AND s.status='released')
             AND NOT EXISTS (SELECT 1 FROM book_booking_slots s WHERE s.booking_id=b.id AND s.status IN ('held','confirmed'))
           RETURNING id
         )
         SELECT (SELECT count(*) FROM released) AS released, (SELECT count(*) FROM expired) AS expired`) },
    ],
  },
  {
    name: 'proof_approved', icon: 'check_circle',
    description: 'Proof approved → payment paid, booking+slots confirmed, customer emailed',
    trigger: 'event', options: { type: 'action', scope: ['items.update'], collections: ['book_payment_proofs'] },
    ops: [
      normalizeId(),
      { name: 'apply_approval', key: 'apply_approval', type: 'likha_sql', options: sql(
        `WITH p AS (SELECT * FROM book_payment_proofs WHERE id = ? AND status = 'approved'),
         upd_pay AS (
           UPDATE book_payments pay SET status='paid', paid_at=COALESCE(pay.paid_at, now())
           FROM p WHERE pay.id = p.payment RETURNING pay.id
         ),
         upd_book AS (
           UPDATE book_bookings b SET payment_status='paid', status='confirmed'
           FROM p WHERE b.id = p.booking AND b.status IN ('pending_payment','confirmed')
           RETURNING b.id
         )
         UPDATE book_booking_slots s SET status='confirmed'
         FROM upd_book ub WHERE s.booking_id = ub.id AND s.status = 'held'`,
        [T('normalize.itemId')]) },
      readBookingOfProof,
      touchBooking,
    ],
  },
  {
    name: 'proof_auto_confirm', icon: 'bolt',
    description: 'Tenant auto_confirm_payments ON → booking confirms on proof upload',
    trigger: 'event', options: { type: 'action', scope: ['items.create'], collections: ['book_payment_proofs'] },
    ops: [
      normalizeId(),
      { name: 'auto_confirm', key: 'auto_confirm', type: 'likha_sql', options: sql(
        `WITH p AS (
           SELECT pr.id AS proof_id, pr.booking AS booking_id
           FROM book_payment_proofs pr
           JOIN book_bookings b ON b.id = pr.booking
           JOIN book_tenants t ON t.id = b.tenant
           WHERE pr.id = ? AND t.auto_confirm_payments = true AND b.status = 'pending_payment'
         ),
         upd_book AS (
           UPDATE book_bookings b SET status='confirmed', payment_status='pending_verification'
           FROM p WHERE b.id = p.booking_id RETURNING b.id
         )
         UPDATE book_booking_slots s SET status='confirmed'
         FROM upd_book ub WHERE s.booking_id = ub.id AND s.status = 'held'`,
        [T('normalize.itemId')]) },
      readBookingOfProof,
      touchBooking,
    ],
  },
  {
    name: 'booking_status_mail', icon: 'mail',
    description: 'Email customer on booking status changes (confirmed/cancelled/expired)',
    trigger: 'event', options: { type: 'action', scope: ['items.update'], collections: ['book_bookings'] },
    ops: [
      { name: 'guard', key: 'guard', type: 'exec', options: { code:
        `module.exports = async function(data) {
          const t = data.$trigger || {};
          const p = t.payload || {};
          const ok = ['confirmed','cancelled','expired','no_show','completed'].includes(p.status);
          const id = (t.keys && t.keys[0]) ?? p.id;
          if (!ok || !id) throw new Error('skip: not a notifiable transition');
          return { bookingId: id };
        };` } },
      { name: 'read_booking', key: 'read_booking', type: 'item-read',
        options: { permissions: '$full', emitEvents: false,
          collection: 'book_bookings', key: [`${T('guard.bookingId')}`],
          fields: ['ref', 'customer_email', 'customer_name', 'status'] } },
      { name: 'notify', key: 'notify', type: 'mail', options: {
        type: 'markdown',
        to: [`${T('read_booking.customer_email')}`],
        subject: `Booking ${T('read_booking.ref')} — ${T('read_booking.status')}`,
        body: `Hi ${T('read_booking.customer_name')},\n\nYour booking **${T('read_booking.ref')}** is now **${T('read_booking.status')}**.\n\n— Zyberlab Booking` } },
    ],
  },
];

async function main() {
  const existing = await api('GET', '/flows?limit=-1&fields=id,name');
  const byName = new Map(existing.map((f) => [f.name, f.id]));
  for (const spec of FLOWS) {
    // delete existing flow + its ops for a clean rebuild
    if (byName.has(spec.name)) {
      const old = await api('GET', `/flows/${byName.get(spec.name)}?fields=*,operations.id`);
      for (const op of old.operations || []) {
        try { await api('DELETE', `/operations/${op.id}`); } catch {}
      }
      await api('DELETE', `/flows/${byName.get(spec.name)}`);
      console.log(`- ${spec.name} rebuilt`);
    }
    const flow = await api('POST', '/flows', {
      name: spec.name, icon: spec.icon, description: spec.description,
      status: 'active', trigger: spec.trigger, accountability: 'all',
      options: spec.options,
    });
    const fid = flow.id;
    let prevId = null;
    const opIds = [];
    for (let i = spec.ops.length - 1; i >= 0; i--) {
      const o = spec.ops[i];
      const op = await api('POST', '/operations', {
        flow: fid, name: o.name, key: o.key, type: o.type,
        position_x: 30 + i * 20, position_y: 10,
        options: o.options, resolve: prevId, reject: null,
      });
      prevId = op.id;
      opIds.unshift(op.id);
    }
    await api('PATCH', `/flows/${fid}`, { operation: opIds[0] });
    console.log(`+ ${spec.name} (${spec.ops.length} ops)`);
  }
  console.log('done');
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
