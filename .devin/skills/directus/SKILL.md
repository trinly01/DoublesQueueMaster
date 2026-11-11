---
name: directus
description: Directus backend integration for DinkMatch/Zyberlab — likhaClient SDK, club M2M junction semantics, permission/policy patterns, flows & insights pointers. Invoke when touching Directus collections, club membership, payments, or planning the booking-system backend.
---

# Directus Backend (api.dinkmatch.club)

Headless Likha-ERP Directus instance. Frontend talks to it via
`src/services/likhaClient.ts` (`likhaClient.request(...)`, `getToken()`,
`LIKHA_URL`) using `@likha-erp/likha-sdk` helpers (`readItems`,
`updateItem`, `createItem`, `deleteItem`).

## Verified traps (learned the hard way in this repo)

- **M2M junction deletes take JUNCTION ids, not user ids.** Club
  membership lives in junction collections:
  `club_directus_users` = admins, `club_directus_users_1` = players,
  `club_directus_users_2` = moderators. Rows have numeric `id` +
  `club_id` + `directus_users_id`.
- **Nested relations cap at ~100 rows by default.** Any `players.*` /
  `admins.*` fetch MUST include `deep: { players: { _limit: -1 }, ... }`
  or big clubs silently truncate (this caused duplicate memberships —
  a member past row 100 looked "not a member" and re-join created dupes).
- **No unique constraint on (club_id, user_id)** — junction duplicates
  happen. App must dedupe members by user id and delete ALL junction
  rows for a user on remove/leave/demote.
- **Directus M2M "delete" detaches** (nulls `club_id`) rather than
  removing the row — orphans are inert, not corruption.
- **PATCH update syntax:** `updateItem('club', uuid, { players: { delete: [junctionIds] }, admins: { create: [{ directus_users_id: userId }] } })`.
- **Two loaders must stay in sync:** `useClubData.loadClubData` and
  `useClubMembers.refreshClubMembers` both write `clubMembers` —
  they share `src/services/clubMembersMapper.ts`. Never re-inline the
  mapping; drift = degraded member lists + broken junction deletes.

## Key collections (existing)

`club` (M2O everything: players/admins/moderators junctions, appState),
`completed_match`, `payment_settings` (`club_activation_payment_link`
→ Xendit invoice flow in `usePayment.ts`), `directus_users`,
`directus_files`.

## Likha-SDK notes

- `likhaClient.request(readItems(...))` returns `data` unwrapped.
- Fields lists need `as unknown as string[]` cast for nested paths.
- Auth errors → `handleAuthError(err, router)` pattern in composables.

## Same-backend-family knowledge (from Mitmit — verify before relying)

Mitmit runs the same Likha Directus platform; these patterns likely
apply but MUST be smoke-tested on api.dinkmatch.club first:

- **`likha_sql` flow op**: `type:"likha_sql"`, options `{"sql":"..."}`;
  inline `{{templates}}` only ($-namespaces, not op keys); output is raw
  pg QueryResult (`data.<key>.rows[0].d`); bypasses ACL — required for
  customer-triggered writes.
- **Event flows**: `options.scope` = event names (`items.create`),
  `collections` = collection names — swapped = silently never fires.
- **Ops writing cross-collection** need `permissions:"$full"` or run
  under triggering user's role; `emitEvents:false` on write-backs to
  avoid loops.
- **Insights panels**: metric `{collection,field,function,filter}`,
  bar/pie chart shapes; `$NOW`/`$CURRENT_USER` work in filters;
  custom charts via flow-powered panel extensions.
- Full detail: `C:/Users/trinm/Documents/GitHub/mitmit/.devin/skills/directus-flows` + `directus-insights`.

## Venue Dashboard — ECharts panels (VERIFIED on api.dinkmatch.club)

`likha-echarts-panel` extension is installed (panel type `echarts-panel`).
Builder: `scripts/setup-tenant-charts.mjs` — 5 charts live on the shared
"Venue Dashboard" (Revenue/Bookings 14d, Revenue-by-method, Busiest-hours,
Court-hours).

- **Panel options:** `{url: "/flows/trigger/<flow-uuid>", method: "GET"}` —
  NOT `{flow:{key:...}}`. The `flow` form makes the panel GET
  `/flows/{id}` first, which would force a `directus_flows` read grant on
  tenant roles; the `url` form skips that and still forwards the viewer's
  token via `useApi()`.
- **Flow shape:** webhook trigger, `accountability:"all"`,
  `options.error_on_reject:true`; ops `likha_sql` (key `gather`) → `exec`
  (key `chart`) returning a plain ECharts option object. Exec reads rows
  via `data.gather.rows` (likha_sql returns raw pg QueryResult).
- **`{{$accountability.*}}` renders inside likha_sql** (verified):
  `user`→uuid or literal `'null'` string, `admin`→`'true'/'false'`,
  `role`→uuid. Always compare user ids as `::text` — `'null'` is not a
  valid uuid and would 500 a `::uuid` cast.
- **Per-tenant SQL scoping (likha_sql bypasses ACL — mandatory):**
  `b.tenant::text IN (book_tenant_users ∪ book_tenant_ids jsonb ∪
  book_tenant)` subqueries on `directus_users`/`book_tenant_users`, OR'd
  with `'{{$accountability.admin}}' = 'true'` for admin preview.
  Verified: tenant-a ₱1200/13 bookings vs tenant-b ₱0/2, admin sees all,
  unauthenticated sees nothing.
- **ECharts options must be cloneable** — string formatter templates
  (`'{b}: ₱{c}'`) OK, JS functions 500 the panel.
- Grid quirk: positions must be ≥1 (x/y=0 collapses panels).
- **Slot dates are FUTURE-dated** (bookings sell upcoming court time) —
  operational charts (court hours, utilization, busiest hours) must use
  `s.date BETWEEN today AND today+N` forward windows, not "last N days".
  Revenue/bookings-created charts stay past-looking. Utilization capacity
  = opening hours (court row overrides venue `court IS NULL` row;
  `day_of_week` = JS getDay/pg dow, 0=Sun) minus `book_closures`
  (all_day or partial `date`/`date_start`+`date_end` + start/end times).

## Tenant isolation (VERIFIED on this instance — booking system)

Pattern used for `book_*` collections (`book_tenant` role/policy):

- **Read:** deep item filters work — e.g. `{tenant: {tenant_users:
  {user: {_eq: "$CURRENT_USER.id"}}}}`. Multi-tenant staff see all
  their venues.
- **Create/update:** item `permissions` filters do NOT constrain writes
  (a cross-tenant row WAS created in testing). Must add `validation`:
  `{tenant: {_eq: "$CURRENT_USER.book_tenant"}}`.
  Deep-filter validation FAILS CLOSED ("Value is required") — don't use.
- **Membership validation that DOES work:** store the user's allowed
  values as a json array field (`book_tenant_ids` on directus_users,
  synced from junctions by the `tenant_user_sync` flow) and validate
  `{field: {_in: "$CURRENT_USER.<json array field>"}}` — verified live:
  member value → 200, non-member → 400 listing valid ids.
- **Active-venue model (multi-venue staff):** `book_tenant` = venue new
  records stamp into; junctions = all accessible venues; staff switch
  via self-update perm on own user row (fields=[book_tenant],
  permissions={id eq $CURRENT_USER.id}, validation=the `_in` above).
  `book_tenant` field meta: `select-dropdown-m2o` + `{{name}}` template.
- **Auto-stamp:** permission `presets` resolve `$CURRENT_USER.<field>`
  server-side on create (e.g. `{tenant: "$CURRENT_USER.book_tenant"}`,
  plus walk-in defaults).
- **Role↔policy link:** `POST /access {role, policy}` (junction), NOT
  PATCH /roles.
- **Field-level security:** exclude columns from permission `fields`
  (e.g. `platform_fee`, `status`) — verified rejected on write.
- Relations item-routes (`/relations/{id}`) are unreliable on this
  instance — set `one_field` at creation time instead.
- Scripts: `scripts/setup-booking-schema.mjs`,
  `setup-booking-permissions.mjs`, `patch-booking-validation.mjs`,
  `setup-booking-multivenue.mjs` (active-venue picker + billing fields),
  `setup-booking-tenant-sync.mjs` (`tenant_user_sync` flow + backfill),
  `test-multivenue.mjs` (9-scenario multi-venue verification).

## Studio nav groups (VERIFIED)

- `directus_collections.meta.group` is a **FK to
  `directus_collections.collection`** — a nav folder IS a collection.
  The anchor renders as the folder header (its `icon`/`note` show).
- **`meta.hidden` on the anchor hides the WHOLE group.** To folder
  `book_*` we created visible singleton anchor `booking` — clicking it
  opens an empty form; harmless.
- `meta.sort` orders children *within* the group (per-group sequence).
- PATCH `{"meta":{"group":"booking","sort":N}}` merges meta cleanly.
- Live order: bookings→proofs→courts→payments→slots→closures→
  opening_hours→tenant_users→tenants→sport_types (daily-use first).
- Spec: `booking-system/08` Part 2b.

## Booking system — scenario-verified (63/63 PASS)

`scripts/test-booking-scenarios.mjs` exercises the full matrix against
live Directus: browse, nested booking+slot create, holds, collisions,
closures, multi-court, cross-tenant injection, payments, proofs,
approve/reject, walk-ins, cancels, hold expiry, both-paid race, dup
proofs, auto_confirm, concurrent race. Re-run anytime — fixtures are
idempotent (tenant "Test Arena" id=3, users *-test@test.dinkmatch.club).

### Hard-won traps from the simulation

- **Role `parent` inherits ALL permissions.** `book_tenant` had
  `parent: Player` → tenant users got Player validation on creates
  (walk-ins 400'd) and union reads (saw all venues). REMOVED — keep
  roles flat; grant app access via policy `app_access:true` instead.
- **`app_access` on the POLICY gates Studio login** — book_tenant
  policy was `app_access:false` → tenants couldn't open Studio at all.
  Now true. Player stays false (customers use the PWA).
- **API-created collections get NO system fields.** `schema:{}` skips
  `date_created`/`date_updated`/`user_created`/`user_updated` → sweeper
  SQL died on `b.date_created`. Added via
  `scripts/add-booking-system-fields.mjs` (special flags auto-populate).
- **Data-modifying CTEs share ONE snapshot.** Sibling CTE writes are
  invisible to each other's subqueries — sweeper's `expired` CTE must
  check `held_until` directly, not rely on `released` CTE output.
- **Collision determinism:** cancel overlapping slot only when an
  EARLIER slot exists (`s.id < n.id`) → lowest id always wins regardless
  of flow timing; 3-way concurrent race → exactly 1 survivor.
- **`all_day` closures must still check the date range** — `cl.all_day
  OR (...)` let one closure block every future date.
- **`POST /users` ignores `role`** on this fork — PATCH role after
  create. (Customer perms script comment about "parent→Player"
  inheritance was wrong — it's role.parent, now removed.)
- **`??` cannot mix with `&&` unparenthesized** in exec op code —
  `a ?? b && c` is a syntax error; always parenthesize.
- **Guest trigger shapes:** create→`$trigger.key`=PK + payload=body;
  update→`$trigger.keys[]` + payload=changed fields only (flat);
  normalize exec covers all.
- Mail ops: guard recipient email with exec before `mail` op or flows
  error on null `to` (intentional "skip:" throws are fine — they mark
  error counter but data is already committed).

## Flow trigger payloads (VERIFIED)

- `items.create` → `$trigger = {event, payload: <request body — NO
  id field>, key: <new row PK>, collection}`. The new PK is **`key`**,
  NOT `payload.id` — binding `{{$trigger.payload.id}}` into likha_sql
  produced `invalid input syntax for integer: "undefined"`.
- Robust normalize exec op (used in `booking_ref`):
  `t.key ?? t.keys?.[0] ?? t.payload?.keys?.[0] ?? t.payload?.id
  ?? t.payload?.item?.id` → return `{itemId}` for likha_sql binding.
- Debug technique: patch exec op to `throw new Error(
  JSON.stringify(data.$trigger))` — `flow_manager_last_run_message`
  on `/flows/{id}` reveals the real payload shape.
- Flow op listing: `/operations?filter[flow][_eq]={flowId}` — the
  link field is `flow`, and `position` is NOT a queryable field.

## Booking system — backend DONE, scenario-verified

`book_*` collections LIVE and fully tested (63/63 scenario checks).
Scripts: `setup-booking-{schema,permissions,customer-perms,flows}.mjs`,
`patch-booking-validation.mjs`, `add-booking-system-fields.mjs`,
`test-booking-scenarios.mjs`. Design docs in `booking-system/` —
Model A locked. Remaining: customer `/book` routes in the Quasar app,
reminder flows (need custom endpoint for per-row mail), tenant Studio
UX polish pass, pre-launch cleanup of Test Arena venue + test users.
