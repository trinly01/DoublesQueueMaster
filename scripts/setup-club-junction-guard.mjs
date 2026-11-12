/**
 * Club membership junction guards — filter flows that reject unauthorized
 * direct writes to the club_*_users* junction collections.
 *
 * Why: the Player policy has unrestricted create/update on
 * club_directus_users (admins), club_directus_users_1 (players) and
 * club_directus_users_2 (moderators). Any user could POST a junction row and
 * self-promote to club admin, bypassing every club-row permission.
 *
 * These filter flows run BEFORE items.create commits and reject the write
 * (403) unless the actor is allowed:
 *   players jxn : self-join, club creator, club admin, club moderator
 *   admins jxn  : club creator, club admin          (no self-join!)
 *   mods jxn    : club creator, club admin
 *
 * Nested M2M writes (PATCH /items/club {players:{create:[...]}}) emit the
 * same junction items.create events, so legitimate app flows pass through
 * the same checks. Deletes are untouched (no Player delete perm exists;
 * nested deletes already bypass junction perms — see RESET_SYNC_FINDINGS.md).
 *
 * Idempotent: rebuilds flows by name (delete + recreate).
 * Usage: node scripts/setup-club-junction-guard.mjs
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
const T = (v) => `{{${v}}}`;
const sql = (query, binding = []) => ({ sql: query, binding });

const UUID_RE = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

// op1: normalize + validate trigger payload (create body = junction fields).
// Throws → reject → 403. Covers direct REST creates AND nested M2M creates
// (both surface as items.create on the junction collection).
const guardExec = {
  name: 'guard_fields', key: 'guard_fields', type: 'exec',
  options: { code: `module.exports = function(data) {
    const t = data.$trigger || {};
    const p = t.payload || {};
    const user = (data.$accountability && data.$accountability.user) || null;
    const duid = p.directus_users_id;
    const club = p.club_id;
    const re = ${UUID_RE};
    if (!user || !re.test(user)) throw new Error('junction write requires an authenticated user');
    if (!duid || !club || !re.test(duid) || !re.test(club)) {
      throw new Error('junction write missing club_id/directus_users_id');
    }
    return { duid, club_id: club, user };
  };` },
};

// op3: final gate — throws when the SQL check says not allowed.
const judgeExec = {
  name: 'judge', key: 'judge', type: 'exec',
  options: { code: `module.exports = function(data) {
    const row = data.gate && data.gate.rows && data.gate.rows[0];
    if (!row || row.allowed !== true) {
      throw new Error('club membership write not permitted for this user/club');
    }
    return { proceed: true };
  };` },
};

// `reject` links must be unique in directus_operations — each guarding op
// gets its own identical throw-error target.
const mkDeny = (key) => ({
  name: `deny_${key}`, key: `deny_${key}`, type: 'throw-error',
  options: { status: '403', message: 'Club membership change not permitted' },
});

// players junction: self | creator | admin | moderator
const PLAYERS_SQL = `SELECT (
  ?::uuid = ?::uuid
  OR EXISTS (SELECT 1 FROM club c WHERE c.id = ?::uuid AND c.user_created = ?::uuid)
  OR EXISTS (SELECT 1 FROM club_directus_users a WHERE a.club_id = ?::uuid AND a.directus_users_id = ?::uuid)
  OR EXISTS (SELECT 1 FROM club_directus_users_2 m WHERE m.club_id = ?::uuid AND m.directus_users_id = ?::uuid)
) AS allowed`;
const PLAYERS_BIND = [
  T('guard_fields.duid'), T('guard_fields.user'),
  T('guard_fields.club_id'), T('guard_fields.user'),
  T('guard_fields.club_id'), T('guard_fields.user'),
  T('guard_fields.club_id'), T('guard_fields.user'),
];

// role junctions (admins / moderators): creator | admin  — NO self branch
const ROLE_SQL = `SELECT (
  EXISTS (SELECT 1 FROM club c WHERE c.id = ?::uuid AND c.user_created = ?::uuid)
  OR EXISTS (SELECT 1 FROM club_directus_users a WHERE a.club_id = ?::uuid AND a.directus_users_id = ?::uuid)
) AS allowed`;
const ROLE_BIND = [
  T('guard_fields.club_id'), T('guard_fields.user'),
  T('guard_fields.club_id'), T('guard_fields.user'),
];

const FLOWS = [
  {
    name: 'club_jxn_guard_players', icon: 'lock',
    description: 'Reject unauthorized players-junction creates (self/creator/admin/mod only)',
    collection: 'club_directus_users_1', sql: PLAYERS_SQL, binding: PLAYERS_BIND,
  },
  {
    name: 'club_jxn_guard_admins', icon: 'lock',
    description: 'Reject unauthorized admins-junction creates (creator/admin only — blocks self-promotion)',
    collection: 'club_directus_users', sql: ROLE_SQL, binding: ROLE_BIND,
  },
  {
    name: 'club_jxn_guard_mods', icon: 'lock',
    description: 'Reject unauthorized moderators-junction creates (creator/admin only)',
    collection: 'club_directus_users_2', sql: ROLE_SQL, binding: ROLE_BIND,
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
      status: 'active', trigger: 'event', accountability: 'all',
      options: { type: 'filter', scope: ['items.create'], collections: [spec.collection] },
    });
    const fid = flow.id;

    // Each op rejects to its OWN throw-error op (reject links are unique).
    const denyJudge = await api('POST', '/operations', {
      flow: fid, ...mkDeny('judge'), position_x: 90, position_y: 10,
      resolve: null, reject: null,
    });
    const denyGate = await api('POST', '/operations', {
      flow: fid, ...mkDeny('gate'), position_x: 70, position_y: 10,
      resolve: null, reject: null,
    });
    const denyGuard = await api('POST', '/operations', {
      flow: fid, ...mkDeny('guard'), position_x: 50, position_y: 10,
      resolve: null, reject: null,
    });
    const judge = await api('POST', '/operations', {
      flow: fid, name: judgeExec.name, key: judgeExec.key, type: judgeExec.type,
      position_x: 30, position_y: 10, options: judgeExec.options,
      resolve: null, reject: denyJudge.id,
    });
    const gate = await api('POST', '/operations', {
      flow: fid, name: 'gate', key: 'gate', type: 'likha_sql',
      position_x: 20, position_y: 10, options: sql(spec.sql, spec.binding),
      resolve: judge.id, reject: denyGate.id,
    });
    const guard = await api('POST', '/operations', {
      flow: fid, name: guardExec.name, key: guardExec.key, type: guardExec.type,
      position_x: 10, position_y: 10, options: guardExec.options,
      resolve: gate.id, reject: denyGuard.id,
    });
    await api('PATCH', `/flows/${fid}`, { operation: guard.id });
    console.log(`+ ${spec.name} (${spec.collection})`);
  }
  console.log('done');
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
