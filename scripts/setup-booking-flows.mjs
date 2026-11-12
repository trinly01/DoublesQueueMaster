/**
 * Booking flows v3 — verified trigger shapes:
 *  - items.create → $trigger = {event, payload:<body NO id>, key:<new PK>, collection}
 *  - items.update → $trigger = {event, payload:{keys:[...], item:{...}}, ...}
 *  - likha_sql bypasses Directus events → booking_status_mail needs an
 *    item-update "touch" to emit items.update for flow-driven confirms.
 * normalize exec resolves the item id across all shapes.
 * Rebuilds flows by name (delete + recreate). Idempotent.
 *
 * v3 fixes (found by scenario review):
 *  - slot_init: dropped nonexistent s.tenant; syncs slot status to parent
 *    booking (confirmed booking → confirmed slots, no hold)
 *  - collision_check: marks slot 'cancelled' (audit) instead of DELETE
 *  - hold_expire_sweeper: also expires pending_payment bookings with no
 *    active slots (collision/orphan cleanup), 35min grace
 *  - proof_approved: guard op — touch_booking only runs if booking actually
 *    confirmed (was resurrecting cancelled bookings)
 *  - NEW proof_pending: proof upload → booking.payment_status=pending_verification
 *    + tenant email alert
 *  - NEW proof_rejected: → payment_status=unpaid (retry allowed) + customer mail
 *  - NEW booking_totals: slot create/update/delete → recompute subtotal/total
 *  - NEW booking_cancelled: booking→cancelled releases held slots
 *  - NEW no_show_sweeper: daily, confirmed past last slot end +30min → no_show
 */
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* .env optional — vars may come from the shell */ }
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) throw new Error('BOOKING_ADMIN_TOKEN is not set — copy .env.example to .env and fill it in');
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

// resolves item id across create/update/delete trigger shapes (verified live)
const normalizeId = (key = 'normalize') => ({
  name: 'normalize', key, type: 'exec',
  options: { code: `module.exports = async function(data) {
    const t = data.$trigger || {};
    const p = t.payload || {};
    const id = t.key
      ?? (Array.isArray(t.keys) ? t.keys[0] : null)
      ?? (p.keys && p.keys[0])
      ?? p.id
      ?? (p.item && p.item.id)
      ?? (Array.isArray(p) ? p[0] && p[0].id : null);
    if (id == null) throw new Error('no item id in trigger: ' + JSON.stringify(t).slice(0,300));
    return { itemId: id };
  };` },
});

const readBookingOfProof = (idKey = 'normalize') => ({
  name: 'read_booking', key: 'read_booking', type: 'item-read',
  options: { permissions: '$full', emitEvents: false,
    collection: 'book_payment_proofs',
    key: [`${T(idKey + '.itemId')}`], fields: ['booking'] },
});
// only touch (emit items.update → mail) when the booking is actually confirmed
const guardConfirmed = {
  name: 'guard_confirmed', key: 'guard_confirmed', type: 'exec',
  options: { code: `module.exports = async function(data) {
    const id = data.read_booking && data.read_booking.booking;
    if (!id) throw new Error('skip: no booking');
    return { bookingId: id };
  };` },
};
const readBookingStatus = {
  name: 'read_status', key: 'read_status', type: 'item-read',
  options: { permissions: '$full', emitEvents: false,
    collection: 'book_bookings',
    key: [`${T('guard_confirmed.bookingId')}`], fields: ['status'] },
};
const requireConfirmed = {
  name: 'require_confirmed', key: 'require_confirmed', type: 'exec',
  options: { code: `module.exports = async function(data) {
    const s = data.read_status && data.read_status.status;
    if (s !== 'confirmed') throw new Error('skip: booking not confirmed (' + s + ')');
    return { bookingId: data.guard_confirmed.bookingId };
  };` },
};
// skip mail ops when recipient email is missing (walk-ins, unset contacts)
const guardEmail = (src) => ({
  name: 'guard_email', key: 'guard_email', type: 'exec',
  options: { code: `module.exports = async function(data) {
    const email = ${src};
    if (!email) throw new Error('skip: no recipient email');
    return {};
  };` },
});
const touchBooking = {
  name: 'touch_booking', key: 'touch_booking', type: 'item-update',
  options: { permissions: '$full', emitEvents: true,
    collection: 'book_bookings',
    key: [`${T('require_confirmed.bookingId')}`],
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
        `UPDATE book_bookings SET ref = 'BK-' || to_char(now(),'YYYY') || '-' || lpad(seq::text,4,'0')
         WHERE id = ? AND (ref IS NULL OR ref = '')`,
        [T('normalize.itemId')]) },
    ],
  },
  {
    name: 'slot_init', icon: 'schedule',
    description: 'On slot create: duration, hold expiry, price snapshot, sync status to parent booking',
    trigger: 'event', options: { type: 'action', scope: ['items.create'], collections: ['book_booking_slots'] },
    ops: [
      normalizeId(),
      { name: 'init_slot', key: 'init_slot', type: 'likha_sql', options: sql(
        `UPDATE book_booking_slots s SET
           duration_minutes = GREATEST(0, ROUND(EXTRACT(EPOCH FROM ((s.date + s.end_time) - (s.date + s.start_time))) / 60))::int,
           status = CASE
             WHEN c.tenant <> b.tenant
               OR COALESCE(c.status, 'active') <> 'active'
               OR t.status IS DISTINCT FROM 'active'
               OR (s.date + s.start_time) <
                  (now() AT TIME ZONE COALESCE(t.timezone, 'Asia/Manila') - interval '2 hours')
             THEN 'cancelled'
             WHEN b.status = 'confirmed' AND s.status = 'held' THEN 'confirmed'
             ELSE s.status END,
           held_until = CASE WHEN s.status = 'held' AND b.status <> 'confirmed'
                              AND c.tenant = b.tenant
                              AND COALESCE(c.status, 'active') = 'active'
                              AND t.status IS NOT DISTINCT FROM 'active'
                             THEN now() + make_interval(mins => GREATEST(COALESCE(t.payment_timeout_minutes, 15), 1))
                             ELSE s.held_until END,
           price = COALESCE(s.price, ROUND(c.price_per_hour * EXTRACT(EPOCH FROM ((s.date + s.end_time) - (s.date + s.start_time))) / 3600, 2))
         FROM book_bookings b, book_courts c, book_tenants t
         WHERE s.id = ? AND b.id = s.booking AND c.id = s.court AND t.id = c.tenant`,
        [T('normalize.itemId')]) },
      // contiguity sweep: runs may only be separated by gaps that are FULLY
      // covered by other bookings' active slots or closures — free cells can
      // never be skipped. Re-evaluates the whole set each create, so it is
      // order-independent and race-safe.
      { name: 'contiguity_sweep', key: 'contiguity_sweep', type: 'likha_sql', options: sql(
        `WITH cur AS (
           SELECT booking, court, date FROM book_booking_slots WHERE id = ?
         ),
         sib AS (
           SELECT s2.id, s2.court, s2.date, s2.start_time, s2.end_time,
             LAG(s2.end_time)   OVER w AS prev_end,
             LEAD(s2.start_time) OVER w AS next_start
           FROM book_booking_slots s2, cur
           WHERE s2.booking = cur.booking AND s2.status IN ('held','confirmed')
           WINDOW w AS (PARTITION BY s2.court, s2.date ORDER BY s2.start_time, s2.seq)
         ),
         gaps AS (
           SELECT s.id AS slot_id, g.court, g.date, g.a, g.b FROM sib s
           JOIN LATERAL (VALUES
             (s.prev_end, s.start_time),
             (s.end_time, s.next_start)
           ) AS g(a, b) ON g.a IS NOT NULL AND g.b IS NOT NULL
         ),
         bad AS (
           SELECT DISTINCT g.slot_id
           FROM gaps g
           JOIN book_courts c ON c.id = g.court
           JOIN book_tenants t ON t.id = c.tenant
           WHERE t.allow_non_contiguous_slots IS NOT TRUE
             AND g.a <> g.b
             AND EXISTS (
               SELECT 1 FROM generate_series(
                 FLOOR(EXTRACT(EPOCH FROM g.a) / 60),
                 CEIL(EXTRACT(EPOCH FROM g.b) / 60) - 1,
                 COALESCE(t.slot_minutes, 60)
               ) AS m
               WHERE NOT (
                 EXISTS (SELECT 1 FROM book_booking_slots o
                         WHERE o.court = g.court AND o.date = g.date
                           AND o.booking <> (SELECT booking FROM cur)
                           AND o.status IN ('held','confirmed')
                           AND EXTRACT(EPOCH FROM o.start_time) < (m + COALESCE(t.slot_minutes, 60)) * 60
                           AND EXTRACT(EPOCH FROM o.end_time)   > m * 60)
                 OR EXISTS (SELECT 1 FROM book_closures cl
                            JOIN book_courts c2 ON c2.id = g.court
                            WHERE cl.tenant = c2.tenant
                              AND (cl.court = g.court OR cl.court IS NULL)
                              AND COALESCE(cl.date_start, cl.date) <= g.date
                              AND COALESCE(cl.date_end, cl.date) >= g.date
                              AND (cl.all_day
                                   OR (EXTRACT(EPOCH FROM COALESCE(cl.start_time, '00:00'::time)) < (m + COALESCE(t.slot_minutes, 60)) * 60
                                       AND EXTRACT(EPOCH FROM COALESCE(cl.end_time, '23:59:59'::time)) > m * 60)))
               )
             )
         )
         UPDATE book_booking_slots SET status = 'cancelled'
         WHERE id IN (SELECT slot_id FROM bad) AND status IN ('held','confirmed')`,
        [T('normalize.itemId')]) },
    ],
  },
  {
    name: 'collision_check', icon: 'block',
    description: 'On slot create: cancel if overlaps an EARLIER active slot (id<n.id = first-come wins, race-safe) or hits a closure',
    trigger: 'event', options: { type: 'action', scope: ['items.create'], collections: ['book_booking_slots'] },
    ops: [
      normalizeId(),
      { name: 'drop_overlap', key: 'drop_overlap', type: 'likha_sql', options: sql(
        `UPDATE book_booking_slots n SET status = 'cancelled'
         WHERE n.id = ? AND n.status IN ('held','confirmed')
           AND (
             EXISTS (SELECT 1 FROM book_booking_slots s
               WHERE s.court = n.court AND s.seq < n.seq
                 AND s.status IN ('held','confirmed')
                 AND s.date = n.date
                 AND s.start_time < n.end_time AND s.end_time > n.start_time)
             OR EXISTS (SELECT 1 FROM book_closures cl
               JOIN book_courts c ON c.id = n.court
               WHERE cl.tenant = c.tenant
                 AND (cl.court = n.court OR cl.court IS NULL)
                 AND COALESCE(cl.date_start, cl.date) <= n.date
                 AND COALESCE(cl.date_end, cl.date) >= n.date
                 AND (cl.all_day
                      OR ((cl.start_time IS NULL OR cl.start_time < n.end_time)
                          AND (cl.end_time IS NULL OR cl.end_time > n.start_time))))
           )`,
        [T('normalize.itemId')]) },
    ],
  },
  {
    name: 'booking_totals', icon: 'calculate',
    description: 'On slot create/update: recompute booking subtotal + total (delete gap: slot row gone)',
    trigger: 'event', options: { type: 'action', scope: ['items.create', 'items.update'], collections: ['book_booking_slots'] },
    ops: [
      normalizeId('normalize_slot'),
      { name: 'recompute', key: 'recompute', type: 'likha_sql', options: sql(
        `UPDATE book_bookings b SET
           subtotal = COALESCE((SELECT SUM(COALESCE(s.price,
               ROUND(c.price_per_hour * EXTRACT(EPOCH FROM ((s.date + s.end_time) - (s.date + s.start_time))) / 3600, 2)))
             FROM book_booking_slots s JOIN book_courts c ON c.id = s.court
             WHERE s.booking = b.id AND s.status IN ('held','confirmed')), 0),
           total = COALESCE((SELECT SUM(COALESCE(s.price,
               ROUND(c.price_per_hour * EXTRACT(EPOCH FROM ((s.date + s.end_time) - (s.date + s.start_time))) / 3600, 2)))
             FROM book_booking_slots s JOIN book_courts c ON c.id = s.court
             WHERE s.booking = b.id AND s.status IN ('held','confirmed')), 0)
             + COALESCE(b.platform_fee, 0)
         WHERE b.id = (SELECT booking FROM book_booking_slots WHERE id = ?)`,
        [T('normalize_slot.itemId')]) },
    ],
  },
  {
    name: 'booking_cancelled', icon: 'cancel',
    description: 'On booking→cancelled: release held slots so the court reopens',
    trigger: 'event', options: { type: 'action', scope: ['items.update'], collections: ['book_bookings'] },
    ops: [
      { name: 'guard', key: 'guard', type: 'exec', options: { code:
        `module.exports = async function(data) {
          const t = data.$trigger || {};
          const p = t.payload || {};
          const id = (t.keys && t.keys[0]) ?? (p.keys && p.keys[0]) ?? p.id;
          if (p.status !== 'cancelled' || !id) throw new Error('skip: not a cancel');
          return { bookingId: id };
        };` } },
      { name: 'release_slots', key: 'release_slots', type: 'likha_sql', options: sql(
        `UPDATE book_booking_slots SET status='released', held_until=NULL
         WHERE booking = ? AND status IN ('held','confirmed')`,
        [T('guard.bookingId')]) },
    ],
  },
  {
    name: 'hold_expire_sweeper', icon: 'timer_off',
    description: 'Every 5 min: release expired holds; expire stale unpaid bookings',
    trigger: 'schedule', options: { cron: '*/5 * * * *' },
    ops: [
      { name: 'sweep', key: 'sweep', type: 'likha_sql', options: sql(
        `WITH released AS (
           UPDATE book_booking_slots SET status='released'
           WHERE status='held' AND held_until IS NOT NULL AND held_until < now()
           RETURNING booking
         ), expired AS (
           UPDATE book_bookings b SET status='expired', payment_status='failed'
           FROM book_tenants t
           WHERE b.tenant = t.id AND b.status='pending_payment'
             AND b.date_created < now() - make_interval(
                   mins => COALESCE(t.payment_timeout_minutes, 15) + 10)
             -- a pending proof is the venue's move — don't expire under review
             AND NOT EXISTS (SELECT 1 FROM book_payment_proofs pp
                             WHERE pp.booking = b.id AND pp.status = 'pending')
             AND NOT EXISTS (SELECT 1 FROM book_booking_slots s
                             WHERE s.booking=b.id
                               AND (s.status='confirmed'
                                    OR (s.status='held'
                                        AND (s.held_until IS NULL OR s.held_until > now()))))
           RETURNING b.id
         )
         SELECT (SELECT count(*) FROM released) AS released, (SELECT count(*) FROM expired) AS expired`) },
    ],
  },
  {
    name: 'no_show_sweeper', icon: 'person_off',
    description: 'Daily 15:00 UTC (23:00 PHT): confirmed bookings past last slot end +30min → no_show',
    trigger: 'schedule', options: { cron: '0 15 * * *' },
    ops: [
      { name: 'sweep', key: 'sweep', type: 'likha_sql', options: sql(
        `WITH last_end AS (
           SELECT booking, MAX(date + end_time) AS ends_at
           FROM book_booking_slots WHERE status='confirmed' GROUP BY booking
         )
         UPDATE book_bookings b SET status='no_show'
         FROM last_end le
         WHERE b.id = le.booking AND b.status='confirmed'
           AND b.checked_in_at IS NULL
           AND le.ends_at < now() - interval '30 minutes'`) },
    ],
  },
  {
    name: 'proof_pending', icon: 'upload_file',
    description: 'Proof uploaded → booking.payment_status=pending_verification + tenant email alert',
    trigger: 'event', options: { type: 'action', scope: ['items.create'], collections: ['book_payment_proofs'] },
    ops: [
      normalizeId(),
      { name: 'mark_pending', key: 'mark_pending', type: 'likha_sql', options: sql(
        `UPDATE book_bookings b SET payment_status='pending_verification'
         FROM book_payment_proofs p
         WHERE p.id = ? AND b.id = p.booking
           AND b.payment_status IN ('unpaid','pending_verification')
           AND b.status = 'pending_payment'`,
        [T('normalize.itemId')]) },
      // Proof submitted = venue's move now: keep slots held 24h so the
      // sweeper can't release them mid-review (prevents re-book + double-book on approval)
      { name: 'extend_hold', key: 'extend_hold', type: 'likha_sql', options: sql(
        `UPDATE book_booking_slots s SET held_until = GREATEST(s.held_until, now() + interval '24 hours')
         FROM book_payment_proofs p
         WHERE p.id = ? AND s.booking = p.booking AND s.status = 'held'`,
        [T('normalize.itemId')]) },
      readBookingOfProof(),
      { name: 'read_tenant', key: 'read_tenant', type: 'item-read',
        options: { permissions: '$full', emitEvents: false,
          collection: 'book_bookings',
          key: [`${T('read_booking.booking')}`],
          fields: ['ref', 'tenant', 'customer_name'] } },
      { name: 'read_venue', key: 'read_venue', type: 'item-read',
        options: { permissions: '$full', emitEvents: false,
          collection: 'book_tenants',
          key: [`${T('read_tenant.tenant')}`],
          fields: ['name', 'contact_email'] } },
      guardEmail('data.read_venue && data.read_venue.contact_email'),
      { name: 'alert_tenant', key: 'alert_tenant', type: 'mail', options: {
        type: 'markdown',
        to: [`${T('read_venue.contact_email')}`],
        subject: `Proof to verify — ${T('read_tenant.ref')} (${T('read_venue.name')})`,
        body: `A customer uploaded proof of payment for booking **${T('read_tenant.ref')}** (${T('read_tenant.customer_name')}).\n\nOpen Directus → Booking → Payment Proofs → filter status = pending.\n\n— Zyberlab Booking` } },
    ],
  },
  {
    name: 'proof_approved', icon: 'check_circle',
    description: 'Proof approved → payment paid, booking+slots confirmed, customer emailed (guarded)',
    trigger: 'event', options: { type: 'action', scope: ['items.update'], collections: ['book_payment_proofs'] },
    ops: [
      { name: 'guard', key: 'guard', type: 'exec', options: { code:
        `module.exports = async function(data) {
          const t = data.$trigger || {};
          const p = t.payload || {};
          const keys = p.keys || t.keys || [];
          const id = keys[0] ?? p.id ?? (p.item && p.item.id);
          if (p.status !== 'approved' || !id) throw new Error('skip: not an approval');
          return { proofId: id };
        };` } },
      normalizeId('normalize_proof'),
      { name: 'apply_approval', key: 'apply_approval', type: 'likha_sql', options: sql(
        `WITH p AS (SELECT * FROM book_payment_proofs WHERE id = ? AND status = 'approved'),
         upd_book AS (
           UPDATE book_bookings b SET payment_status='paid', status='confirmed'
           FROM p WHERE b.id = p.booking AND b.status IN ('pending_payment','confirmed')
           RETURNING b.id
         ),
         upd_pay AS (
           UPDATE book_payments pay SET status='paid', paid_at=COALESCE(pay.paid_at, now())
           FROM p JOIN upd_book ub ON ub.id = p.booking
           WHERE pay.id = p.payment RETURNING pay.id
         )
         UPDATE book_booking_slots s SET status='confirmed'
         FROM upd_book ub WHERE s.booking = ub.id AND s.status IN ('held','released')`,
        [T('normalize_proof.itemId')]) },
      readBookingOfProof('normalize_proof'),
      guardConfirmed,
      readBookingStatus,
      requireConfirmed,
      touchBooking,
    ],
  },
  {
    name: 'proof_rejected', icon: 'cancel',
    description: 'Proof rejected → payment_status=unpaid (customer may re-upload) + customer mail',
    trigger: 'event', options: { type: 'action', scope: ['items.update'], collections: ['book_payment_proofs'] },
    ops: [
      { name: 'guard', key: 'guard', type: 'exec', options: { code:
        `module.exports = async function(data) {
          const t = data.$trigger || {};
          const p = t.payload || {};
          const keys = p.keys || t.keys || [];
          const id = keys[0] ?? p.id ?? (p.item && p.item.id);
          if (p.status !== 'rejected' || !id) throw new Error('skip: not a rejection');
          return { proofId: id };
        };` } },
      normalizeId('normalize_proof'),
      { name: 'reset_payment', key: 'reset_payment', type: 'likha_sql', options: sql(
        `UPDATE book_bookings b SET payment_status='unpaid'
         FROM book_payment_proofs p
         WHERE p.id = ? AND b.id = p.booking
           AND b.payment_status = 'pending_verification'`,
        [T('normalize_proof.itemId')]) },
      readBookingOfProof('normalize_proof'),
      { name: 'read_detail', key: 'read_detail', type: 'item-read',
        options: { permissions: '$full', emitEvents: false,
          collection: 'book_bookings',
          key: [`${T('read_booking.booking')}`],
          fields: ['ref', 'customer_email', 'customer_name'] } },
      { name: 'read_proof', key: 'read_proof', type: 'item-read',
        options: { permissions: '$full', emitEvents: false,
          collection: 'book_payment_proofs',
          key: [`${T('normalize_proof.itemId')}`],
          fields: ['rejection_reason'] } },
      guardEmail('data.read_detail && data.read_detail.customer_email'),
      { name: 'notify_customer', key: 'notify_customer', type: 'mail', options: {
        type: 'markdown',
        to: [`${T('read_detail.customer_email')}`],
        subject: `Proof rejected — ${T('read_detail.ref')}`,
        body: `Hi ${T('read_detail.customer_name')},\n\nYour proof of payment for booking **${T('read_detail.ref')}** was rejected.\n\nReason: ${T('read_proof.rejection_reason')}\n\nPlease upload a new proof before your hold expires.\n\n— Zyberlab Booking` } },
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
         FROM upd_book ub WHERE s.booking = ub.id AND s.status IN ('held','released')`,
        [T('normalize.itemId')]) },
      readBookingOfProof(),
      guardConfirmed,
      readBookingStatus,
      requireConfirmed,
      touchBooking,
    ],
  },
  {
    name: 'booking_status_mail', icon: 'mail',
    description: 'Email customer on booking status changes (confirmed/cancelled/expired/no_show/completed)',
    trigger: 'event', options: { type: 'action', scope: ['items.update'], collections: ['book_bookings'] },
    ops: [
      { name: 'guard', key: 'guard', type: 'exec', options: { code:
        `module.exports = async function(data) {
          const t = data.$trigger || {};
          const p = t.payload || {};
          const keys = p.keys || t.keys || [];
          const id = keys[0] ?? p.id;
          const ok = ['confirmed','cancelled','expired','no_show','completed'].includes(p.status);
          if (!ok || !id) throw new Error('skip: not a notifiable transition');
          return { bookingId: id };
        };` } },
      { name: 'read_booking', key: 'read_booking', type: 'item-read',
        options: { permissions: '$full', emitEvents: false,
          collection: 'book_bookings', key: [`${T('guard.bookingId')}`],
          fields: ['ref', 'customer_email', 'customer_name', 'status'] } },
      guardEmail('data.read_booking && data.read_booking.customer_email'),
      { name: 'notify', key: 'notify', type: 'mail', options: {
        type: 'markdown',
        to: [`${T('read_booking.customer_email')}`],
        subject: `Booking ${T('read_booking.ref')} — ${T('read_booking.status')}`,
        body: `Hi ${T('read_booking.customer_name')},\n\nYour booking **${T('read_booking.ref')}** is now **${T('read_booking.status')}**.\n\n— Zyberlab Booking` } },
    ],
  },
  {
    name: 'child_record_guard', icon: 'shield',
    description: 'On slot/payment/proof/photo create: delete rows the creator is not allowed to attach (deep-filter validation cannot run on create)',
    trigger: 'event', options: { type: 'action', scope: ['items.create'], collections: ['book_booking_slots', 'book_payments', 'book_payment_proofs', 'book_court_photos'] },
    ops: [
      { name: 'guard_ctx', key: 'guard_ctx', type: 'exec', options: { code:
        `module.exports = async function(data) {
          const t = data.$trigger || {};
          const p = t.payload || {};
          const id = t.key ?? p.id ?? (p.item && p.item.id);
          const acc = data.$accountability || {};
          if (id == null) throw new Error('no item id in trigger');
          return { itemId: id, uid: acc.user ?? null, isAdmin: !!acc.admin };
        };` } },
      { name: 'guard_sweep', key: 'guard_sweep', type: 'likha_sql', options: sql(
        `WITH ctx AS (
           SELECT ?::uuid AS id, ?::uuid AS uid, ?::boolean AS is_admin
         ), bad AS (
           SELECT id, uid FROM ctx WHERE uid IS NOT NULL AND NOT is_admin
         ), d_slots AS (
           DELETE FROM book_booking_slots s
           USING book_bookings b, bad
           WHERE s.id = bad.id AND b.id = s.booking
             AND NOT (b.customer = bad.uid OR EXISTS (
               SELECT 1 FROM book_tenant_users tu
               WHERE tu.user = bad.uid AND tu.tenant = b.tenant))
           RETURNING s.id
         ), d_pay AS (
           DELETE FROM book_payments s
           USING book_bookings b, bad
           WHERE s.id = bad.id AND b.id = s.booking
             AND NOT (b.customer = bad.uid OR EXISTS (
               SELECT 1 FROM book_tenant_users tu
               WHERE tu.user = bad.uid AND tu.tenant = b.tenant))
           RETURNING s.id
         ), d_proof AS (
           DELETE FROM book_payment_proofs s
           USING book_bookings b, bad
           WHERE s.id = bad.id AND b.id = s.booking
             AND NOT (b.customer = bad.uid OR EXISTS (
               SELECT 1 FROM book_tenant_users tu
               WHERE tu.user = bad.uid AND tu.tenant = b.tenant))
           RETURNING s.id
         ), d_photos AS (
           DELETE FROM book_court_photos ph
           USING book_courts c, bad
           WHERE ph.id = bad.id AND c.id = ph.court
             AND NOT EXISTS (
               SELECT 1 FROM book_tenant_users tu
               WHERE tu.user = bad.uid AND tu.tenant = c.tenant)
           RETURNING ph.id
         )
         SELECT (SELECT count(*) FROM d_slots) AS slots,
                (SELECT count(*) FROM d_pay) AS payments,
                (SELECT count(*) FROM d_proof) AS proofs,
                (SELECT count(*) FROM d_photos) AS photos`,
        [T('guard_ctx.itemId'), T('guard_ctx.uid'), T('guard_ctx.isAdmin')]) },
    ],
  },
];

async function main() {
  const existing = await api('GET', '/flows?limit=-1&fields=id,name');
  const byName = new Map(existing.map((f) => [f.name, f.id]));
  for (const spec of FLOWS) {
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
