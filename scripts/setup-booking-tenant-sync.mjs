/**
 * Multi-venue write path — keeps directus_users.book_tenant_ids in sync
 * with book_tenant_users junction rows, and keeps book_tenant pointing at
 * a venue the user still belongs to.
 *
 * Why: permission validation can't express "tenant ∈ my venues" (deep
 * filters fail closed), but `{book_tenant: {_in: $CURRENT_USER.book_tenant_ids}}`
 * DOES work — verified live. So junction writes resync the ids array and
 * the self-update perm (permissions/123) enforces membership.
 *
 * Creates flow `tenant_user_sync` on book_tenant_users
 * [items.create|items.update|items.delete] → one likha_sql that recomputes
 * book_tenant_ids + repairs book_tenant for every staff user touched
 * (bounded set: users with junctions or non-null ids — never players).
 *
 * Also backfills existing junctions once via admin API.
 * Idempotent. Usage: node scripts/setup-booking-tenant-sync.mjs
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

// Recompute book_tenant_ids for every staff user (junction members + anyone
// with a non-null ids array). Also repairs book_tenant: if it no longer
// points at a member venue, reset to the user's first junction venue (or null).
const SYNC_SQL = `
UPDATE directus_users u
SET book_tenant_ids = COALESCE((
      SELECT json_agg(j.tenant ORDER BY j.tenant)
      FROM book_tenant_users j WHERE j."user" = u.id
    ), '[]'::json),
    book_tenant = CASE
      WHEN u.book_tenant IS NOT NULL
           AND EXISTS (SELECT 1 FROM book_tenant_users j
                       WHERE j."user" = u.id AND j.tenant = u.book_tenant)
      THEN u.book_tenant
      ELSE (SELECT j.tenant FROM book_tenant_users j
            WHERE j."user" = u.id ORDER BY j.id LIMIT 1)
    END
WHERE u.id IN (
  SELECT "user" FROM book_tenant_users
  UNION
  SELECT id FROM directus_users WHERE book_tenant_ids IS NOT NULL
)`;

async function ensureFlow() {
  const existing = await api('GET', '/flows?limit=-1&fields=id,name');
  const old = existing.find((f) => f.name === 'tenant_user_sync');
  if (old) {
    const detail = await api('GET', `/flows/${old.id}?fields=*,operations.id`);
    for (const op of detail.operations || []) {
      try { await api('DELETE', `/operations/${op.id}`); } catch {}
    }
    await api('DELETE', `/flows/${old.id}`);
    console.log('- tenant_user_sync rebuilt');
  }
  const flow = await api('POST', '/flows', {
    name: 'tenant_user_sync', icon: 'group',
    description: 'Sync book_tenant_ids + repair book_tenant on junction writes (multi-venue staff)',
    status: 'active', trigger: 'event', accountability: 'all',
    options: { type: 'action', scope: ['items.create', 'items.update', 'items.delete'], collections: ['book_tenant_users'] },
  });
  const op = await api('POST', '/operations', {
    flow: flow.id, name: 'sync_staff_venues', key: 'sync', type: 'likha_sql',
    position_x: 30, position_y: 10,
    options: { sql: SYNC_SQL, binding: [] }, resolve: null, reject: null,
  });
  await api('PATCH', `/flows/${flow.id}`, { operation: op.id });
  console.log('+ tenant_user_sync flow');
}

async function backfill() {
  const junctions = await api('GET', '/items/book_tenant_users?limit=-1&fields=user,tenant');
  const byUser = new Map();
  for (const j of junctions) {
    if (!byUser.has(j.user)) byUser.set(j.user, []);
    byUser.get(j.user).push(j.tenant);
  }
  let n = 0;
  for (const [uid, tids] of byUser) {
    const sorted = [...new Set(tids)].sort((a, b) => a - b);
    const u = await api('GET', `/users/${uid}?fields=id,book_tenant`);
    const body = { book_tenant_ids: sorted };
    // repair book_tenant if it points outside membership
    if (u.book_tenant != null && !sorted.includes(u.book_tenant)) body.book_tenant = sorted[0];
    await api('PATCH', `/users/${uid}`, body);
    n++;
  }
  console.log(`+ backfilled book_tenant_ids for ${n} staff user(s)`);
}

await ensureFlow();
await backfill();
console.log('done.');
