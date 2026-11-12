/**
 * Tenant (venue) Insights dashboard — one shared "Venue Dashboard" for all
 * book_tenant staff. Row-level permissions already scope book_* reads to the
 * viewer's venues, so no $CURRENT_USER filters are needed (same pattern as
 * Mitmit's merchant dashboard).
 *
 * - Creates dashboard + panels (idempotent: GET by name → PATCH else POST)
 * - Grants book_tenant policy READ on directus_dashboards/directus_panels
 *   (required for the Studio Insights module to list them)
 * Panel shapes verified against Mitmit's build_mitmit_dashboards.py.
 */
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* .env optional — vars may come from the shell */ }
const TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) throw new Error('BOOKING_ADMIN_TOKEN is not set — copy .env.example to .env and fill it in');
const BASE = 'https://api.dinkmatch.club';
const BOOK_TENANT_POLICY = '6dae3bf8-8f04-4223-b011-c64c5c1c2da1';

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

const getId = async (endpoint, filter) => {
  const rows = await api('GET', `/${endpoint}?limit=1&${filter}&fields=id`);
  return rows?.[0]?.id ?? null;
};

async function ensureDashboard(name, icon, color, note) {
  const id = await getId('dashboards', `filter[name][_eq]=${encodeURIComponent(name)}`);
  if (id) {
    await api('PATCH', `/dashboards/${id}`, { icon, color, note });
    return id;
  }
  const d = await api('POST', '/dashboards', { name, icon, color, note });
  return d.id;
}

async function ensurePanel(dashId, name, ptype, icon, pos, options, color) {
  const existing = await getId(
    'panels',
    `filter[dashboard][_eq]=${dashId}&filter[name][_eq]=${encodeURIComponent(name)}`,
  );
  const body = {
    dashboard: dashId,
    name,
    type: ptype,
    icon,
    color,
    show_header: true,
    position_x: pos.x,
    position_y: pos.y,
    width: pos.w,
    height: pos.h,
    options,
  };
  if (existing) {
    await api('PATCH', `/panels/${existing}`, body);
    return 'patched';
  }
  await api('POST', '/panels', body);
  return 'created';
}

async function ensurePermission(collection, action) {
  const existing = await getId(
    'permissions',
    `filter[policy][_eq]=${BOOK_TENANT_POLICY}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}`,
  );
  if (existing) return 'exists';
  await api('POST', '/permissions', {
    policy: BOOK_TENANT_POLICY,
    collection,
    action,
    fields: ['*'],
    permissions: {},
  });
  return 'created';
}

const pos = (x, y, w, h) => ({ x, y, w, h });
const metric = (collection, field, fn, filter) => ({
  collection,
  field,
  function: fn,
  sortField: null,
  ...(filter ? { filter } : {}),
});
const TODAY = { _gte: '$NOW(-1 day)' };
const WEEK = { _gte: '$NOW(-7 days)' };

const PANELS = [
  // KPI strip — 4 compact metrics across the ~56-unit grid.
  // NOTE: grid positions must start at 1 — this instance treats x/y=0 as
  // "unset" and collapses the panel to a sliver.
  ['New Bookings · 24h', 'metric', 'event_available', pos(1, 1, 12, 10),
    metric('book_bookings', 'id', 'count', { date_created: TODAY }), '#7c3aed'],
  ['Confirmed', 'metric', 'check_circle', pos(15, 1, 12, 10),
    metric('book_bookings', 'id', 'count', { status: { _eq: 'confirmed' } }), '#22c55e'],
  ['Pending Proofs', 'metric', 'pending_actions', pos(29, 1, 12, 10),
    metric('book_payment_proofs', 'id', 'count', { status: { _eq: 'pending' } }), '#f59e0b'],
  ['Paid Revenue', 'metric', 'payments', pos(43, 1, 12, 10),
    metric('book_payments', 'amount', 'sum', { status: { _eq: 'paid' } }), '#0ea5e9'],
  // second KPI row — trend + pipeline
  ['Revenue · 7 days', 'metric', 'trending_up', pos(1, 13, 12, 10),
    metric('book_payments', 'amount', 'sum',
      { _and: [{ status: { _eq: 'paid' } }, { date_created: WEEK }] }), '#22c55e'],
  ['Held Slots', 'metric', 'schedule', pos(15, 13, 12, 10),
    metric('book_booking_slots', 'id', 'count', { status: { _eq: 'held' } }), '#3b82f6'],
  ['Cancelled', 'metric', 'cancel', pos(29, 13, 12, 10),
    metric('book_bookings', 'id', 'count', { status: { _eq: 'cancelled' } }), '#94a3b8'],
  ['Proofs · 7 days', 'metric', 'fact_check', pos(43, 13, 12, 10),
    metric('book_payment_proofs', 'id', 'count', { date_created: WEEK }), '#8b5cf6'],
  // charts
  ['Bookings by Status', 'pie-chart', 'donut_large', pos(1, 25, 27, 24),
    { collection: 'book_bookings', column: 'status' }, null],
  ['Proofs by Status', 'pie-chart', 'verified', pos(29, 25, 27, 24),
    { collection: 'book_payment_proofs', column: 'status' }, null],
];

async function main() {
  const dashId = await ensureDashboard(
    'Venue Dashboard',
    'storefront',
    '#7c3aed',
    'Live booking insights — scoped to your venues by permissions. Switch venue in Studio to change scope.',
  );
  console.log(`dashboard ${dashId}`);

  for (const [name, type, icon, p, options, color] of PANELS) {
    const r = await ensurePanel(dashId, name, type, icon, p, options, color);
    console.log(`  ${r === 'created' ? '+' : '='} ${name}`);
  }

  for (const coll of ['directus_dashboards', 'directus_panels']) {
    console.log(`perm ${coll}: ${await ensurePermission(coll, 'read')}`);
  }

  await api('POST', '/utils/cache/clear', {}).catch(() => {});
  console.log('DONE');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
