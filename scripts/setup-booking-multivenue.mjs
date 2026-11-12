/**
 * Multi-venue staff + Zyberlab subscription fields.
 *
 * Multi-venue model ("active venue"):
 *   - book_tenant_users junction = ALL venues a staff user may access
 *   - directus_users.book_tenant  = the venue they are CURRENTLY working in
 *   - Reads/updates/deletes already scope via junction filters; creates
 *     stamp+validate tenant = $CURRENT_USER.book_tenant (the active venue).
 *   - This script unhides book_tenant in the user form, lets staff update
 *     it on their own record, and makes it readable so the picker works.
 *
 * Subscription (Model A billing):
 *   - New g_billing tab on book_tenants + plan/max_courts/status/renews/
 *     billing_email. Zyberlab-only: NOT added to tenant update field list,
 *     so tenants see but cannot edit them.
 *
 * Idempotent. Usage: node scripts/setup-booking-multivenue.mjs
 */
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* .env optional — vars may come from the shell */ }
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) throw new Error('BOOKING_ADMIN_TOKEN is not set — copy .env.example to .env and fill it in');
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

// ---------- 1. directus_users.book_tenant → visible active-venue picker ----------
{
  const f = await api('GET', '/fields/directus_users/book_tenant');
  const meta = { ...f.meta };
  meta.hidden = false;
  meta.note = 'Active venue — new bookings, courts & staff you create are assigned here. Switch this to work in another venue you belong to.';
  await api('PATCH', '/fields/directus_users/book_tenant', { meta });
  console.log('+ directus_users.book_tenant unhidden (active-venue picker)');
}

// ---------- 1b. book_tenant_ids json field (membership mirror for validation) ----------
{
  try {
    await api('GET', '/fields/directus_users/book_tenant_ids');
    console.log('= directus_users.book_tenant_ids exists');
  } catch {
    await api('POST', '/fields/directus_users', {
      field: 'book_tenant_ids', type: 'json', schema: null,
      meta: { hidden: true, interface: 'input-code',
        options: { language: 'json' },
        note: 'Venue IDs this staff user belongs to — synced from book_tenant_users by tenant_user_sync flow' },
    });
    console.log('+ directus_users.book_tenant_ids field');
  }
}

// ---------- 2. tenant policy: self-update own book_tenant + read it back ----------
{
  const perms = await api('GET', '/permissions?limit=-1&fields=id,policy,collection,action,permissions,fields');
  const mine = perms.filter((p) => String(p.policy) === POLICY || p.policy === POLICY);

  // read perm must expose book_tenant (+ membership mirror) or the picker renders empty
  const read = mine.find((p) => p.collection === 'directus_users' && p.action === 'read');
  if (read) {
    const want = ['book_tenant', 'book_tenant_ids'];
    const missing = want.filter((f) => !(read.fields || []).includes(f));
    if (missing.length) {
      await api('PATCH', `/permissions/${read.id}`, { fields: [...(read.fields || []), ...missing] });
      console.log(`+ directus_users read perm: +${missing.join(',+')}`);
    }
  }

  // self-update perm: staff may change ONLY book_tenant on their own user row.
  // Validation uses book_tenant_ids (json array synced by tenant_user_sync
  // flow from book_tenant_users) — deep membership filters fail closed in
  // Directus validation, but {_in: $CURRENT_USER.<json array>} works.
  const MEMBER = { book_tenant: { _in: '$CURRENT_USER.book_tenant_ids' } };
  const upd = mine.find((p) => p.collection === 'directus_users' && p.action === 'update');
  if (!upd) {
    await api('POST', '/permissions', {
      policy: POLICY, collection: 'directus_users', action: 'update',
      permissions: { id: { _eq: '$CURRENT_USER.id' } },
      fields: ['book_tenant'], validation: MEMBER, presets: null,
    });
    console.log('+ directus_users self-update perm (book_tenant only)');
  } else {
    // full upsert — a stale row may carry fields:null or old validation
    const want = {
      permissions: { id: { _eq: '$CURRENT_USER.id' } },
      fields: ['book_tenant'], validation: MEMBER, presets: null,
    };
    const patch = {};
    if (JSON.stringify(upd.permissions ?? null) !== JSON.stringify(want.permissions)) patch.permissions = want.permissions;
    if (JSON.stringify([...(upd.fields || [])].sort()) !== JSON.stringify([...want.fields].sort())) patch.fields = want.fields;
    if (JSON.stringify(upd.validation ?? null) !== JSON.stringify(MEMBER)) patch.validation = MEMBER;
    if (upd.presets != null) patch.presets = null;
    if (Object.keys(patch).length) {
      await api('PATCH', `/permissions/${upd.id}`, patch);
      console.log(`~ directus_users update perm fixed (${Object.keys(patch).join(',')})`);
    } else {
      console.log('= directus_users update perm already exists');
    }
  }
}

// ---------- 3. g_billing tab + subscription fields on book_tenants ----------
{
  const fields = await api('GET', '/fields/book_tenants?limit=-1&fields=field');
  const names = new Set(fields.map((f) => f.field));
  // /fields list omits alias/group rows — probe group fields directly
  const groupExists = async (g) => {
    try { await api('GET', `/fields/book_tenants/${g}`); return true; } catch { return false; }
  };

  const grpMeta = { interface: 'group-tabs', special: ['alias', 'no-data', 'group'], width: 'full', hidden: false, translations: { 'en-US': 'Billing' } };
  if (!(await groupExists('g_billing'))) {
    await api('POST', '/fields/book_tenants', {
      field: 'g_billing', type: 'alias', meta: grpMeta, schema: null,
    });
    console.log('+ g_billing tab group');
  }

  const F = (field, type, meta) => ({ field, type, meta: { group: 'g_billing', ...meta }, schema: null });
  const sel = (vals) => ({ interface: 'select-dropdown', options: { choices: vals.map((v) => ({ text: v, value: v })) } });
  const dt = { interface: 'datetime', options: { include_time: false, include_seconds: false } };

  const NEW_FIELDS = [
    F('subscription_plan', 'string', {
      ...sel(['trial', 'starter', 'growth', 'business']), width: 'half',
      note: 'Zyberlab plan tier — starter ≤2 courts, growth ≤6, business unlimited',
    }),
    F('max_courts', 'integer', {
      interface: 'input', width: 'half',
      note: 'Court limit for the plan (blank = unlimited). Zyberlab sets.',
    }),
    F('subscription_status', 'string', {
      ...sel(['trialing', 'active', 'past_due', 'cancelled']), width: 'half',
      note: 'Zyberlab billing status — past_due/cancelled may suspend venue',
    }),
    F('subscription_renews_at', 'timestamp', {
      ...dt, width: 'half', note: 'Next billing/renewal date',
    }),
    F('billing_email', 'string', {
      interface: 'input', width: 'half', note: 'Invoice email — may differ from venue contact',
    }),
  ];

  // sort order: place billing tab after g_rules, before g_advanced
  for (const spec of NEW_FIELDS) {
    if (names.has(spec.field)) { console.log(`= ${spec.field} exists`); continue; }
    await api('POST', '/fields/book_tenants', spec);
    console.log(`+ ${spec.field}`);
  }

  // this Directus version has no meta.label — tab names come from
  // meta.translations {"en-US": "..."}; without it tabs show raw g_* keys
  const LABELS = { g_venue: 'Venue', g_location: 'Location', g_payments: 'Payments', g_rules: 'Booking Rules', g_billing: 'Billing', g_advanced: 'Advanced' };
  for (const [g, label] of Object.entries(LABELS)) {
    try {
      const cur = await api('GET', `/fields/book_tenants/${g}`);
      const tr = cur.meta?.translations?.['en-US'];
      if (tr !== label) {
        await api('PATCH', `/fields/book_tenants/${g}`, { meta: { ...cur.meta, translations: { 'en-US': label } } });
        console.log(`~ ${g} tab → "${label}"`);
      }
    } catch { /* group field missing — skip */ }
  }
}

console.log('done.');
