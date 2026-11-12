/**
 * Verify subscription-plan enforcement end-to-end (admin token):
 *   court_limit_guard · plan_change_enforcer · subscription_lapse_guard
 *   · slot_init court/tenant status gate
 * Cleans up all fixtures. Usage: node scripts/test-plan-enforcement.mjs
 */
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* .env optional — vars may come from the shell */ }
const ADMIN = process.env.BOOKING_ADMIN_TOKEN;
if (!ADMIN) throw new Error('BOOKING_ADMIN_TOKEN is not set — copy .env.example to .env and fill it in');
const BASE = 'https://api.dinkmatch.club';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: ADMIN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json?.data ?? json };
}
async function must(method, path, body) {
  const r = await api(method, path, body);
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
}
async function waitFor(fn, tries = 20, ms = 500) {
  for (let i = 0; i < tries; i++) { const v = await fn(); if (v) return v; await sleep(ms); }
  return null;
}

const cleanup = { tenants: [], courts: [], bookings: [], slots: [] };

try {
  const ts = Date.now();

  // ---- 1. court_limit_guard: max_courts=1 → 2nd court inactive ----
  const t1 = await must('POST', '/items/book_tenants', {
    name: 'PE Cap Venue', slug: `pe-cap-${ts}`, status: 'active',
    subscription_plan: 'starter', max_courts: 1, subscription_status: 'active',
  });
  cleanup.tenants.push(t1.id);
  const c1 = await must('POST', '/items/book_courts', { tenant: t1.id, name: 'PE C1', price_per_hour: 100 });
  cleanup.courts.push(c1.id);
  const c2 = await must('POST', '/items/book_courts', { tenant: t1.id, name: 'PE C2', price_per_hour: 100 });
  cleanup.courts.push(c2.id);
  const c2final = await waitFor(async () => {
    const c = await must('GET', `/items/book_courts/${c2.id}?fields=status`);
    return c.status === 'inactive' ? c : null;
  });
  ok('court_limit: 2nd court inactivated over max_courts=1', !!c2final, `status=${(await must('GET', `/items/book_courts/${c2.id}?fields=status`)).status}`);
  const c1final = await must('GET', `/items/book_courts/${c1.id}?fields=status`);
  ok('court_limit: 1st court stays active', c1final.status === 'active');

  // ---- 2. plan_change_enforcer: raise cap to 3 → nothing changes; then 3 courts on uncapped tenant → cap to 2 ----
  const t2 = await must('POST', '/items/book_tenants', {
    name: 'PE Down Venue', slug: `pe-down-${ts}`, status: 'active',
    subscription_plan: 'business', subscription_status: 'active',
  });
  cleanup.tenants.push(t2.id);
  const dc = [];
  for (let i = 0; i < 3; i++) {
    const c = await must('POST', '/items/book_courts', { tenant: t2.id, name: `PE D${i}`, price_per_hour: 100 });
    dc.push(c.id); cleanup.courts.push(c.id);
  }
  await sleep(800); // let limit guard settle (max_courts null → no-op)
  await must('PATCH', `/items/book_tenants/${t2.id}`, { max_courts: 2 });
  const dstatuses = await waitFor(async () => {
    const rows = await must('GET', `/items/book_courts?filter[tenant][_eq]=${t2.id}&fields=id,status&sort=seq`);
    const inact = rows.filter((r) => r.status === 'inactive').length;
    return inact >= 1 ? rows : null;
  });
  ok('plan_change: excess court inactivated on downgrade', !!dstatuses);
  if (dstatuses) {
    const active = dstatuses.filter((r) => r.status !== 'inactive');
    ok('plan_change: earliest courts keep active (2 of 3)', active.length === 2, `active=${active.length}`);
  }

  // ---- 3. subscription_lapse_guard: cancelled → suspended/billing; active → reactivate ----
  await must('PATCH', `/items/book_tenants/${t1.id}`, { subscription_status: 'cancelled' });
  const sus = await waitFor(async () => {
    const t = await must('GET', `/items/book_tenants/${t1.id}?fields=status,suspension_reason`);
    return t.status === 'suspended' ? t : null;
  });
  ok('lapse: cancelled → status suspended', !!sus);
  ok('lapse: suspension_reason = billing', sus?.suspension_reason === 'billing', `reason=${sus?.suspension_reason}`);

  await must('PATCH', `/items/book_tenants/${t1.id}`, { subscription_status: 'active' });
  const react = await waitFor(async () => {
    const t = await must('GET', `/items/book_tenants/${t1.id}?fields=status,suspension_reason`);
    return t.status === 'active' ? t : null;
  });
  ok('lapse: reactivated on active subscription', !!react);
  ok('lapse: suspension_reason cleared', react?.suspension_reason == null, `reason=${react?.suspension_reason}`);

  // manual suspension must NOT auto-lift
  await must('PATCH', `/items/book_tenants/${t1.id}`, { status: 'suspended', suspension_reason: 'manual' });
  await sleep(800);
  const man = await must('GET', `/items/book_tenants/${t1.id}?fields=status,suspension_reason`);
  ok('lapse: manual suspension untouched by subscription sync', man.status === 'suspended' && man.suspension_reason === 'manual');

  // ---- 4. slot_init gate: booking on suspended-venue court → slot cancelled ----
  // t1 is suspended(manual); c1 is its active court
  const bk = await must('POST', '/items/book_bookings', { customer_name: 'PE Guest', source: 'app' });
  cleanup.bookings.push(bk.id);
  const slot = await must('POST', '/items/book_booking_slots', {
    booking: bk.id, court: c1.id, date: '2030-01-01', start_time: '10:00', end_time: '11:00',
  });
  cleanup.slots.push(slot.id);
  const slotFinal = await waitFor(async () => {
    const s = await must('GET', `/items/book_booking_slots/${slot.id}?fields=status`);
    return s.status === 'cancelled' ? s : null;
  });
  ok('slot gate: suspended venue → slot cancelled', !!slotFinal, `status=${(await must('GET', `/items/book_booking_slots/${slot.id}?fields=status`)).status}`);

  // reactivate venue → same court bookable again (held)
  await must('PATCH', `/items/book_tenants/${t1.id}`, { status: 'active', suspension_reason: null });
  await sleep(500);
  const bk2 = await must('POST', '/items/book_bookings', { customer_name: 'PE Guest2', source: 'app' });
  cleanup.bookings.push(bk2.id);
  const slot2 = await must('POST', '/items/book_booking_slots', {
    booking: bk2.id, court: c1.id, date: '2030-01-02', start_time: '10:00', end_time: '11:00',
  });
  cleanup.slots.push(slot2.id);
  const slot2Final = await waitFor(async () => {
    const s = await must('GET', `/items/book_booking_slots/${slot2.id}?fields=status`);
    return s.status === 'held' || s.status === 'confirmed' ? s : null;
  }, 10, 400);
  ok('slot gate: reactivated venue → slot held (bookable)', !!slot2Final,
    `status=${(await must('GET', `/items/book_booking_slots/${slot2.id}?fields=status`)).status}`);

} finally {
  for (const id of cleanup.slots) await api('DELETE', `/items/book_booking_slots/${id}`).catch(() => {});
  for (const id of cleanup.bookings) await api('DELETE', `/items/book_bookings/${id}`).catch(() => {});
  for (const id of cleanup.courts) await api('DELETE', `/items/book_courts/${id}`).catch(() => {});
  for (const id of cleanup.tenants) await api('DELETE', `/items/book_tenants/${id}`).catch(() => {});
  console.log(`\ncleanup: ${cleanup.slots.length}s ${cleanup.bookings.length}b ${cleanup.courts.length}c ${cleanup.tenants.length}t`);
}
console.log(`\n===== RESULT: ${pass} PASS, ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
