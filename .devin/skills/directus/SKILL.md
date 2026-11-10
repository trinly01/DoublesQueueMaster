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

## Tenant isolation (VERIFIED on this instance — booking system)

Pattern used for `book_*` collections (`book_tenant` role/policy):

- **Read:** deep item filters work — e.g. `{tenant: {tenant_users:
  {user: {_eq: "$CURRENT_USER.id"}}}}`. Multi-tenant staff see all
  their venues.
- **Create/update:** item `permissions` filters do NOT constrain writes
  (a cross-tenant row WAS created in testing). Must add `validation`:
  `{tenant: {_eq: "$CURRENT_USER.book_tenant"}}` — requires a
  `book_tenant` integer field on `directus_users` (primary tenant).
  Deep-filter validation FAILS CLOSED ("Value is required") — don't use.
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
  `setup-booking-permissions.mjs`, `patch-booking-validation.mjs`.

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

## Booking system (in progress)

`book_*` collections LIVE: schema, permissions, nav folder `booking`,
and flows (`booking_ref` ✅ verified `BK-YYYY-NNNN`; slot_init,
collision_check, hold_expire_sweeper, proof_approved,
proof_auto_confirm, booking_status_mail created — verify each before
relying). Scripts: `setup-booking-{schema,permissions,customer-perms,
flows}.mjs`, `patch-booking-validation.mjs`. Design docs in
`booking-system/` — Model A locked. Remaining: customer /book routes,
collision guard hardening, more notification flows.
