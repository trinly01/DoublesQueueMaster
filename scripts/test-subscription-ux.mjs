/**
 * Customer-visibility simulation for the tenant subscription lifecycle.
 * Exercises UNAUTHENTICATED (public-role) reads — exactly what a guest or
 * logged-in customer sees on /book — through every subscription state:
 *   trialing+active → past_due (grace) → suspended (lapsed) → reactivated
 *   + court-level inactive under an active tenant (downgrade overflow)
 * Cleans up all fixtures. Usage: node scripts/test-subscription-ux.mjs
 */
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* .env optional — vars may come from the shell */ }
const ADMIN = process.env.BOOKING_ADMIN_TOKEN;
if (!ADMIN) throw new Error('BOOKING_ADMIN_TOKEN is not set — copy .env.example to .env and fill it in');
const BASE = 'https://api.dinkmatch.club';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// admin writes; guest reads with NO token → public role
async function api(method, path, body, auth = ADMIN) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(auth ? { Authorization: auth } : {}), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json?.data ?? json };
}
async function must(method, path, body, auth) {
  const r = await api(method, path, body, auth);
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
}
// what the /book frontend actually queries as a guest
const guestVenue = (slug) => api('GET',
  `/items/book_tenants?filter[slug][_eq]=${slug}&fields=id,name,slug,status&limit=1`, null, null);
const guestCourts = (tid) => api('GET',
  `/items/book_courts?filter[tenant][_eq]=${tid}&fields=id,name,status&limit=-1`, null, null);

const cleanup = { tenants: [], courts: [] };

try {
  const ts = Date.now();
  const t = await must('POST', '/items/book_tenants', {
    name: 'UX Sim Venue', slug: `ux-sim-${ts}`, status: 'active',
    subscription_plan: 'trial', subscription_status: 'trialing',
    subscription_renews_at: '2030-01-01', max_courts: 5,
    contact_phone: '0917 123 4567',
  });
  cleanup.tenants.push(t.id);
  const c1 = await must('POST', '/items/book_courts', { tenant: t.id, name: 'UX Court A', price_per_hour: 500 });
  const c2 = await must('POST', '/items/book_courts', { tenant: t.id, name: 'UX Court B', price_per_hour: 500 });
  cleanup.courts.push(c1.id, c2.id);

  // S1 — trialing + active: fully visible
  let v = await guestVenue(t.slug);
  ok('S1 trial/active: venue visible to guest', v.status === 200 && v.data.length === 1);
  ok('S1: court list visible', (await guestCourts(t.id)).data.length === 2);

  // S2 — past_due within grace (subscription_status only; status stays active)
  await must('PATCH', `/items/book_tenants/${t.id}`, { subscription_status: 'past_due' });
  await sleep(400);
  v = await guestVenue(t.slug);
  ok('S2 past_due grace: venue STILL visible (still bookable)', v.data.length === 1, `rows=${v.data.length}`);

  // S3 — lapsed: billing_grace_sweeper equivalent → status=suspended.
  // Venue row stays READABLE (status=suspended) so /book shows
  // "temporarily unavailable"; courts/slots/payments stay hidden.
  await must('PATCH', `/items/book_tenants/${t.id}`, { status: 'suspended', suspension_reason: 'billing' });
  await sleep(400);
  v = await guestVenue(t.slug);
  const courts = await guestCourts(t.id);
  ok('S3 suspended: venue readable w/ status=suspended (→ "unavailable" UI)',
    v.data.length === 1 && v.data[0].status === 'suspended', `rows=${v.data.length} status=${v.data[0]?.status}`);
  ok('S3 suspended: courts still hidden (nothing bookable)', courts.data.length === 0, `rows=${courts.data.length}`);

  // S4 — reactivate: everything back
  await must('PATCH', `/items/book_tenants/${t.id}`, { status: 'active', suspension_reason: null, subscription_status: 'active' });
  await sleep(400);
  v = await guestVenue(t.slug);
  ok('S4 reactivated: venue visible again', v.data.length === 1);

  // S5 — active tenant, ONE court inactivated (downgrade overflow)
  await must('PATCH', `/items/book_courts/${c2.id}`, { status: 'inactive' });
  await sleep(400);
  const cs = await guestCourts(t.id);
  ok('S5 court inactive: venue still visible', (await guestVenue(t.slug)).data.length === 1);
  ok('S5: only active court offered (1 of 2)', cs.data.length === 1 && cs.data[0].name === 'UX Court A',
    `courts=${cs.data.map((c) => c.name).join(',')}`);

  // S6 — pending tenant (never launched): hidden entirely
  const tp = await must('POST', '/items/book_tenants', {
    name: 'UX Pending Venue', slug: `ux-pend-${ts}`, status: 'pending',
    subscription_plan: 'trial', subscription_status: 'trialing',
  });
  cleanup.tenants.push(tp.id);
  v = await guestVenue(tp.slug);
  ok('S6 pending: venue hidden from guests', v.data.length === 0, `rows=${v.data.length}`);

} finally {
  for (const id of cleanup.courts) await api('DELETE', `/items/book_courts/${id}`).catch(() => {});
  for (const id of cleanup.tenants) await api('DELETE', `/items/book_tenants/${id}`).catch(() => {});
  console.log(`\ncleanup: ${cleanup.courts.length}c ${cleanup.tenants.length}t`);
}
console.log(`\n===== RESULT: ${pass} PASS, ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
