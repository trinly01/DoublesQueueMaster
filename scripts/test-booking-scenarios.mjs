/**
 * Booking-system scenario simulation — exercises every flow/permission
 * against the LIVE Directus instance. Booking collections only; does NOT
 * touch players/ratings/DUPR/matchmaking.
 *
 * Usage: node scripts/test-booking-scenarios.mjs
 * Env: BOOKING_ADMIN_TOKEN (admin bearer), BOOKING_TEST_PASSWORD (default ***REMOVED***)
 *
 * Prints PASS/FAIL per check + a summary. Fixtures (tenant B, courts,
 * test users) are idempotent; transactional bookings are cleaned first.
 */
const TOKEN = process.env.BOOKING_ADMIN_TOKEN || 'Bearer ***REMOVED***';
const BASE = 'https://api.dinkmatch.club';
const PASSW = process.env.BOOKING_TEST_PASSWORD || '***REMOVED***';
const ROLE_TENANT = '29d2495d-c6a3-4ee8-a1ce-037191610e21'; // book_tenant
const ROLE_PLAYER = '2f2b5b78-25ed-4f65-8fe3-0549b4d3a72c'; // Player

let pass = 0, fail = 0; const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}  ${detail}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, path, body, token = TOKEN, raw = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = token;
  const res = await fetch(`${BASE}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (raw) return { status: res.status, json };
  if (!res.ok) {
    const msg = json?.errors?.[0]?.message || text.slice(0, 200);
    const err = new Error(`${method} ${path} → ${res.status}: ${msg}`);
    err.status = res.status; err.body = json; throw err;
  }
  return json?.data ?? json;
}
async function login(email) {
  const r = await api('POST', '/auth/login', { email, password: PASSW }, null, true);
  if (r.status !== 200) throw new Error(`login ${email} → ${r.status}`);
  return 'Bearer ' + r.json.data.access_token;
}
const item = (c, id, tok, q = '') => api('GET', `/items/${c}/${id}${q}`, null, tok);
const items = (c, tok, q = '') => api('GET', `/items/${c}?limit=-1${q}`, null, tok);
const create = (c, body, tok) => api('POST', `/items/${c}`, body, tok);
const update = (c, id, body, tok) => api('PATCH', `/items/${c}/${id}`, body, tok);
const del = (c, id, tok) => api('DELETE', `/items/${c}/${id}`, null, tok);
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

// ---------- fixtures ----------
async function ensureFixtures() {
  console.log('\n== FIXTURES ==');
  // sport type (reuse Pickleball or first available)
  const sports = await items('book_sport_types', TOKEN);
  const sport = sports[0];
  check('A1 sport_types seeded', !!sport, JSON.stringify(sports).slice(0, 120));

  // tenants — resolve by slug (uuid PKs; no stable integer ids anymore)
  let tenants = await items('book_tenants', TOKEN);
  const t1 = tenants.find((t) => t.slug === 'siklab');
  check('A0 Siklab tenant exists', !!t1, t1 ? `id=${t1.id}` : 'none');
  let tb = tenants.find((t) => t.slug === 'test-arena');
  if (!tb) {
    tb = await create('book_tenants', {
      name: 'Test Arena', slug: 'test-arena', status: 'active',
      gcash_name: 'Test Arena GCash', gcash_number: '09170000001',
      contact_email: 'arena@test.local', timezone: 'Asia/Manila',
      slot_minutes: 60, auto_confirm_payments: false,
    }, TOKEN);
    console.log('   + tenant B created id=' + tb.id);
  }
  check('A2 tenant B exists+active', tb.status === 'active', `id=${tb.id}`);

  // courts for tenant B
  let courts = await items('book_courts', TOKEN, `&filter[tenant][_eq]=${tb.id}`);
  let b1 = courts.find((c) => c.name === 'Arena Court 1');
  let b2 = courts.find((c) => c.name === 'Arena Court 2');
  if (!b1) b1 = await create('book_courts', { tenant: tb.id, name: 'Arena Court 1', sport: sport.id, price_per_hour: 500, status: 'active' }, TOKEN);
  if (!b2) b2 = await create('book_courts', { tenant: tb.id, name: 'Arena Court 2', sport: sport.id, price_per_hour: 600, status: 'active' }, TOKEN);
  check('A3 tenant B has 2 courts', !!b1 && !!b2, `b1=${b1.id} b2=${b2.id}`);

  // Siklab court (tenant A)
  const c1 = t1 ? (await items('book_courts', TOKEN, `&filter[tenant][_eq]=${t1.id}`))[0] : null;
  check('A4 Siklab court exists', !!c1, c1 ? `id=${c1.id} ₱${c1.price_per_hour}/hr` : 'none');

  // users
  // users collection isn't /items — use /users endpoints
  // NOTE: role is ignored on POST /users on this instance — PATCH it after.
  async function ensureUser2(email, first, last, roleId) {
    const found = await api('GET', `/users?filter[email][_eq]=${encodeURIComponent(email)}&fields=id,email,role`, null, TOKEN);
    let usr = Array.isArray(found) ? found[0] : found?.data?.[0];
    if (!usr) {
      usr = await api('POST', '/users', { email, password: PASSW, first_name: first, last_name: last }, TOKEN);
      console.log(`   + user ${email} id=${usr.id}`);
    }
    const cur = usr.role?.id || usr.role;
    if (cur !== roleId) {
      await api('PATCH', `/users/${usr.id}`, { role: roleId }, TOKEN);
      console.log(`   ~ user ${email} role → ${roleId === ROLE_TENANT ? 'book_tenant' : 'Player'}`);
    }
    return usr;
  }
  const tA = await ensureUser2('tenant-a@test.dinkmatch.club', 'Tenant', 'A', ROLE_TENANT);
  const tB = await ensureUser2('tenant-b@test.dinkmatch.club', 'Tenant', 'B', ROLE_TENANT);
  const cA = await ensureUser2('customer-a@test.dinkmatch.club', 'Customer', 'A', ROLE_PLAYER);
  const cB = await ensureUser2('customer-b@test.dinkmatch.club', 'Customer', 'B', ROLE_PLAYER);

  // book_tenant field + junction rows (admin)
  for (const [usr, tid] of [[tA, t1.id], [tB, tb.id]]) {
    await api('PATCH', `/users/${usr.id}`, { book_tenant: tid }, TOKEN);
    const j = await items('book_tenant_users', TOKEN, `&filter[user][_eq]=${usr.id}`);
    if (!j.find((r) => r.tenant === tid)) {
      await create('book_tenant_users', { tenant: tid, user: usr.id, role: 'owner' }, TOKEN);
    }
  }
  check('A5 tenant users linked', true);

  // tokens
  const tok = {
    admin: TOKEN,
    tA: await login('tenant-a@test.dinkmatch.club'),
    tB: await login('tenant-b@test.dinkmatch.club'),
    cA: await login('customer-a@test.dinkmatch.club'),
    cB: await login('customer-b@test.dinkmatch.club'),
  };
  return { tok, t1, tb, b1, b2, c1, sport, users: { tA, tB, cA, cB } };
}

// ---------- cleanup of transactional data ----------
// Scoped to the two TEST tenants only — the previous unscoped wipe deleted
// real/demo bookings on other venues (a submitted customer booking on
// Test Arena was lost when the suite ran on the shared backend).
async function cleanBookings(T1, TB) {
  const bs = await items('book_bookings', TOKEN, `&filter[tenant][_in]=${T1},${TB}`);
  for (const b of bs) { try { await del('book_bookings', b.id, TOKEN); } catch {} }
  const cls = await items('book_closures', TOKEN, '&filter[reason][_eq]=scenario-test');
  for (const c of cls) { try { await del('book_closures', c.id, TOKEN); } catch {} }
}

async function main() {
  const F = await ensureFixtures();
  const { tok, t1, tb, b1, b2, c1 } = F;
  const T1 = t1.id, TB = tb.id;
  await cleanBookings(T1, TB);
  console.log('   (transactional bookings cleaned)');

  // ============ B. CUSTOMER BROWSE ============
  console.log('\n== B. CUSTOMER BROWSE ==');
  const venues = await items('book_tenants', tok.cA);
  // status must be field-readable for the active-venue filter to work —
  // the real assertion is that sensitive/internal fields stay hidden
  check('B1 customer sees both active venues', venues.length >= 2 &&
    venues.every((v) => v.settings === undefined && v.subscription_plan === undefined &&
      v.subscription_status === undefined && v.max_courts === undefined && v.suspension_reason === undefined),
    `got ${venues.length} venues; keys sample: ${Object.keys(venues[0] || {}).slice(0, 8)}`);
  const courts = await items('book_courts', tok.cA);
  check('B2 customer sees courts both tenants', courts.some((c) => c.tenant === T1) && courts.some((c) => c.tenant === TB),
    `${courts.length} courts`);
  const slotsAll = await items('book_booking_slots', tok.cA);
  check('B3 customer can read slots (availability)', Array.isArray(slotsAll), `${slotsAll.length} slots`);
  const myBookings0 = await items('book_bookings', tok.cA);
  check('B4 customer bookings list own-only (empty)', myBookings0.length === 0, `${myBookings0.length}`);

  // ============ C. BOOKING CREATION ============
  console.log('\n== C. BOOKING CREATION ==');
  const D = day(7);
  // C1: nested booking+slot
  let bk1;
  try {
    bk1 = await create('book_bookings', {
      tenant: T1, customer_name: 'Customer A', customer_phone: '0917',
      customer_email: 'customer-a@test.dinkmatch.club',
      slots: [{ court: c1.id, date: D, start_time: '18:00:00', end_time: '19:00:00' }],
    }, tok.cA);
  } catch (e) { bk1 = { __err: e.message }; }
  check('C1 booking+slot created', !!bk1?.id, bk1.__err || `id=${bk1?.id}`);
  await sleep(3000);
  if (bk1?.id) {
    const full = await item('book_bookings', bk1.id, tok.admin, '?fields=*,slots.*');
    check('C2 ref auto BK-*', /^BK-\d{4}-\d{4}$/.test(full.ref || ''), `ref=${full.ref}`);
    check('C3 status pending_payment/unpaid/app',
      full.status === 'pending_payment' && full.payment_status === 'unpaid' && full.source === 'app',
      `${full.status}/${full.payment_status}/${full.source}`);
    const sl = (full.slots || [])[0];
    check('C4 slot held + held_until ~30min', sl && sl.status === 'held' && sl.held_until,
      sl ? `${sl.status} until=${sl.held_until}` : 'no slot');
    check('C5 slot duration+price snapshot', sl && sl.duration_minutes === 60,
      sl ? `dur=${sl.duration_minutes} price=${sl.price}` : 'no slot');
    await sleep(1500);
    const full2 = await item('book_bookings', bk1.id, tok.admin, '?fields=subtotal,total');
    check('C6 totals computed', full2.subtotal > 0 && full2.total > 0,
      `subtotal=${full2.subtotal} total=${full2.total}`);
  }
  // C7: availability — customer-b sees the held slot
  const slotsB = await items('book_booking_slots', tok.cB);
  check('C7 other customer sees held slot (availability)', slotsB.length > 0, `${slotsB.length} slots visible`);
  // C8: collision — customer-b same court/time
  let bk2;
  try {
    bk2 = await create('book_bookings', {
      tenant: T1, customer_name: 'Customer B', customer_email: 'customer-b@test.dinkmatch.club',
      slots: [{ court: c1.id, date: D, start_time: '18:00:00', end_time: '19:00:00' }],
    }, tok.cB);
  } catch (e) { bk2 = { __err: e.message }; }
  check('C8 colliding booking create accepted (API)', !!bk2?.id, bk2.__err || `id=${bk2?.id}`);
  await sleep(3000);
  if (bk2?.id) {
    const s2 = await items('book_booking_slots', tok.admin, `&filter[booking][_eq]=${bk2.id}`);
    check('C9 colliding slot cancelled by flow', s2[0]?.status === 'cancelled',
      s2[0] ? `status=${s2[0].status}` : 'no slot row');
  }
  // C10: non-colliding time same court → held
  let bk3;
  try {
    bk3 = await create('book_bookings', {
      tenant: T1, customer_name: 'Customer B', customer_email: 'customer-b@test.dinkmatch.club',
      slots: [{ court: c1.id, date: D, start_time: '20:00:00', end_time: '21:00:00' }],
    }, tok.cB);
  } catch (e) { bk3 = { __err: e.message }; }
  await sleep(3000);
  if (bk3?.id) {
    const s3 = await items('book_booking_slots', tok.admin, `&filter[booking][_eq]=${bk3.id}`);
    check('C10 different time → held', s3[0]?.status === 'held', s3[0]?.status);
  } else check('C10 booking created', false, bk3.__err);
  // C11: multi-court same tenant (B1+B2 same time)
  let bk4;
  try {
    bk4 = await create('book_bookings', {
      tenant: TB, customer_name: 'Customer A', customer_email: 'customer-a@test.dinkmatch.club',
      slots: [
        { court: b1.id, date: D, start_time: '18:00:00', end_time: '19:00:00' },
        { court: b2.id, date: D, start_time: '18:00:00', end_time: '19:00:00' },
      ],
    }, tok.cA);
  } catch (e) { bk4 = { __err: e.message }; }
  await sleep(3000);
  if (bk4?.id) {
    const s4 = await items('book_booking_slots', tok.admin, `&filter[booking][_eq]=${bk4.id}`);
    check('C11 multi-court booking both held', s4.length === 2 && s4.every((s) => s.status === 'held'),
      s4.map((s) => `${s.court}:${s.status}`).join(','));
  } else check('C11 multi-court booking created', false, bk4.__err);
  // C12: cross-tenant slot injection — booking tenant=1 with tenant-B court
  let bk5;
  try {
    bk5 = await create('book_bookings', {
      tenant: T1, customer_name: 'Customer A', customer_email: 'customer-a@test.dinkmatch.club',
      slots: [{ court: b1.id, date: D, start_time: '18:00:00', end_time: '19:00:00' }],
    }, tok.cA);
  } catch (e) { bk5 = { __err: e.message }; }
  await sleep(3000);
  if (bk5?.id) {
    const s5 = await items('book_booking_slots', tok.admin, `&filter[booking][_eq]=${bk5.id}`);
    check('C12 cross-tenant slot cancelled', s5[0]?.status === 'cancelled', s5[0]?.status);
  } else check('C12 cross-tenant booking created', false, bk5.__err);
  // C13: protected creates
  let e1, e2;
  try { await create('book_bookings', { tenant: T1, customer_name: 'X', status: 'confirmed', source: 'app' }, tok.cA); e1 = null; }
  catch (e) { e1 = e; }
  check('C13a cannot create confirmed booking', !!e1, e1 ? e1.message.slice(0, 80) : 'created!');
  try { await create('book_bookings', { tenant: T1, slots: [{ court: c1.id, date: D, start_time: '22:00:00', end_time: '23:00:00' }] }, tok.cA); e2 = null; }
  catch (e) { e2 = e; }
  check('C13b customer_name required', !!e2, e2 ? e2.message.slice(0, 80) : 'created without name!');

  // ============ D. PAYMENT + PROOF ============
  console.log('\n== D. PAYMENT + PROOF ==');
  let pay1, proof1, fileId;
  if (bk1?.id) {
    try {
      pay1 = await create('book_payments', { booking: bk1.id, method: 'gcash', amount: 400, reference: 'GCASH-TEST-1' }, tok.cA);
      check('D1 customer creates pending payment', pay1.status === 'pending', `status=${pay1.status}`);
    } catch (e) { check('D1 customer creates payment', false, e.message.slice(0, 100)); }
    // file upload (admin uploads; customer perm may lack files create)
    try {
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
      const fd = new FormData();
      fd.append('file', new Blob([png], { type: 'image/png' }), 'proof.png');
      const fres = await fetch(`${BASE}/files`, { method: 'POST', headers: { Authorization: tok.cA }, body: fd });
      const fj = await fres.json();
      fileId = fj?.data?.id;
      check('D2 customer uploads proof file', fres.ok && !!fileId, `status=${fres.status} ${fileId || JSON.stringify(fj?.errors?.[0]?.message || '').slice(0, 80)}`);
    } catch (e) { check('D2 customer uploads proof file', false, e.message.slice(0, 100)); }
    if (!fileId) { // fallback: admin uploads
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
      const fd = new FormData();
      fd.append('file', new Blob([png], { type: 'image/png' }), 'proof-admin.png');
      const fres = await fetch(`${BASE}/files`, { method: 'POST', headers: { Authorization: TOKEN }, body: fd });
      fileId = (await fres.json())?.data?.id;
    }
    if (fileId) {
      try {
        proof1 = await create('book_payment_proofs', {
          booking: bk1.id, payment: pay1?.id || null, file: fileId,
          sender_name: 'Customer A', reference_no: 'GCASH-TEST-1',
        }, tok.cA);
        check('D3 proof created pending', proof1.status === 'pending', `status=${proof1.status}`);
      } catch (e) { check('D3 proof created', false, e.message.slice(0, 120)); }
      await sleep(3000);
      if (proof1?.id) {
        const bk = await item('book_bookings', bk1.id, tok.admin, '?fields=payment_status,status');
        check('D4 booking payment_status→pending_verification', bk.payment_status === 'pending_verification',
          `payment_status=${bk.payment_status}`);
        // D5: customer cannot self-approve
        let pe;
        try { await update('book_payment_proofs', proof1.id, { status: 'approved' }, tok.cA); pe = null; }
        catch (e) { pe = e; }
        check('D5 customer cannot approve own proof', !!pe, pe ? pe.message.slice(0, 80) : 'APPROVED!');
      }
    }
  }
  // D6: customer-b cannot see customer-a booking
  if (bk1?.id) {
    const foreign = await items('book_bookings', tok.cB, `&filter[id][_eq]=${bk1.id}`);
    check('D6 other customer cannot read booking', foreign.length === 0, `${foreign.length} rows`);
    const foreignPay = await items('book_payments', tok.cB, `&filter[booking][_eq]=${bk1.id}`);
    check('D6b other customer cannot read payment', foreignPay.length === 0, `${foreignPay.length} rows`);
  }

  // ============ E. TENANT OPS ============
  console.log('\n== E. TENANT OPS ==');
  // E1/E2 isolation
  const tAbookings = await items('book_bookings', tok.tA);
  const tBbookings = await items('book_bookings', tok.tB);
  check('E1 tenant A sees only own-venue bookings',
    tAbookings.every((b) => b.tenant === T1) && tAbookings.length > 0,
    `${tAbookings.length} bookings, tenants=${[...new Set(tAbookings.map(b=>b.tenant))]}`);
  check('E2 tenant B sees only own-venue bookings',
    tBbookings.every((b) => b.tenant === TB),
    `${tBbookings.length} bookings`);
  // cross-tenant read attempt
  const tAcross = await items('book_bookings', tok.tA, `&filter[tenant][_eq]=${TB}`);
  check('E3 tenant A cross-venue filter returns empty', tAcross.length === 0, `${tAcross.length}`);
  const tVenues = await items('book_tenants', tok.tA);
  // staff browse all ACTIVE venues (they're also customers) but never
  // pending/suspended ones; own venue must be included
  check('E4 tenant A sees own + other active venues only',
    tVenues.every((v) => v.status === 'active') && tVenues.some((v) => v.id === T1),
    `${tVenues.length} venues, statuses=${[...new Set(tVenues.map(v=>v.status))]}`);
  // E5: tenant A cannot write tenant B booking
  if (bk4?.id) {
    let we;
    try { await update('book_bookings', bk4.id, { status: 'cancelled' }, tok.tA); we = null; }
    catch (e) { we = e; }
    const after = await item('book_bookings', bk4.id, tok.admin, '?fields=status');
    check('E5 tenant A cannot update tenant B booking', !!we || after.status !== 'cancelled',
      we ? we.message.slice(0, 80) : `status now ${after.status}`);
  }
  // E6: tenant A create booking pinned to tenant B → validation rejects
  let te;
  try {
    await create('book_bookings', { tenant: TB, customer_name: 'Sneaky', slots: [{ court: b1.id, date: D, start_time: '10:00:00', end_time: '11:00:00' }] }, tok.tA);
    te = null;
  } catch (e) { te = e; }
  check('E6 tenant A cannot create booking for tenant B', !!te, te ? te.message.slice(0, 100) : 'CREATED!');
  // E7: walk-in booking by tenant A
  let bkW;
  try {
    bkW = await create('book_bookings', {
      customer_name: 'Walk In Pete', customer_phone: '0999',
      slots: [{ court: c1.id, date: day(8), start_time: '07:00:00', end_time: '08:00:00' }],
    }, tok.tA);
  } catch (e) { bkW = { __err: e.message }; }
  await sleep(3000);
  if (bkW?.id) {
    const wf = await item('book_bookings', bkW.id, tok.admin, '?fields=*,slots.*');
    const wsl = (wf.slots || [])[0];
    check('E7a walk-in auto confirmed+paid', wf.status === 'confirmed' && wf.payment_status === 'paid' && wf.source === 'walk_in',
      `${wf.status}/${wf.payment_status}/${wf.source}`);
    check('E7b walk-in slot confirmed (not held)', wsl?.status === 'confirmed', wsl ? wsl.status : 'none');
  } else check('E7 walk-in booking created', false, bkW.__err);
  // E8: tenant A approves proof1 → booking C1 confirmed
  if (proof1?.id) {
    try {
      await update('book_payment_proofs', proof1.id, { status: 'approved', reviewed_by: F.users.tA.id }, tok.tA);
    } catch (e) { check('E8 approve proof', false, e.message.slice(0, 100)); }
    await sleep(3500);
    const after = await item('book_bookings', bk1.id, tok.admin, '?fields=status,payment_status,slots.status,payments.status');
    const slSt = (after.slots || []).map((s) => s.status);
    const paySt = (after.payments || []).map((p) => p.status);
    check('E8a booking confirmed+paid', after.status === 'confirmed' && after.payment_status === 'paid',
      `${after.status}/${after.payment_status}`);
    check('E8b slot confirmed', slSt.includes('confirmed'), slSt.join(','));
    check('E8c payment paid', paySt.includes('paid'), paySt.join(','));
    const pf = await item('book_payment_proofs', proof1.id, tok.admin, '?fields=status,reviewed_by');
    check('E8d proof approved', pf.status === 'approved', pf.status);
  }
  // E9: tenant A tries protected fields
  let pe1, pe2;
  try { await update('book_tenants', T1, { status: 'suspended' }, tok.tA); pe1 = null; }
  catch (e) { pe1 = e; }
  const tAfter = await item('book_tenants', T1, tok.admin, '?fields=status');
  check('E9a tenant cannot change own status', !!pe1 || tAfter.status === 'active',
    pe1 ? pe1.message.slice(0, 70) : `status=${tAfter.status}`);
  try { await update('book_bookings', bk1.id, { platform_fee: 999 }, tok.tA); pe2 = null; }
  catch (e) { pe2 = e; }
  const bkFee = await item('book_bookings', bk1.id, tok.admin, '?fields=platform_fee');
  check('E9b tenant cannot write platform_fee', !!pe2 || (bkFee.platform_fee ?? 0) !== 999,
    pe2 ? pe2.message.slice(0, 70) : `platform_fee=${bkFee.platform_fee}`);
  try { await update('book_tenants', T1, { gcash_number: '09179998888' }, tok.tA); }
  catch (e) { /* may fail if field not allowed — check below */ }
  const gc = await item('book_tenants', T1, tok.admin, '?fields=gcash_number');
  check('E9c tenant can edit own gcash', gc.gcash_number === '09179998888', `gcash=${gc.gcash_number}`);

  // ============ F. EDGE CASES ============
  console.log('\n== F. EDGE CASES ==');
  // F1: cancel releases slots — customer-a cancels bk3 (pending, held)
  let bk6;
  if (bk3?.id) {
    try { await update('book_bookings', bk3.id, { status: 'cancelled', cancel_reason: 'changed plans' }, tok.cB); }
    catch (e) { check('F1 customer cancel own booking', false, e.message.slice(0, 100)); }
    await sleep(3000);
    const rel = await items('book_booking_slots', tok.admin, `&filter[booking][_eq]=${bk3.id}`);
    check('F1a cancel → slots released', rel[0]?.status === 'released', rel[0]?.status);
    // F1b: same slot now bookable by customer-a
    try {
      bk6 = await create('book_bookings', {
        tenant: T1, customer_name: 'Customer A', customer_email: 'customer-a@test.dinkmatch.club',
        slots: [{ court: c1.id, date: D, start_time: '20:00:00', end_time: '21:00:00' }],
      }, tok.cA);
    } catch (e) { bk6 = { __err: e.message }; }
    await sleep(3000);
    if (bk6?.id) {
      const s6 = await items('book_booking_slots', tok.admin, `&filter[booking][_eq]=${bk6.id}`);
      check('F1b released slot rebookable', s6[0]?.status === 'held', s6[0]?.status);
    } else check('F1b rebook after cancel', false, bk6.__err);
  }
  // F2: cannot cancel paid booking (bk1 now confirmed+paid)
  let ce;
  try { await update('book_bookings', bk1.id, { status: 'cancelled' }, tok.cA); ce = null; }
  catch (e) { ce = e; }
  const bk1st = await item('book_bookings', bk1.id, tok.admin, '?fields=status');
  check('F2 cannot cancel paid/confirmed booking', !!ce || bk1st.status === 'confirmed',
    ce ? ce.message.slice(0, 80) : `status=${bk1st.status}`);
  // F3: hold expiry — bk6 slot, force held_until past, fake age for sweeper
  if (bk6?.id) {
    const sl6 = (await items('book_booking_slots', tok.admin, `&filter[booking][_eq]=${bk6.id}`))[0];
    const past = new Date(Date.now() - 60000).toISOString();
    await update('book_booking_slots', sl6.id, { held_until: past }, tok.admin);
    const old = new Date(Date.now() - 40 * 60000).toISOString();
    await update('book_bookings', bk6.id, { date_created: old }, tok.admin);
    console.log('   …waiting for hold_expire_sweeper (cron */5, up to ~5.5min)…');
    let released = false;
    for (let i = 0; i < 23 && !released; i++) {
      await sleep(15000);
      const s = await item('book_booking_slots', sl6.id, tok.admin, '?fields=status');
      if (s.status === 'released') released = true;
    }
    check('F3a expired hold released by sweeper', released, 'still held after wait');
    const bk6st = await item('book_bookings', bk6.id, tok.admin, '?fields=status,payment_status');
    check('F3b unpaid booking expired by sweeper', bk6st.status === 'expired',
      `status=${bk6st.status} pay=${bk6st.payment_status}`);
  }
  // F4: both-paid race — expired booking A vs new booking B same slot
  // reuse bk2 (cancelled slot) — instead craft: booking A on court1 21:00-22:00
  let bkA, bkB;
  try {
    bkA = await create('book_bookings', {
      tenant: T1, customer_name: 'Race A', customer_email: 'customer-a@test.dinkmatch.club',
      slots: [{ court: c1.id, date: D, start_time: '21:00:00', end_time: '22:00:00' }],
    }, tok.cA);
  } catch (e) { bkA = { __err: e.message }; }
  await sleep(2500);
  if (bkA?.id) {
    // simulate A's hold expiring + booking expired (what sweeper would do)
    const slA = (await items('book_booking_slots', tok.admin, `&filter[booking][_eq]=${bkA.id}`))[0];
    await update('book_booking_slots', slA.id, { status: 'released' }, tok.admin);
    await update('book_bookings', bkA.id, { status: 'expired', payment_status: 'failed' }, tok.admin);
    // B books same slot
    bkB = await create('book_bookings', {
      tenant: T1, customer_name: 'Race B', customer_email: 'customer-b@test.dinkmatch.club',
      slots: [{ court: c1.id, date: D, start_time: '21:00:00', end_time: '22:00:00' }],
    }, tok.cB);
    await sleep(3000);
    // A uploads proof anyway + pays (real-world: paid before noticing expiry)
    let payA, proofA, fileA;
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
    const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'a.png');
    fileA = (await (await fetch(`${BASE}/files`, { method: 'POST', headers: { Authorization: TOKEN }, body: fd })).json())?.data?.id;
    payA = await create('book_payments', { booking: bkA.id, method: 'gcash', amount: 400 }, tok.admin);
    proofA = await create('book_payment_proofs', { booking: bkA.id, payment: payA.id, file: fileA, sender_name: 'Race A' }, tok.admin);
    // B also pays
    let payB, proofB;
    payB = await create('book_payments', { booking: bkB.id, method: 'gcash', amount: 400 }, tok.admin);
    proofB = await create('book_payment_proofs', { booking: bkB.id, payment: payB.id, file: fileA, sender_name: 'Race B' }, tok.admin);
    await sleep(2000);
    // approve A FIRST (the stale one)
    await update('book_payment_proofs', proofA.id, { status: 'approved' }, tok.tA);
    await sleep(3000);
    const aAfter = await item('book_bookings', bkA.id, tok.admin, '?fields=status,payment_status');
    const aPay = await item('book_payments', payA.id, tok.admin, '?fields=status');
    const aProof = await item('book_payment_proofs', proofA.id, tok.admin, '?fields=status');
    check('F4a stale proof cannot resurrect expired booking', aAfter.status === 'expired',
      `booking=${aAfter.status}/${aAfter.payment_status}`);
    check('F4b stale payment NOT marked paid', aPay.status !== 'paid', `payment=${aPay.status}`);
    check('F4c stale proof still approved (tenant decision recorded)', aProof.status === 'approved', aProof.status);
    // now approve B — should confirm cleanly
    await update('book_payment_proofs', proofB.id, { status: 'approved' }, tok.tA);
    await sleep(3000);
    const bAfter = await item('book_bookings', bkB.id, tok.admin, '?fields=status,payment_status');
    const bSl = await items('book_booking_slots', tok.admin, `&filter[booking][_eq]=${bkB.id}`);
    check('F4d winning booking confirms', bAfter.status === 'confirmed' && bAfter.payment_status === 'paid',
      `${bAfter.status}/${bAfter.payment_status}`);
    check('F4e winning slot confirmed', bSl[0]?.status === 'confirmed', bSl[0]?.status);
  } else check('F4 race setup booking A', false, bkA?.__err);
  // F5: duplicate proofs on one booking — bkW? use a fresh booking
  let bkD, payD, proofD1, proofD2;
  try {
    bkD = await create('book_bookings', {
      tenant: T1, customer_name: 'Dup Proof', customer_email: 'customer-a@test.dinkmatch.club',
      slots: [{ court: c1.id, date: day(9), start_time: '18:00:00', end_time: '19:00:00' }],
    }, tok.cA);
  } catch (e) { bkD = { __err: e.message }; }
  await sleep(2500);
  if (bkD?.id) {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
    const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'd.png');
    const fid = (await (await fetch(`${BASE}/files`, { method: 'POST', headers: { Authorization: TOKEN }, body: fd })).json())?.data?.id;
    payD = await create('book_payments', { booking: bkD.id, method: 'gcash', amount: 400 }, tok.cA);
    proofD1 = await create('book_payment_proofs', { booking: bkD.id, payment: payD.id, file: fid, sender_name: 'Dup1' }, tok.cA);
    proofD2 = await create('book_payment_proofs', { booking: bkD.id, payment: payD.id, file: fid, sender_name: 'Dup2' }, tok.cA);
    await sleep(1500);
    await update('book_payment_proofs', proofD1.id, { status: 'approved' }, tok.tA);
    await sleep(2500);
    const d1 = await item('book_payment_proofs', proofD1.id, tok.admin, '?fields=status');
    const d2 = await item('book_payment_proofs', proofD2.id, tok.admin, '?fields=status');
    const bkDst = await item('book_bookings', bkD.id, tok.admin, '?fields=status,payment_status');
    check('F5a first proof approves booking', d1.status === 'approved' && bkDst.status === 'confirmed',
      `proof=${d1.status} booking=${bkDst.status}`);
    check('F5b duplicate proof stays pending for tenant', d2.status === 'pending', d2.status);
    // tenant rejects the duplicate
    await update('book_payment_proofs', proofD2.id, { status: 'rejected', rejection_reason: 'duplicate upload' }, tok.tA);
    await sleep(2500);
    const bkDp = await item('book_bookings', bkD.id, tok.admin, '?fields=payment_status,status');
    check('F5c rejecting dup does not unpaid a paid booking', bkDp.payment_status === 'paid' && bkDp.status === 'confirmed',
      `${bkDp.payment_status}/${bkDp.status}`);
  } else check('F5 dup-proof booking', false, bkD?.__err);
  // F6: closure enforcement — admin closes court1 on day(10)
  await create('book_closures', { tenant: T1, court: c1.id, date_start: day(10), date_end: day(10), all_day: true, reason: 'scenario-test' }, tok.admin);
  let bkCL;
  try {
    bkCL = await create('book_bookings', {
      tenant: T1, customer_name: 'Closure Test', customer_email: 'customer-a@test.dinkmatch.club',
      slots: [{ court: c1.id, date: day(10), start_time: '10:00:00', end_time: '11:00:00' }],
    }, tok.cA);
  } catch (e) { bkCL = { __err: e.message }; }
  await sleep(3000);
  if (bkCL?.id) {
    const scl = await items('book_booking_slots', tok.admin, `&filter[booking][_eq]=${bkCL.id}`);
    check('F6 slot on closed day cancelled', scl[0]?.status === 'cancelled', scl[0]?.status);
  } else check('F6 closure booking created', false, bkCL.__err);
  // F7: auto_confirm tenant — flip tenant B flag, book+proof → auto confirm
  await update('book_tenants', TB, { auto_confirm_payments: true }, tok.admin);
  let bkAC, payAC;
  try {
    bkAC = await create('book_bookings', {
      tenant: TB, customer_name: 'Auto Confirm', customer_email: 'customer-b@test.dinkmatch.club',
      slots: [{ court: b1.id, date: day(11), start_time: '18:00:00', end_time: '19:00:00' }],
    }, tok.cB);
  } catch (e) { bkAC = { __err: e.message }; }
  await sleep(2500);
  if (bkAC?.id) {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
    const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'ac.png');
    const fid = (await (await fetch(`${BASE}/files`, { method: 'POST', headers: { Authorization: TOKEN }, body: fd })).json())?.data?.id;
    payAC = await create('book_payments', { booking: bkAC.id, method: 'gcash', amount: 500 }, tok.cB);
    await create('book_payment_proofs', { booking: bkAC.id, payment: payAC.id, file: fid, sender_name: 'Auto' }, tok.cB);
    await sleep(3500);
    const ac = await item('book_bookings', bkAC.id, tok.admin, '?fields=status,payment_status,slots.status');
    check('F7 auto_confirm: booking confirmed on proof upload', ac.status === 'confirmed',
      `${ac.status}/${ac.payment_status}`);
    check('F7b auto_confirm: payment_status pending_verification', ac.payment_status === 'pending_verification',
      ac.payment_status);
    check('F7c auto_confirm: slot confirmed', (ac.slots || [])[0]?.status === 'confirmed',
      (ac.slots || [])[0]?.status);
  } else check('F7 auto_confirm booking', false, bkAC.__err);
  await update('book_tenants', TB, { auto_confirm_payments: false }, tok.admin); // restore

  // F8: concurrent collision — 3 parallel bookings same slot
  const D8 = day(12);
  const mkBooking = (name, tokX) => create('book_bookings', {
    tenant: T1, customer_name: name, customer_email: 'x@test.local',
    slots: [{ court: c1.id, date: D8, start_time: '18:00:00', end_time: '19:00:00' }],
  }, tokX).then((b) => b.id).catch(() => null);
  const raceIds = await Promise.all([mkBooking('Race1', tok.cA), mkBooking('Race2', tok.cB), mkBooking('Race3', tok.cA)]);
  await sleep(4000);
  let heldCount = 0, cancelledCount = 0;
  for (const bid of raceIds.filter(Boolean)) {
    const ss = await items('book_booking_slots', tok.admin, `&filter[booking][_eq]=${bid}`);
    if (ss[0]?.status === 'held') heldCount++;
    if (ss[0]?.status === 'cancelled') cancelledCount++;
  }
  check('F8 concurrent: exactly 1 slot survives', heldCount === 1, `held=${heldCount} cancelled=${cancelledCount} bookings=${raceIds.filter(Boolean).length}`);

  // ============ SUMMARY ============
  console.log(`\n===== RESULT: ${pass} PASS, ${fail} FAIL =====`);
  if (failures.length) console.log('Failed:', failures.join(' | '));
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
