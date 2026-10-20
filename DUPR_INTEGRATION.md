# DUPR PARTNER Integration — Reference

## Overview

DinkMatch integrates with DUPR (Dynamic Universal Pickleball Rating) as a **PARTNER** platform. This document captures what is built, how it works, current status, and what remains.

**Integration type:** PARTNER-only (no CLUB integration — `matchSource: "PARTNER"`, no `clubId` in match payloads)
**Backend approach:** Directus Flows only (no custom backend service)
**Environment:** UAT (`https://uat.mydupr.com/api`)
**Scope:** Get `duprId` via SSO connect + report matches. Match management happens on the DUPR platform; update/delete API capability exists server-side for compliance and future wiring.
**Constraint:** DUPR flows must NEVER write `directus_users.rating` — that is the internal DinkMatch rating. DUPR data only lives in `dupr_*` collections.

> Last audited: 2026-10-16 against the live UAT OpenAPI spec (`GET /api/v3/api-docs`)
> and dupr.gitbook.io/dupr-raas. Endpoint paths below were verified by live
> probing — earlier docs listed paths that do not exist.

---

## DUPR API Reference (verified)

### Base URLs

| Environment | Partner API Base              | User API Base             | SSO Iframe                                                 |
| ----------- | ----------------------------- | ------------------------- | ---------------------------------------------------------- |
| UAT         | `https://uat.mydupr.com/api`  | `https://api.uat.dupr.gg` | `https://uat.dupr.gg/login-external-app/:clientKey`        |
| Production  | `https://prod.mydupr.com/api` | `https://api.dupr.gg`     | `https://dashboard.dupr.com/login-external-app/:clientKey` |

### Endpoints in use / verified live

| Purpose                  | Endpoint                                                           | Auth                                                | Status                                    |
| ------------------------ | ------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------- |
| Partner token            | `POST {api}/auth/v1.0/token`                                       | `x-authorization: base64(client_key:client_secret)` | ✅ verified                               |
| Get Basic User Info      | `GET {user_api}/public/user/info`                                  | `Bearer <userToken>`                                | ✅ path confirmed (401 w/o token)         |
| Create match             | `POST {api}/match/v1.0/create`                                     | `Bearer <partnerToken>`                             | ✅ verified (400 on bad body)             |
| Create matches bulk      | `POST {api}/match/v1.0/batch`                                      | `Bearer <partnerToken>`                             | ✅ in spec (≤100/request)                 |
| **Update match**         | `POST {api}/match/v1.0/update`                                     | `Bearer <partnerToken>`                             | ✅ verified (400 on bad body)             |
| **Delete match**         | `DELETE {api}/match/v1.0/delete` (body: `{matchCode, identifier}`) | `Bearer <partnerToken>`                             | ✅ verified                               |
| Register webhook         | `POST {api}/v1.0/webhook`                                          | `Bearer <partnerToken>`                             | ✅ registered for RATING                  |
| Subscribe user to RATING | `POST {api}/user/v1.0/subscribe/webhook-event`                     | `Bearer <partnerToken>`                             | ✅ wired into Connect                     |
| **User entitlements**    | `POST {user_api}/subscription/active`                              | `Bearer <userToken>`                                | ✅ wired into Connect → `eligibility` col |
| Unsubscribe              | `DELETE {api}/user/v1.0/subscribe/webhook-event`                   | `Bearer <partnerToken>`                             | ✅ in spec                                |
| User detail batch        | `POST {api}/user/v1.0/batch`                                       | `Bearer <partnerToken>`                             | ✅ in spec                                |
| User search              | `POST {api}/user/v1.0/search`                                      | `Bearer <partnerToken>`                             | ✅ in spec (SSO-connected only)           |
| Webhook schema           | `GET {api}/v1.0/webhook/schema/{topic}`                            | none                                                | ✅ public                                 |

### ⚠️ Paths that do NOT exist (seen in old docs/flows — do not reuse)

| Wrong path                                  | Correct                                   |
| ------------------------------------------- | ----------------------------------------- |
| `POST /match/v1.0/saveMatch` (405)          | `POST /match/v1.0/create`                 |
| `POST /match/v1.0/saveMatchInBulk`          | `POST /match/v1.0/batch`                  |
| `PUT /match/v1.0/updateMatch`               | `POST /match/v1.0/update`                 |
| `DELETE /match/v1.0/deleteMatch?matchCode=` | `DELETE /match/v1.0/delete` (JSON body)   |
| `POST /user/v1.0/details`                   | `POST /user/v1.0/batch`                   |
| `POST /v1.0/webhook/subscribe`              | `POST /user/v1.0/subscribe/webhook-event` |
| `GET /subscription/v1.0/subscriptions`      | `POST {user_api}/subscription/active`     |

Note: the live OpenAPI uses operationIds like `saveMatch`/`saveMatchInBulk` while
the _paths_ are `/create`/`/batch` — this mismatch caused the original submit bug.

### Request/response shapes (from live spec)

**Match create/update payload** (`ExternalMatchRequest` / `ExternalUpdateMatchRequest`):

```json
{
  "matchId": 12345, // update only — int64 = the dupr_match_code
  "identifier": "unique-id", // our match_key
  "location": "Newport Beach, CA",
  "matchDate": "yyyy-MM-dd",
  "teamA": { "player1": "L8EW8W", "player2": "O8GJV8", "game1": 11 },
  "teamB": { "player1": "A1B2C3", "player2": "D4E5F6", "game1": 7 },
  "format": "SINGLES|DOUBLES",
  "event": "Event name", // REQUIRED — string, minLength 1 (verified live 2026-10-20; older spec notes said optional)
  "bracket": "optional",
  "matchType": "SIDEOUT|RALLY",
  "clubId": 7614955351, // omit for PARTNER
  "matchSource": "CLUB|PARTNER"
}
```

Singles: omit `player2`. Response: `{status:'SUCCESS', result:{matchCode, hashedMatchCode}}` — **save `matchCode`** (needed as `matchId` for update).

**Delete**: `DELETE /match/v1.0/delete` body `{matchCode: "...", identifier: "..."}` (both required).

**Subscribe**: `{duprIds: ["2LKVPR"], topic: "RATING"}` — subscribing also fires one `RATING_SEED` event per player to the registered webhook.

### Token lifetimes

| Environment | User access | User refresh |
| ----------- | ----------- | ------------ |
| UAT         | 7 days      | 30 days      |
| Production  | 30 days     | 90 days      |

Partner token: ~1 hour. User tokens are **read-only**. Refresh tokens rotate on use — always store the new pair.

### Docs links

- Partner API: https://dupr.gitbook.io/dupr-raas
- Checklist: SSO Login · Ratings & Webhooks · User Gating · Match Upload & Management · Club Integration
- UAT Swagger (needs partner token): `https://uat.mydupr.com/api/v3/api-docs`

---

## Directus Schema

### `dupr_settings` (singleton)

| Field                          | Value / Purpose                                                  |
| ------------------------------ | ---------------------------------------------------------------- |
| `api_base_url`                 | `https://uat.mydupr.com/api`                                     |
| `user_api_base_url`            | `https://api.uat.dupr.gg`                                        |
| `environment`                  | `uat`                                                            |
| `client_key` / `client_secret` | DUPR partner credentials (server-only)                           |
| `submit_flow_url`              | `…/flows/trigger/41606a0f-59c5-45ec-8567-f308b31df55b`           |
| `connect_flow_url`             | `…/flows/trigger/6d8a2427-d681-4f93-8e4a-747b9d94c46a`           |
| `disconnect_flow_url`          | `…/flows/trigger/b294a945-7e3e-41ed-983f-9636c723b14a`           |
| `update_flow_url`              | `…/flows/trigger/bde4206c-b9d7-4eee-8f44-222f34bc9078` _(new)_   |
| `delete_flow_url`              | `…/flows/trigger/2e234c53-fba4-4dec-9683-5a84da8265c7` _(new)_   |
| `rating_flow_url`              | removed 2026-10-20 (broken flow deleted — webhooks supersede it) |

### `dupr_connection`

Safe per-user connection state. `user`, `dupr_id`, `environment`, `status` (`connected`/`disconnected`), `singles_rating`, `doubles_rating`, `rating_updated_at`, `connected_at`, `disconnected_at`. Unique per `user`.

### `dupr_credentials`

Private token store (flows-only access): `connection` FK, `access_token`, `refresh_token`, `access_expires_at`, `refresh_expires_at`.

### `dupr_submission`

Per-match status: `match_key` (unique), `club` (m2o), `status` (`submitted`/`failed`/`pending`/`update_failed`/`delete_failed`/`deleted`/`not_submitted`), `dupr_match_code`, `dupr_hashed_match_code`, `error_message`, `submitted_by`, `submitted_at`, `environment`.

### `directus_users.dupr_id`

Verified DUPR ID on the user record → synced to local `Player.duprId` → captured into `completed_match.team_a/team_b` JSON snapshots.

---

## Directus Flows (current)

### Connect DUPR — `6d8a2427-d681-4f93-8e4a-747b9d94c46a` (webhook POST)

`read_settings → verify_identity → fetch_entitlements → prepare_data → upsert_connection → update_user_dupr_id → upsert_credentials → gen_auth → get_partner_token → subscribe_rating_req → safe_response`

- `verify_identity`: `GET {user_api_base_url}/public/user/info` with the user's SSO token
- `fetch_entitlements` _(new)_: `POST {user_api_base_url}/subscription/active` with the user token → DUPR entitlements. **Non-fatal** — reject also advances to `prepare_data`
- `prepare_data`: unwraps the request-op HTTP envelope (`{status:200, data:{…}}`); accepts `result` OR `results[]` shapes; merges `subscriptions[].entitlements` into `dupr_connection.eligibility` (`{entitlements, eligible}` where `eligible` = `tournaments` contains `BASIC_L1`); extracts ratings from profile with SSO `stats` fallback; env-aware token lifetimes; resolves `userId` from `$accountability.user` — **the client's `body.userId` carries DUPR's numeric id (JWT `jti`), NOT a Directus UUID**
- `upsert_connection` / `upsert_credentials`: raw SQL with `"user"` quoted (Postgres reserved word) and `::uuid`/`::numeric`/`::timestamptz`/`::json` casts on bindings
- `gen_auth` + `get_partner_token` + `subscribe_rating_req` _(new)_: partner token → `POST {api_base_url}/user/v1.0/subscribe/webhook-event` `{duprIds:[duprId], topic:'RATING'}`. Linear fallthrough — rejects advance to `safe_response` (non-fatal)
- Body from client: `{accessToken, refreshToken, duprId, userId, stats}`
- **Schema note:** `dupr_credentials.access_token`/`refresh_token` widened `varchar(255) → text` (DUPR JWTs are ~900 chars). Directus field metadata may still display `varchar(255)` — the physical columns are `text`
- **Verified live 2026-10-19:** all 11 ops resolve; DUPR returned 200 on the RATING subscription; `eligibility = {entitlements:{tournaments:["BASIC_L1"]}, eligible:true}` persisted
- **Consent caveat:** minimal-consent SSO responses contain only `duprId` + `birthYear` — no ratings/name. Ratings populate via `stats` or the `RATING_SEED` webhook after subscribe.

> **Sandbox constraint (important):** `exec` ops have **no `fetch`/`require`/`axios`** — verified 2026-10-19. ALL outbound HTTP must be `request` ops; `exec` is for pure-JS transforms only. Any flow using `fetch` inside `exec` silently fails (the original `subscribe_rating` and `submit_to_dupr` both did — that's one more reason 0 calls ever reached DUPR).

### Submit DUPR Matches — `41606a0f-59c5-45ec-8567-f308b31df55b` (webhook POST)

`read_settings → prepare_matches → read_matches → read_connections → build_payloads → generate_auth_header → get_partner_token → submit_batch → map_results → persist_submissions → touch_submissions → safe_response`

- Validates ≤100 keys; `build_payloads` rejects missing duprIds / **ineligible players (`BASIC_L1` required — enforced 2026-10-20 via each player's connection `eligibility`)** / duplicate players / tied scores (failed entries persisted with `error_message`). Missing snapshot `duprId`s are hydrated from the live `dupr_connection` (`connMap[p.userId].dupr_id`), so players who connect **after** a match completes still submit correctly. Returns `payloadJson` for the batch body — **previously missing, so `submit_batch` sent an empty body (latent bug found + fixed 2026-10-20)**
- `read_connections` now fetches the `eligibility` field; `safe_response` reads `map_results.resultsJson` (it previously referenced a nonexistent `submit_to_dupr` op and would have thrown on every submit — fixed 2026-10-20). `persist_submissions` had the **same** stale `submit_to_dupr` reference in its SQL bindings → `resultsJson` bound as literal `undefined` → Postgres `22P02` crashed the flow before persisting (fixed 2026-10-20)
- Payload: `identifier=match_key`, `matchSource:'PARTNER'`, `matchType:'RALLY'`, **`event:'Open Play'` (required by the live spec — `minLength:1`, the doc previously listed it optional and DUPR rejected with `non-nullable creator parameter event`)**, `matchPlayType:'RECREATIONAL'`, `game1` only
- `submit_batch` _(new)_: single `request` op → `POST /match/v1.0/batch` with the payload array (replaces the broken per-match `fetch` loop — the sandbox has no `fetch`)
- `map_results` _(new)_: normalizes `BulkMatchResponse` (`matchCodes[].identifier` → `submitted`; `errors[].identifier` → `failed` with message) + pre-validation failures into `resultsJson` for persistence. Receives `submit_batch`'s reject too — a failed DUPR call marks all ready matches `failed`/`unknown` rather than killing the flow
- `persist_submissions` upserts by `match_key` via raw SQL — **now writes `club`** (was missing → statuses were invisible to the client)
- `touch_submissions` _(new, 2026-10-21)_: `item-update` op (`emitEvents: true`) that bumps `updated_at` on the just-written rows (`match_key _in` + `club` filter). Raw SQL writes bypass Directus events; this op emits a realtime `update` event per row so subscribed devices get instant push. Item-update applies one uniform payload per query — the heterogeneous per-row upsert stays in SQL; the touch op only exists for event emission
- **First real end-to-end submissions (2026-10-20):** `1792477993229_itcuaha` → `6341519664`, `1792477703424_match-1792477671707` → `8005452963`, `1792479271940_kdloyrx` → `7457431109` (via UI button). All three confirmed on DUPR's own API: `status:SUCCESS`, `confirmed:true`, `matchScoreAdded:true`, `eventFormat:DOUBLES`, `league:'Open Play'`. Caveat found: the flow's webhook trigger returns **HTTP 200 even on flow failure** — the client must check `result.submitted > 0`, not just `failed === 0` (false-positive toast fixed in `ClubPage.vue`)

### Update DUPR Match — `bde4206c-b9d7-4eee-8f44-222f34bc9078` (webhook POST) — OUT OF SCOPE

**Product decision (2026-10-21): DinkMatch only submits.** Edit/delete of reported
matches is managed on the DUPR platform itself — no UI in DinkMatch. This flow +
the Delete flow below are kept dormant as API capability only; do not wire to the
client.

`read_settings → prepare → read_submission → read_match → gen_auth → get_partner_token → do_update → persist → respond`

- Body: `{matchKey, clubId, match?}` — optional `match` overrides avoid the `completed_match` sync race
- Returns `not_submitted` (no `dupr_match_code`) / `submitted` / `update_failed`; `not_submitted` does not overwrite an existing status row
- Sends `matchId: Number(dupr_match_code)` + `identifier: match_key` to `/match/v1.0/update`

### Delete DUPR Match — `2e234c53-fba4-4dec-9683-5a84da8265c7` (webhook POST) — OUT OF SCOPE

Dormant — see Update note above. Same skeleton → `DELETE /match/v1.0/delete` `{matchCode, identifier}` → marks `dupr_submission.status='deleted'` (or `not_submitted`/`delete_failed`). If a match is edited/deleted on the DUPR platform, our local `dupr_submission` row is not notified — status drift is expected and acceptable while this stays out of scope.

### Disconnect DUPR — `b294a945-7e3e-41ed-983f-9636c723b14a` (webhook POST)

Clears connection, deletes credentials, nulls `directus_users.dupr_id`. Untested live.

### Receive DUPR Rating — `664e9ba0-589e-4a38-a757-cf73a7307a70` (webhook POST)

Registered with DUPR UAT for `RATING` topic (2026-10-16, handshake OK). `parse_webhook` handles `RATING` + `RATING_SEED` + tolerates handshake/unknown events; `update_rating` writes **only** `dupr_connection.singles_rating/doubles_rating` — never `directus_users.rating`.

### Refresh DUPR Token — `5d5cbeea-4589-468b-a9c8-78e1eef4e114` (operation, internal)

User-token refresh for other flows. 0 runs.

### Fetch DUPR Rating — `7e6e70b0-22c6-4a83-9cf2-4105e5c9e097` — DELETED 2026-10-20

Was broken (wrong path + `Buffer`), unused, and superseded by webhooks. Removed
along with the `rating_flow_url` setting to keep the integration surface clean
for the DUPR review.

---

## Frontend

| File                                | Role                                                                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/composables/useDupr.ts`        | Service: SSO iframe, connect/disconnect, `submitMatches`, `updateMatch`/`deleteMatch`, settings, submissions fetch + **realtime subscription** (`startSubmissionRealtime`/`stopSubmissionRealtime`, self-healing on stream drop) |
| `src/pages/PlayerPage.vue`          | Profile connect/disconnect UI, ratings display                                                                                                                                                                                   |
| `src/pages/ClubPage.vue`            | Single + bulk submit (club-name confirm), status→chip mapping, submit hidden when `submitted`, "Retry" for failures, readiness via **live-roster fallback**, key-map + submissions refetch on new completions and on reconnect   |
| `src/components/MatchMetaChips.vue` | `submitted`/failed(`update_failed`,`delete_failed`)+error tooltip/pending chips                                                                                                                                                  |
| `src/types/matchMeta.ts`            | `duprStatus`, `duprError`                                                                                                                                                                                                        |

### SSO → connect → duprId pipeline

1. Player clicks Connect → fullscreen iframe `login-external-app/<base64(clientKey)>` (`allow="payment"`), postMessage validated on DUPR origins
2. Tokens + `duprId` + `stats` → Connect flow → `dupr_connection` + `directus_users.dupr_id`
3. Club member sync pulls `dupr_id` → `checkInPlayer` → `Player.duprId` → `CompletedMatchPlayer.duprId`
4. Submit requires **every** player to have `duprId` (all-or-nothing `isMatchDuprReady`). Since 2026-10-21 `isMatchDuprReady` falls back to the **live roster** when the frozen match snapshot lacks an ID — players who connect DUPR after a match completes become submittable without editing old snapshots. `build_payloads` mirrors this server-side via `dupr_connection`

### Multi-device sync (2026-10-21)

`dupr_submission` is server-owned relational data — it is **not** mirrored into client-owned `appState` (stale clients would LWW-overwrite server truth). Sync pattern = **push-primary, pull-fallback**, same as `club` appState realtime:

- **Push**: `likhaClient.subscribe('dupr_submission')` filtered by current club, over the same WebSocket as the `club` subscription. Any event → `fetchSubmissions` (pull stays authoritative; events are accelerators, never replayed). Self-heals: on stream end it refetches once + retries the subscription after 10s
- **Pull**: fetch on club load, on `completedMatches` growth, on `isOnline` false→true reconnect (covers sleep/offline gaps), after local submit
- **Event emission**: `persist_submissions` is raw SQL → no Directus events; `touch_submissions` emits `update` events per row
- **Permissions**: Player policy (perm 76) reads `dupr_submission` scoped to club membership (`club.players|admins|moderators.directus_users_id = $CURRENT_USER`) — players get the same push+pull path as admins, fields limited to `id, match_key, club, status, dupr_match_code, submitted_at, environment, error_message`

---

## Status metrics

| Metric                  | 2026-10-16 audit                          | 2026-10-17 update                                                                                                                |
| ----------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `dupr_connection` rows  | 0 — connect never succeeded               | **1** — first real connect verified                                                                                              |
| `dupr_credentials` rows | 0                                         | **1** — tokens stored, UAT expiries correct                                                                                      |
| Connect flow            | 5/5 errored                               | **working end-to-end** (4 chained bugs fixed below)                                                                              |
| `dupr_submission` rows  | 58 — all `failed` "Players not connected" | unchanged — retest once players connect                                                                                          |
| `dupr_submission.club`  | NULL → fixed + 58 backfilled              | ✅                                                                                                                               |
| Calls reaching DUPR     | 0 (submit URL was 405)                    | ✅ 3 verified on DUPR's API 2026-10-20 — `6341519664`, `8005452963`, `7457431109` (all `confirmed:true`, `matchScoreAdded:true`) |
| RATING webhook          | registered                                | registered; **subscribe verified 200** on 2026-10-19 connect; `RATING_SEED` may arrive async                                     |
| Entitlement at connect  | ❌ not implemented                        | ✅ `BASIC_L1` → `dupr_connection.eligibility = {…, eligible:true}` (verified live)                                               |
| Entitlement at submit   | ❌ not enforced                           | ✅ enforced in `build_payloads` 2026-10-20                                                                                       |
| Stale `dupr_id` rows    | 4 (manual-entry leftovers)                | ✅ **0** — nulled 2026-10-20 (DUPR forbids manual ID entry)                                                                      |
| Update/Delete flows     | created + `not_submitted` smoke test      | unchanged — real-match test pending                                                                                              |

### Connect bugs found & fixed 2026-10-17

1. `prepare_data` checked `verified.status`/`verified.results` on the request-op HTTP envelope instead of `verified.data` — every connect threw "identity verification failed" after a successful DUPR response
2. `upsert_connection`/`upsert_credentials` SQL used unquoted `user` (Postgres reserved word)
3. `userId` bound DUPR's numeric id from `body.userId` instead of the Directus UUID from `$accountability`
4. `dupr_credentials.access_token`/`refresh_token` were `varchar(255)` — DUPR JWTs ~900 chars → widened to `text`

### Stale `dupr_id` rows — CLEANED 2026-10-20

4 `directus_users` had `dupr_id` set **without** a `dupr_connection` row (pre-SSO manual-entry leftovers — one was a username, not a real DUPR ID). Manual entry violates DUPR's "SSO only" rule, so all 4 were nulled via the API: Trin Pogi (`9PR00K`), Roku (`V26W76`), Cymon (`Seajquin39` — not a real ID), Jocel Bianca (`7K7OXN`). Affected users must re-connect via SSO to submit matches.

## Compliance checklist vs dupr.gitbook.io/raas

| Requirement                             | Status                                                                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSO iframe + postMessage                | ✅ implemented                                                                                                                                                                   |
| Identity verification + token storage   | ✅ verified live 2026-10-17                                                                                                                                                      |
| Rating displayed + webhook-updated      | ✅ wired (untested end-to-end — needs a connected user)                                                                                                                          |
| Match create (single + bulk)            | ✅ fixed (was hitting a 405)                                                                                                                                                     |
| Match update + delete                   | ➖ **Out of scope by product decision (2026-10-21)** — DinkMatch only submits; edit/delete is managed on the DUPR platform. Flows kept dormant, no UI                            |
| `matchCode` stored for lifecycle        | ✅                                                                                                                                                                               |
| Only admins submit                      | ✅ (`isCurrentUserAdmin`-gated)                                                                                                                                                  |
| Entitlement gating (`BASIC_L1`)         | ✅ fetched at connect → `dupr_connection.eligibility` (verified live); **enforced at submit since 2026-10-20** — ineligible players fail with a named error before reaching DUPR |
| Premium events (`PREMIUM_L1`)           | ❌ out of scope — we don't run DUPR+ gated events                                                                                                                                |
| Club `matchSource:"CLUB"` + role verify | ➖ N/A — PARTNER submissions only                                                                                                                                                |
| Resubmit same identifier                | ✅ guarded — submit hidden on `submitted`; retry allowed on `failed`                                                                                                             |

## Known issues / not done

- **Submission verified end-to-end 2026-10-20** — 3 matches confirmed on DUPR's own API (`6341519664`, `8005452963`, `7457431109`). Update/Delete flows are dormant (out of scope — see above).
- **`dupr_submission` has no `match_code` URL** — `dupr_match_code` isn't surfaced as a link to dupr.com.
- **Guests can't be submitted** — all-or-nothing readiness; matches with unregistered players can never reach DUPR (per policy this is correct — every player needs BASIC_L1).
- **Rating webhook e2e verified** — post-submission, real ratings landed in `dupr_connection` (e.g. `R4Q0MM` d:3.24, `2D2JO7` d:4.98, `DDQ0ZM` d:2.02). `QNQRW4` still null — likely an unrated/new DUPR account rather than a webhook gap.
- **Realtime push untested live** — `touch_submissions` emits per-row `update` events and the client subscription is coded, but instant cross-device propagation hasn't been observed on two real devices yet. Pull fallbacks guarantee convergence regardless.

## Still relevant: UAT SSO CORS

DUPR's UAT SSO iframe had a CORS issue calling `login-read-only-token` from inside `uat.dupr.gg`. If real SSO testing still fails with iframe-side CORS errors, report to `tech@mydupr.com`. (Separately, the server-side `results[0]` bug also broke every connect — that one is fixed.)

## Production cutover checklist

1. `dupr_settings.environment` → `production`, `api_base_url` → `https://prod.mydupr.com/api`, `user_api_base_url` → `https://api.dupr.gg`
2. Swap prod `client_key`/`client_secret`
3. Re-register the webhook URL against prod
4. SSO iframe already switches by `environment`
5. Email `tech@mydupr.com` for integration review (platform link, test accounts, compliance summary)
