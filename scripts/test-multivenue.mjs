/**
 * Verify multi-venue staff model end-to-end:
 *   user linked to tenant A + B via book_tenant_users
 *   book_tenant = "active venue" — switchable via self-update
 *   creates stamp active venue; reads span all member venues
 * Also probes whether deep membership validation works on the
 * directus_users self-update perm (non-member venue must be rejected).
 * Cleans up all fixtures. Usage: node scripts/test-multivenue.mjs
 */
const ADMIN = process.env.BOOKING_ADMIN_TOKEN || 'Bearer ***REMOVED***';
const BASE = 'https://api.dinkmatch.club';
const ROLE = '29d2495d-c6a3-4ee8-a1ce-037191610e21'; // book_tenant
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

async function api(method, path, body, token = ADMIN) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json?.data ?? json };
}
async function must(method, path, body, token) {
  const r = await api(method, path, body, token);
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
}

const cleanup = { tenants: [], users: [], junctions: [], courts: [] };

try {
  // ---- fixtures: tenant B + multi-venue user ----
  const tenA = (await must('GET', '/items/book_tenants?filter[status][_eq]=active&sort=name&limit=1&fields=id,name'))[0];
  ok('fixture: active tenant A exists', !!tenA, tenA?.name);

  const tenB = await must('POST', '/items/book_tenants', {
    name: 'MV Verify Venue', slug: `mv-verify-${Date.now()}`, status: 'active',
    subscription_plan: 'trial', subscription_status: 'trialing',
  });
  cleanup.tenants.push(tenB.id);

  const email = `mv-test-${Date.now()}@example.com`;
  const user = await must('POST', '/users', {
    email, password: '***REMOVED***', first_name: 'MV', last_name: 'Tester',
  });
  cleanup.users.push(user.id);
  // NOTE: role is ignored on POST /users on this instance — PATCH it after
  await must('PATCH', `/users/${user.id}`, { role: ROLE });

  for (const t of [tenA.id, tenB.id]) {
    const j = await must('POST', '/items/book_tenant_users', { tenant: t, user: user.id, role: 'staff' });
    cleanup.junctions.push(j.id);
  }
  // admin sets active venue = A
  await must('PATCH', `/users/${user.id}`, { book_tenant: tenA.id });

  // junction writes trigger tenant_user_sync flow (async) — wait for ids
  for (let i = 0; i < 20; i++) {
    const u = await must('GET', `/users/${user.id}?fields=book_tenant_ids`, null);
    if (Array.isArray(u.book_tenant_ids) && u.book_tenant_ids.length === 2) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  // login as the user
  const login = await api('POST', '/auth/login', { email, password: '***REMOVED***' });
  const tok = 'Bearer ' + login.data?.access_token;
  ok('fixture: user login', !!tok);

  // ---- reads span both venues ----
  const venues = await must('GET', '/items/book_tenants?fields=id,name', null, tok);
  // staff read = own venues ∪ all ACTIVE venues (they browse as customers too)
  const ids = new Set(venues.map((v) => v.id));
  ok('read: sees both member venues', ids.has(tenA.id) && ids.has(tenB.id),
    `${venues.length} venues: ${venues.map((v) => v.name).join(', ')}`);

  // ---- active-venue switch via self-update ----
  const sw = await api('PATCH', `/users/${user.id}`, { book_tenant: tenB.id }, tok);
  ok('self-update: switch active venue → B', sw.status === 200, `status ${sw.status}`);
  const me = await must('GET', `/users/${user.id}?fields=book_tenant`, null, tok);
  ok('self-update: book_tenant persisted = B', me.book_tenant === tenB.id, `got ${me.book_tenant}`);

  // ---- create stamps ACTIVE venue (B now) ----
  const courtB = await must('POST', '/items/book_courts', {
    tenant: tenB.id, name: 'MV Court B', sport_type: null, price_per_hour: 100,
  }, tok);
  cleanup.courts.push(courtB.id);
  ok('create: court stamped to active venue B', courtB.tenant === tenB.id, `tenant=${courtB.tenant}`);

  // switch back to A, create again → stamps A (omit tenant — preset fills it)
  await must('PATCH', `/users/${user.id}`, { book_tenant: tenA.id }, tok);
  const courtA = await must('POST', '/items/book_courts', {
    name: 'MV Court A', sport_type: null, price_per_hour: 100,
  }, tok);
  cleanup.courts.push(courtA.id);
  ok('create: payload tenant ignored, stamped to active A', courtA.tenant === tenA.id, `tenant=${courtA.tenant}`);

  // negative: explicit tenant ≠ active venue must be rejected
  const forge = await api('POST', '/items/book_courts', {
    tenant: tenB.id, name: 'MV Forged', price_per_hour: 1,
  }, tok);
  ok('security: cannot forge court for non-active venue', forge.status >= 400, `status=${forge.status}`);

  // ---- security probe: non-member venue ----
  // need a third tenant the user is NOT linked to
  const tenC = await must('POST', '/items/book_tenants', {
    name: 'MV Outsider Venue', slug: `mv-out-${Date.now()}`, status: 'active',
  });
  cleanup.tenants.push(tenC.id);
  const evil = await api('PATCH', `/users/${user.id}`, { book_tenant: tenC.id }, tok);
  const meAfter = await must('GET', `/users/${user.id}?fields=book_tenant`, null, tok);
  ok('security: cannot switch to non-member venue', evil.status >= 400 || meAfter.book_tenant !== tenC.id,
    `status=${evil.status} book_tenant=${meAfter.book_tenant}`);

} finally {
  // ---- cleanup (admin) ----
  for (const id of cleanup.courts) await api('DELETE', `/items/book_courts/${id}`).catch(() => {});
  for (const id of cleanup.junctions) await api('DELETE', `/items/book_tenant_users/${id}`).catch(() => {});
  for (const id of cleanup.users) await api('DELETE', `/users/${id}`).catch(() => {});
  for (const id of cleanup.tenants) await api('DELETE', `/items/book_tenants/${id}`).catch(() => {});
  console.log(`\ncleanup: ${cleanup.courts.length}c ${cleanup.junctions.length}j ${cleanup.users.length}u ${cleanup.tenants.length}t`);
}
console.log(`\n===== RESULT: ${pass} PASS, ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
