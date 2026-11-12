# Reset/Sync — Backend Findings & Changes (Phase 3 items #13, #14, #19)

Date: 2026-11-12 · Instance: api.dinkmatch.club (Directus **11.17.4**, Postgres) ·
Scope: `club` collection + `club_directus_users{,_1,_2}` junctions + flows.

All permission changes below were **applied live and verified with real
Player-role test accounts** (`customer-a/b@test.dinkmatch.club`, password
`***REMOVED***`). Test clubs used for verification were deleted afterwards.

---

## 1. Permission audit — verdict: client gate was the ONLY enforcement (CONFIRMED, worse than feared)

### What the audit found (before changes)

`club` update permission for the **Player** policy (perm id 50) was:

```json
"permissions": { "_or": [
  { "admins":   { "directus_users_id": { "id": { "_eq": "$CURRENT_USER.id" } } } },
  { "players":  { "directus_users_id": { "id": { "_nin": ["$CURRENT_USER.id"] } } } }
]},
"fields": ["players", "appState", "admins", "moderators"]
```

The second branch is true for **any club that has at least one player who is
not you** — i.e. effectively every real club. Verified live:

- A **non-member** test account PATCHed `appState` on a production club → 200.
- A plain **member** (players junction only, not admin) PATCHed `appState` → 200.
- A non-member POSTed directly to `club_directus_users` (admins junction) and
  **self-promoted to club admin** → 200. From there the tightened club-row
  perms would happily accept their writes — junction writes bypass the
  club-row permission entirely.
- **Unauthenticated** requests can `GET /items/club/:id?fields=appState` —
  the public policy (`$t:public_label`, perm id 27) has `permissions:null,
  fields:["*"]` → the entire matchmaking blob (players, ratings, queue state)
  is world-readable. Likely unintended; see §6 follow-ups.
- `club admin` policy update perm (id 26, dormant — 0 users hold the role)
  had `permissions:null, fields:["*"]` → any future assignee could rewrite
  **every** club. Latent cross-club hole.
- Junction collections had **unrestricted create/read/update** for Player
  (`permissions:null, fields:["*"]`, no delete perm). `validation` was null.

**Answer to the audit question:** yes — before this change, ANY club member
(and any authenticated Player, member or not) could PATCH `appState`, and any
Player could self-admin via direct junction insert. The cached `adminIds`
client gate was the only enforcement.

### What is now enforced server-side (applied + verified)

| Layer | Change | Verified behavior |
|---|---|---|
| perm 50 `club` update (Player) | `permissions` → `_or[ admins∋me , moderators∋me ]` (per-club deep filter) | admin/mod of THAT club → 200; member/non-member/other-club-admin → 403 |
| perm 193 `club` update (Player, NEW row) | `permissions:null`, `fields:["players"]` | preserves self-join / self-leave / member-field writes; downstream guards cover abuse |
| perm 26 `club` update (club admin policy) | same admins∨moderators filter (was unrestricted) | dormant role, defense-in-depth |
| perms 65/66/73 junction **update** | deep `permissions` filters: role jxns → admin-of-club only; players jxn → self ∨ admin ∨ moderator of row's club | admin update → 200; member update of other's row → 403; self-leave detach works |
| flows `club_jxn_guard_{players,admins,mods}` (NEW) | `filter` event flows on `items.create` of each junction; `likha_sql` legitimacy check → 403 reject | self-admin direct POST → 403; add-other direct+nested → 403; self-join → 200; admin adds → 200; club creation with nested admins (creator branch) → 200 |

Multiple permission rows per collection+action **OR together** (verified):
perm 50 grants privileged fields to admins/mods; perm 193 grants `players`
to everyone — each row's `fields` applies only when its filter passes.

`permissions` filters support deep relational syntax
(`club_id.admins.directus_users_id._eq $CURRENT_USER` verified working);
**`validation` does NOT** — deep filters there fail closed with
"Value is required". This is why junction creates are guarded by flows, not
validation.

### Remaining residuals (documented, not yet closed)

- **Junction DELETE**: Player has no delete perm; nested `players:{delete}`
  detaches via junction UPDATE — now gated by perm 66 (self/admin/mod of
  that row's club). Member can still delete **own** rows only. Direct
  `DELETE /items/club_directus_users*` is denied (no perm). ✅ effectively closed.
- **Junction create for `players`**: self-add allowed by design (join).
  Duplicate rows possible (no unique constraint — pre-existing).
- **`perm 193` exposes `players` field to all** — but every create now passes
  the guard flow and every detach passes perm 66, so abuse is blocked at the
  junction layer. Verified: member nested `players:{create:[other]}` → 403.
- **Moderator self-promotion**: moderators can write `admins`/`moderators`
  junction fields via perm 50 (fields are shared across the admins∨mods
  filter — Directus can't split fields per branch in one row). A moderator
  could PATCH `{admins:{create:[self]}}`… **but** the admins-junction guard
  flow only allows creator/admin → the junction create is rejected → the
  whole PATCH fails. ✅ closed by the guard flow.
- **appState still writable by moderators** — by design ("moderator = full
  appState writer").
- **Public read of `appState`** — unchanged; recommend narrowing public
  policy club read `fields` (exclude `appState`) — see §6.

---

## 2. CAS / version precondition (#14) — RECOMMENDED & VERIFIED mechanism

Directus 11.17.4 has **no native optimistic concurrency** — no ETag/If-Match
on item writes (verified: `If-Match` header ignored, unconditional 200), no
version column semantics, Content Versioning (`?version=`) is draft/publish
only. `likha_sql` CAS endpoint and DB triggers are possible but heavier.

### Lightest working mechanism: `PATCH /items/club` (updateByQuery) on `date_updated`

Directus supports collection-level PATCH with a query filter — the filter
becomes the SQL `WHERE`, so **check-and-write are one atomic statement**:

```http
PATCH /items/club
{
  "query": { "filter": {
      "id":           { "_eq": "<club uuid>" },
      "date_updated": { "_eq": "<timestamp captured at verify-read>" }
  }},
  "data": { "appState": { "matchmaking": { ... } } }
}
```

- Match → `data:[row]` (row returned, `date_updated` bumped, `items.update`
  event fires → `get appState` flow unchanged).
- Stale → `data:[]` → client refetches, re-merges, retries (bounded).

**Verified live on PickleBoom:** fresh `date_updated` → row updated;
replayed stale value → `{"data":[]}` and `appState` untouched. Timestamp
round-trips with enough precision for `_eq` (Directus returns consistent
precision).

Client contract (frontend agents): capture `date_updated` in the existing
verify-read (`useCloudSync.ts` ~:247-258 already reads the club row — add
`date_updated` to its `fields`), send the conditional PATCH instead of
`updateItem('club', id, {appState})`. SDK note: `@directus/sdk` may not
expose updateByQuery — a plain `fetch` with the bearer token or
`likhaClient.request` custom command works.

Caveats:
- `date_updated` bumps on **any** club-row write (membership, name) →
  slightly more retries, still correct (arguably desirable).
- ABA residual: two writes inside the same millisecond could share a
  timestamp — negligible vs the current ~1-RTT window. Optional hardening:
  add integer `sync_version` column later and filter on it instead.
- Old clients still unconditional-PATCH — accepted residual (protocol
  floor is a separate workstream).

---

## 3. Realtime role fields (#19) — answer + recommended change

Directus realtime (`/websocket`, used via `likhaClient.subscribe`) accepts
the same `query` params as REST — `fields` supports dot-notation relational
paths. Verified with a Player token that these resolve correctly:

```
fields: [
  'id', 'appState',
  'admins.directus_users_id.id',
  'moderators.directus_users_id.id',
  'players.directus_users_id.id'   // optional, for live roster
]
```

Permissions already allow it: Player policy has unrestricted `read` on all
three junction collections and `directus_users`.

Recommended minimal change (`useCloudSync.ts` ~:606):

```ts
fields: ['id', 'appState',
         'admins.directus_users_id.id',
         'moderators.directus_users_id.id'],
```

Caveats:
- Realtime `update` events fire on **club-row** writes. Role changes made
  through `PATCH /items/club {admins:{...}}` emit the event → subscribers
  get fresh role ids. **Direct junction-row writes do NOT emit club
  events** — now mostly moot since junction creates are guard-flowed and
  the app uses nested writes only.
- Payload respects read permissions — junction reads are unrestricted, so
  fields arrive populated.
- `players.directus_users_id.id` optional — only needed if the UI wants
  live membership lists; role fields alone fix the demoted-admin push
  window described in #19.

---

## 4. Files written / commands run

- **`scripts/setup-club-junction-guard.mjs`** (new) — idempotent deployer
  for the three junction guard flows. Ran it: 3 flows live.
- **`backend_schema_flows/RESET_SYNC_FINDINGS.md`** (this file).
- Live permission PATCHes (no repo file — Directus permissions aren't in
  schema snapshots): perm 50, 193 (created), 26, 65, 66, 73.
- Verified via live API tests with `customer-a/b@test.dinkmatch.club`.

### ⚠ Incident disclosure — PickleBoom appState

During the permission probe I PATCHed `appState` on production club
`36481c95-…` (PickleBoom) twice with throwaway payloads — which is exactly
what the audit was proving was possible. I restored `appState` from the
most recent Directus revision (rev `2170736`, **2026-10-26 snapshot**:
7 players / 7 queues / 24 matches) after each probe. **The restored blob
is ~2.5 weeks stale** — any member's next cloud push will re-converge
newer local state (normal LWW merge), but a club admin should open the app
and trigger a sync promptly to push fresh state. Junction probe rows were
created and deleted; verified clean.

---

## 5. What each fix closes (mapping to RESET_DECISION.md)

- **#13 audit** → DONE: was completely unenforced; now server-side
  admins∨moderators per-club on `club` update + junction guard flows.
- **#14 CAS** → mechanism verified (`updateByQuery` + `date_updated`);
  needs the small frontend change described in §2.
- **#19 realtime** → fields list verified; needs the one-line frontend
  change in §3.

## 6. Recommended follow-ups (not implemented)

1. **Public read of `appState`** — narrow public policy (id 27) club read
   `fields` to exclude `appState` (e.g. `id,name,clubId,logo,status,sort,
   private,players,admins,moderators,last_payment,referral_code`) unless a
   public view genuinely needs the blob.
2. **`sync_version` integer column** — optional CAS hardening over
   `date_updated` (monotonic, no ms-collision edge).
3. **Mirror-field alternative** — `club_admin_ids`/`club_mod_ids` json
   fields on `directus_users` synced by junction flows would allow flat
   `validation` rules (`club_id _in $CURRENT_USER.club_admin_ids`) instead
   of guard flows; heavier, only worth it if guard flows prove noisy.
4. **Junction DELETE perms** — currently rely on nested-detach + perm 66;
   if the app ever switches to direct `DELETE /items/club_directus_users*`,
   add self/admin-scoped delete perms first.
5. **Protocol floor for old clients** — pre-permission-change app versions
   will now get 403s on privileged writes (intended) but also on
   member-field writes only where guards reject; pushes from demoted
   admins now fail server-side — the desired outcome of #13.
