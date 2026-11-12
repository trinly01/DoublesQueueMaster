/**
 * Subscription-plan enforcement (Model A security conditions).
 *
 * 1. suspension_reason field on book_tenants — 'billing' | 'manual' | null.
 *    Zyberlab-only (not in tenant update fields).
 *
 * 2. court_limit_guard — items.create book_courts: if tenant's non-inactive
 *    court count exceeds max_courts, the new court is set 'inactive'.
 *
 * 3. plan_change_enforcer — items.update book_tenants: when subscription_plan
 *    or max_courts changes, inactivate courts beyond the cap (earliest ids
 *    keep their status; excess highest-id courts → 'inactive').
 *
 * 4. subscription_lapse_guard — items.update book_tenants: keeps status +
 *    suspension_reason consistent with subscription_status:
 *      cancelled            → status='suspended', reason='billing'
 *      active/trialing      → if reason='billing', reactivate (reason→null)
 *      manual suspensions   → never auto-lifted
 *
 * 5. billing_grace_sweeper — daily: trialing past renews_at → past_due;
 *    past_due past renews_at+7d → suspended/billing (manual suspensions
 *    untouched).
 *
 * Court/tenant status also gates NEW slot creation via slot_init
 * (setup-booking-flows.mjs): court.status<>'active' or tenant.status<>'active'
 * → slot cancelled. So a suspended venue stops taking bookings immediately.
 *
 * Idempotent. Usage: node scripts/setup-booking-plan-enforcement.mjs
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

const normalizeId = {
  name: 'normalize', key: 'normalize', type: 'exec',
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
};

const FLOWS = [
  {
    name: 'court_limit_guard', icon: 'gavel',
    description: 'On court create: inactivate it if tenant exceeds plan max_courts',
    trigger: 'event', options: { type: 'action', scope: ['items.create'], collections: ['book_courts'] },
    ops: [
      normalizeId,
      { name: 'cap_court', key: 'cap_court', type: 'likha_sql', options: sql(
        `UPDATE book_courts c SET status = 'inactive'
         WHERE c.id = ?
           AND COALESCE(c.status, 'active') = 'active'
           AND EXISTS (
             SELECT 1 FROM book_tenants t
             WHERE t.id = c.tenant AND t.max_courts IS NOT NULL
               AND (SELECT count(*) FROM book_courts x
                    WHERE x.tenant = t.id AND COALESCE(x.status, 'active') <> 'inactive')
                   > t.max_courts
           )`,
        [T('normalize.itemId')]) },
    ],
  },
  {
    name: 'plan_change_enforcer', icon: 'gavel',
    description: 'On tenant plan/max_courts change: inactivate courts beyond the new cap',
    trigger: 'event', options: { type: 'action', scope: ['items.update'], collections: ['book_tenants'] },
    ops: [
      normalizeId,
      { name: 'enforce_cap', key: 'enforce_cap', type: 'likha_sql', options: sql(
        `UPDATE book_courts c SET status = 'inactive'
         WHERE c.tenant = ?
           AND COALESCE(c.status, 'active') <> 'inactive'
           AND EXISTS (SELECT 1 FROM book_tenants t WHERE t.id = ? AND t.max_courts IS NOT NULL)
           AND (SELECT count(*) FROM book_courts x
                WHERE x.tenant = c.tenant AND COALESCE(x.status, 'active') <> 'inactive'
                  AND x.seq <= c.seq)
               > (SELECT t.max_courts FROM book_tenants t WHERE t.id = c.tenant)`,
        [T('normalize.itemId'), T('normalize.itemId')]) },
    ],
  },
  {
    name: 'subscription_lapse_guard', icon: 'shield',
    description: 'Sync venue status with subscription_status; auto-reactivate billing suspensions only',
    trigger: 'event', options: { type: 'action', scope: ['items.update'], collections: ['book_tenants'] },
    ops: [
      normalizeId,
      { name: 'sync_status', key: 'sync_status', type: 'likha_sql', options: sql(
        `UPDATE book_tenants t SET
           status = CASE
             WHEN t.subscription_status = 'cancelled' AND COALESCE(t.suspension_reason, '') <> 'manual' THEN 'suspended'
             WHEN t.subscription_status IN ('active', 'trialing') AND t.suspension_reason = 'billing' THEN 'active'
             ELSE t.status END,
           suspension_reason = CASE
             WHEN t.subscription_status = 'cancelled' AND COALESCE(t.suspension_reason, '') <> 'manual' THEN 'billing'
             WHEN t.subscription_status IN ('active', 'trialing') AND t.suspension_reason = 'billing' THEN NULL
             ELSE t.suspension_reason END
         WHERE t.id = ?`,
        [T('normalize.itemId')]) },
    ],
  },
  {
    name: 'billing_grace_sweeper', icon: 'schedule',
    description: 'Daily: trial expiry → past_due; past_due past 7d grace → suspended (billing)',
    trigger: 'schedule', options: { cron: '30 1 * * *' }, // 09:30 PHT daily
    ops: [
      { name: 'trial_expire', key: 'trial_expire', type: 'likha_sql', options: sql(
        `UPDATE book_tenants SET subscription_status = 'past_due'
         WHERE subscription_status = 'trialing'
           AND subscription_renews_at IS NOT NULL
           AND subscription_renews_at < now()` ) },
      { name: 'past_due_suspend', key: 'past_due_suspend', type: 'likha_sql', options: sql(
        `UPDATE book_tenants SET status = 'suspended', suspension_reason = 'billing'
         WHERE subscription_status = 'past_due'
           AND subscription_renews_at IS NOT NULL
           AND subscription_renews_at < now() - interval '7 days'
           AND COALESCE(suspension_reason, '') <> 'manual'`) },
    ],
  },
];

async function ensureField() {
  try {
    await api('GET', '/fields/book_tenants/suspension_reason');
    console.log('= suspension_reason exists');
  } catch {
    await api('POST', '/fields/book_tenants', {
      field: 'suspension_reason', type: 'string', schema: null,
      meta: { group: 'g_billing', width: 'half', interface: 'select-dropdown',
        options: { choices: [{ text: 'billing', value: 'billing' }, { text: 'manual', value: 'manual' }] },
        note: 'Why venue is suspended — billing = auto (subscription lapse), manual = Zyberlab action. Drives auto-reactivation.' },
    });
    console.log('+ suspension_reason field');
  }
}

async function main() {
  await ensureField();
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
    let prevId = null;
    const opIds = [];
    for (let i = spec.ops.length - 1; i >= 0; i--) {
      const o = spec.ops[i];
      const op = await api('POST', '/operations', {
        flow: flow.id, name: o.name, key: o.key, type: o.type,
        position_x: 30 + i * 20, position_y: 10,
        options: o.options, resolve: prevId, reject: null,
      });
      prevId = op.id;
      opIds.unshift(op.id);
    }
    await api('PATCH', `/flows/${flow.id}`, { operation: opIds[0] });
    console.log(`+ ${spec.name} (${spec.ops.length} ops)`);
  }
  console.log('done.');
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
