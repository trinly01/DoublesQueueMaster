/**
 * Migrate book_* collections from integer PKs to uuid PKs + `seq`
 * auto-increment ordering columns. API-only (no DB access).
 *
 * Phases (run in order, schema step in between is manual):
 *   node scripts/migrate-book-uuids.mjs backup   # dump all rows + user venue pointers
 *   node scripts/migrate-book-uuids.mjs down     # deactivate book flows, delete collections
 *   node scripts/setup-booking-schema.mjs        # recreate collections (uuid PK + seq)
 *   node scripts/migrate-book-uuids.mjs up       # re-insert rows with uuid ids + FK remap
 *   node scripts/migrate-book-uuids.mjs users    # fix directus_users.book_tenant(_ids)
 *
 * Backup lives in .tmp-book-uuid/ (not committed).
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const TOKEN = process.env.BOOKING_ADMIN_TOKEN || 'Bearer ***REMOVED***';
const BASE = 'https://api.dinkmatch.club';
const DIR = '.tmp-book-uuid';

const COLLECTIONS = [
  'book_sport_types', 'book_tenants', 'book_tenant_users', 'book_courts',
  'book_opening_hours', 'book_closures', 'book_bookings',
  'book_booking_slots', 'book_payments', 'book_payment_proofs',
];
// insert order for `up` — parents before children so FK maps exist
const INSERT_ORDER = [
  'book_sport_types', 'book_tenants', 'book_tenant_users', 'book_courts',
  'book_opening_hours', 'book_closures', 'book_bookings',
  'book_booking_slots', 'book_payments', 'book_payment_proofs',
];
// delete order — children before parents
const DELETE_ORDER = [
  'book_payment_proofs', 'book_payments', 'book_booking_slots', 'book_bookings',
  'book_closures', 'book_opening_hours', 'book_courts', 'book_tenant_users',
  'book_tenants', 'book_sport_types',
];
// FK remap: field -> source collection (only book_* FKs need remapping;
// user/customer/file FKs already point at uuid system collections)
const FK_MAP = {
  book_tenant_users: { tenant: 'book_tenants' },
  book_courts: { tenant: 'book_tenants', sport: 'book_sport_types' },
  book_opening_hours: { tenant: 'book_tenants', court: 'book_courts' },
  book_closures: { tenant: 'book_tenants', court: 'book_courts' },
  book_bookings: { tenant: 'book_tenants' },
  book_booking_slots: { booking: 'book_bookings', court: 'book_courts' },
  book_payments: { booking: 'book_bookings' },
  book_payment_proofs: { booking: 'book_bookings', payment: 'book_payments' },
};
const BOOK_FLOWS = [
  'booking_ref', 'slot_init', 'collision_check', 'booking_totals',
  'booking_cancelled', 'hold_expire_sweeper', 'no_show_sweeper',
  'proof_pending', 'proof_approved', 'proof_rejected', 'proof_auto_confirm',
  'booking_status_mail', 'tenant_user_sync', 'court_limit_guard',
  'plan_change_enforcer', 'subscription_lapse_guard', 'billing_grace_sweeper',
  'expire club subscription',
];
const SYSTEM_FIELDS = new Set(['id', 'date_created', 'date_updated', 'user_created', 'user_updated']);

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.errors?.[0]?.message || text.slice(0, 300);
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return json?.data ?? json;
}
const items = (c) => api('GET', `/items/${c}?limit=-1&fields=*`);

async function backup() {
  mkdirSync(DIR, { recursive: true });
  const dump = {};
  for (const c of COLLECTIONS) {
    dump[c] = await items(c);
    writeFileSync(`${DIR}/${c}.json`, JSON.stringify(dump[c], null, 2));
    console.log(`  ${c}: ${dump[c].length} rows`);
  }
  // users holding venue pointers (book_tenant int + book_tenant_ids json)
  const users = await api('GET',
    '/users?limit=-1&fields=id,email,first_name,last_name,book_tenant,book_tenant_ids');
  const linked = users.filter((u) => u.book_tenant != null || (u.book_tenant_ids ?? []).length);
  writeFileSync(`${DIR}/users.json`, JSON.stringify(linked, null, 2));
  console.log(`  users with venue links: ${linked.length}`);
  // directus_users.book_tenant field meta (for recreate)
  const f = await api('GET', '/fields/directus_users/book_tenant');
  writeFileSync(`${DIR}/book_tenant_field.json`, JSON.stringify(f, null, 2));
  console.log('backup complete →', DIR);
}

async function down() {
  const flows = await api('GET', '/flows?limit=-1&fields=id,name,status');
  let off = 0;
  for (const f of flows.filter((x) => BOOK_FLOWS.includes(x.name))) {
    if (f.status === 'active') {
      await api('PATCH', `/flows/${f.id}`, { status: 'inactive' });
      off++;
    }
  }
  console.log(`flows deactivated: ${off}`);
  for (const c of DELETE_ORDER) {
    try {
      await api('DELETE', `/collections/${c}`);
      console.log(`  - ${c} deleted`);
    } catch (e) {
      console.log(`  ! ${c}: ${e.message}`);
    }
  }
}

async function up() {
  const idMap = {}; // collection -> { oldId: newUuid }
  for (const c of INSERT_ORDER) {
    const file = `${DIR}/${c}.json`;
    if (!existsSync(file)) { console.log(`  ~ ${c}: no backup, skip`); continue; }
    // real (non-alias) field names — backup rows contain o2m alias arrays
    // like tenant_users:[3] that must NOT be sent as FK ids
    const fieldRows = await api('GET', `/fields/${c}?limit=-1&fields=field,type`);
    const realFields = new Set(
      fieldRows.filter((f) => f.type !== 'alias').map((f) => f.field),
    );
    // wipe partial rows from earlier failed runs (collections are fresh)
    for (const r of await items(c)) {
      try { await api('DELETE', `/items/${c}/${r.id}`); } catch { /* ignore */ }
    }
    const rows = JSON.parse(readFileSync(file, 'utf8'));
    // sort by old id so seq auto-increment preserves creation order
    rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    idMap[c] = {};
    let n = 0;
    for (const row of rows) {
      const newId = randomUUID();
      const body = {};
      for (const [k, v] of Object.entries(row)) {
        if (SYSTEM_FIELDS.has(k) || !realFields.has(k)) continue;
        body[k] = v;
      }
      // remap book_* FKs
      for (const [field, src] of Object.entries(FK_MAP[c] ?? {})) {
        if (body[field] != null && idMap[src]?.[body[field]]) {
          body[field] = idMap[src][body[field]];
        } else if (body[field] != null) {
          console.log(`  ! ${c} row ${row.id}: unmapped ${field}=${body[field]}`);
        }
      }
      try {
        await api('POST', `/items/${c}`, { id: newId, ...body });
        idMap[c][row.id] = newId;
        n++;
      } catch (e) {
        console.log(`  ! ${c} row ${row.id}: ${e.message}`);
      }
    }
    console.log(`  ${c}: ${n}/${rows.length} migrated`);
  }
  writeFileSync(`${DIR}/idmap.json`, JSON.stringify(idMap, null, 2));
  console.log('idmap →', `${DIR}/idmap.json`);
}

async function users() {
  const idMap = JSON.parse(readFileSync(`${DIR}/idmap.json`, 'utf8'));
  const tenantMap = idMap.book_tenants ?? {};
  // 1) book_tenant field: recreate as uuid (was deleted with old tenants table).
  //    Field meta comes from the backup — GET 403s when the field is absent.
  const backupField = JSON.parse(readFileSync(`${DIR}/book_tenant_field.json`, 'utf8'));
  try {
    const cur = await api('GET', '/fields/directus_users/book_tenant');
    if (cur.type === 'uuid') { console.log('book_tenant already uuid'); }
    else throw new Error('exists as ' + cur.type);
  } catch {
    const { id: _id, collection: _c, ...meta } = backupField.meta ?? {};
    await api('POST', '/fields/directus_users', {
      field: 'book_tenant', type: 'uuid', meta, schema: { is_nullable: true },
    });
    console.log('book_tenant field recreated as uuid');
    // m2o relation back to book_tenants (field alone doesn't create it)
    const rels = await api('GET', '/relations?limit=-1&fields=id,collection,field');
    const have = rels.some((r) => r.collection === 'directus_users' && r.field === 'book_tenant');
    if (!have) {
      await api('POST', '/relations', {
        collection: 'directus_users', field: 'book_tenant',
        related_collection: 'book_tenants',
        schema: { on_delete: 'SET NULL', on_update: 'NO ACTION' },
        meta: {
          many_collection: 'directus_users', many_field: 'book_tenant',
          one_collection: 'book_tenants', one_field: null,
          one_allowed_collections: null, junction_field: null, sort_field: null,
        },
      });
      console.log('book_tenant relation recreated');
    }
  }
  // 2) rewrite user rows
  const users = JSON.parse(readFileSync(`${DIR}/users.json`, 'utf8'));
  let n = 0;
  for (const u of users) {
    const body = {};
    if (u.book_tenant != null) {
      body.book_tenant = tenantMap[u.book_tenant] ?? null;
      if (!body.book_tenant) console.log(`  ! user ${u.email}: unmapped book_tenant=${u.book_tenant}`);
    }
    if (Array.isArray(u.book_tenant_ids)) {
      body.book_tenant_ids = u.book_tenant_ids.map((t) => tenantMap[t]).filter(Boolean);
    }
    if (Object.keys(body).length) {
      await api('PATCH', `/users/${u.id}`, body);
      n++;
    }
  }
  console.log(`users updated: ${n}`);
}

const phase = process.argv[2];
const run = { backup, down, up, users }[phase];
if (!run) { console.log('usage: migrate-book-uuids.mjs <backup|down|up|users>'); process.exit(1); }
run().catch((e) => { console.error('FATAL', e); process.exit(1); });
