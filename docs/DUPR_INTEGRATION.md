# DUPR PARTNER Integration — Reference

## Overview

DinkMatch integrates with DUPR (Dynamic Universal Pickleball Rating) as a **PARTNER** platform. This document captures what was built, how it works, what's blocked, and what remains.

**Integration type:** PARTNER-only (no CLUB integration)
**Backend approach:** Directus Flows only (no custom backend service)
**Environment:** UAT (`https://uat.mydupr.com/api`)

---

## DUPR API Reference

### Base URLs

| Environment | API Base | SSO Iframe |
|---|---|---|
| UAT | `https://uat.mydupr.com/api` | `https://uat.dupr.gg/login-external-app/:clientKey` |
| Production | `https://prod.mydupr.com/api` | `https://dashboard.dupr.com/login-external-app/:clientKey` |

### Key Endpoints

| Purpose | Endpoint | Auth |
|---|---|---|
| Partner token | `POST /auth/v1.0/token` | `x-authorization: <base64(client_key:client_secret)>` |
| Refresh user token | `POST /auth/v1.0/refresh-token` | Body: `{ refreshToken }` |
| Get Basic User Info | `GET /user/v1.0/details` | `Authorization: Bearer <userToken>` |
| Submit match | `POST /match/v1.0/saveMatch` | `Authorization: Bearer <partnerToken>` |
| Bulk submit (up to 100) | `POST /match/v1.0/saveMatchInBulk` | `Authorization: Bearer <partnerToken>` |
| Update match | `PUT /match/v1.0/updateMatch` | `Authorization: Bearer <partnerToken>` |
| Delete match | `DELETE /match/v1.0/deleteMatch?matchCode=...` | `Authorization: Bearer <partnerToken>` |
| Fetch entitlements | `GET /subscription/v1.0/subscriptions` | `Authorization: Bearer <userToken>` |
| Register webhook | `POST /v1.0/webhook` | `Authorization: Bearer <partnerToken>` |
| Subscribe to ratings | `POST /v1.0/webhook/subscribe` | `Authorization: Bearer <partnerToken>` |
| Unsubscribe from ratings | `POST /v1.0/webhook/unsubscribe` | `Authorization: Bearer <partnerToken>` |
| Webhook schema (RATING) | `GET /v1.0/webhook/schema/RATING` | None |

### DUPR Documentation Links

- Main docs: https://dupr.gitbook.io/dupr-raas
- SSO Login: https://dupr.gitbook.io/dupr-raas/integration-checklist/sso-login.md
- Match Upload & Management: https://dupr.gitbook.io/dupr-raas/integration-checklist/match-upload-and-management.md
- Ratings and Webhooks: https://dupr.gitbook.io/dupr-raas/integration-checklist/ratings-and-webhooks.md
- User Gating (Entitlements): https://dupr.gitbook.io/dupr-raas/integration-checklist/user-gating.md
- Developer FAQ: https://dupr.gitbook.io/dupr-raas/reference/developer-faq.md
- UAT Swagger: https://uat.mydupr.com/api/swagger-ui/index.html
- Production Swagger: https://prod.mydupr.com/api/swagger-ui/index.html

### Token Lifetimes

| Environment | Access Token | Refresh Token |
|---|---|---|
| UAT | 7 days | 30 days |
| Production | 30 days | 90 days |

Partner token lifetime: 1 hour.

---

## Directus Collections

### `dupr_settings` (Singleton)

| Field | Type | Description |
|---|---|---|
| `api_base_url` | String | DUPR API base (e.g. `https://uat.mydupr.com/api`) |
| `environment` | String | `uat` or `production` |
| `client_key` | String | Partner client key (public, used in SSO iframe) |
| `client_secret` | String | Partner client secret (server-side only) |
| `submit_flow_url` | String | Trigger URL for Submit DUPR Matches flow |
| `connect_flow_url` | String | Trigger URL for Connect DUPR flow |
| `disconnect_flow_url` | String | Trigger URL for Disconnect DUPR flow |
| `rating_flow_url` | String | Trigger URL for Fetch DUPR Rating flow |

**Current UAT values:**
- `api_base_url`: `https://uat.mydupr.com/api`
- `environment`: `uat`
- `submit_flow_url`: `https://api.dinkmatch.club/flows/trigger/41606a0f-59c5-45ec-8567-f308b31df55b`
- `disconnect_flow_url`: `https://api.dinkmatch.club/flows/trigger/b294a945-7e3e-41ed-983f-9636c723b14a`

### `dupr_connection`

Stores safe, non-secret connection state per user.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user` | UUID (FK → directus_users) | DinkMatch user ID |
| `dupr_id` | String | Verified DUPR player ID |
| `environment` | String | `uat` or `production` |
| `status` | String | `connected` or `disconnected` |
| `singles_rating` | Number, nullable | DUPR singles rating |
| `doubles_rating` | Number, nullable | DUPR doubles rating |
| `rating_updated_at` | Timestamp, nullable | Last rating update |
| `connected_at` | Timestamp | When SSO completed |
| `disconnected_at` | Timestamp, nullable | When disconnected |

### `dupr_credentials`

Private token storage. No public/player/moderator/admin policy has access. Only Directus flows can read/write.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `connection` | UUID (FK → dupr_connection) | Related connection |
| `access_token` | String (masked) | DUPR user access token |
| `refresh_token` | String (masked) | DUPR refresh token (rotates on use) |
| `access_expires_at` | Timestamp | Access token expiry |
| `refresh_expires_at` | Timestamp | Refresh token expiry |

### `dupr_submission`

Per-match submission status.

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `match_key` | String | Canonical match identifier |
| `club` | UUID (FK → club) | DinkMatch club |
| `status` | String | `pending`, `submitted`, `failed`, `unknown`, `deleted` |
| `dupr_match_code` | String, nullable | DUPR match code (saved on success) |
| `submitted_by` | UUID (FK → directus_users) | Admin who submitted |
| `submitted_at` | Timestamp | When submitted |
| `environment` | String | `uat` or `production` |
| `error_message` | Text, nullable | Sanitized error on failure |

### `directus_users.dupr_id`

Added to the system `directus_users` collection. Stores the verified DUPR ID directly on the user record. Synced to local player objects during cloud sync and used in match JSON snapshots.

---

## Directus Flows

### 1. Connect DUPR (Webhook POST)

**Trigger URL:** Stored in `dupr_settings.connect_flow_url`
**Flow ID:** (configured in settings)

Flow:
1. Reads `dupr_settings` for API base and credentials
2. Receives SSO payload (`accessToken`, `refreshToken`, `duprId`, `userId`)
3. Verifies identity via DUPR Basic User Info API
4. Upserts `dupr_connection` record
5. Stores tokens in `dupr_credentials`
6. Updates `directus_users.dupr_id`
7. Returns safe profile summary (no tokens)

### 2. Submit DUPR Matches (Webhook POST)

**Trigger URL:** `https://api.dinkmatch.club/flows/trigger/41606a0f-59c5-45ec-8567-f308b31df55b`
**Flow ID:** `41606a0f-59c5-45ec-8567-f308b31df55b`

Flow:
1. Reads `dupr_settings`
2. Validates `matchKeys`, `clubId`, `userId`
3. Reads completed matches from `completed_match` collection
4. Reads connected DUPR users from `dupr_connection`
5. Builds PARTNER payloads (no `clubId`, `matchSource: "PARTNER"`)
6. Validates: missing DUPR IDs, duplicate players, tied scores
7. Generates Base64 auth header (pure JS — no Buffer/btoa in Directus sandbox)
8. Obtains partner token from `/auth/v1.0/token`
9. Submits each match to `/match/v1.0/saveMatch`
10. Persists results to `dupr_submission` (submitted/failed/unknown)
11. Returns safe JSON summary

**Payload requirements:**
- `matchSource`: `"PARTNER"` (always)
- No `clubId` field
- Singles: one player per team, `format: "SINGLES"`
- Doubles: two players per team, `format: "DOUBLES"`
- `matchType`: `"RALLY"`
- Scores in `game1`; `game2`-`game5` are 0
- All 4 players (doubles) or 2 players (singles) must have DUPR IDs

**Response shape:**
```json
{
  "results": [{ "matchKey": "...", "status": "...", "duprMatchCode": null, "error": null }],
  "submitted": 0, "failed": 0, "unknown": 0, "total": 0
}
```

### 3. Disconnect DUPR (Webhook POST)

**Trigger URL:** `https://api.dinkmatch.club/flows/trigger/b294a945-7e3e-41ed-983f-9636c723b14a`
**Flow ID:** `b294a945-7e3e-41ed-983f-9636c723b14a`

Flow:
1. Gets authenticated user ID from trigger
2. Reads active `dupr_connection` for that user
3. Updates connection status to `disconnected`
4. Deletes `dupr_credentials` for that connection
5. Clears `directus_users.dupr_id` to NULL
6. Returns `{ status: "disconnected", duprId: "..." }`

### 4. Refresh DUPR Token (Another Flow trigger — internal)

**Purpose:** Called internally by other flows (Fetch Rating, eligibility check) to refresh expired user tokens.

Flow:
1. Reads `dupr_settings` for API base
2. Reads `dupr_credentials` by connection ID
3. Checks if access token is still valid (skips refresh if so)
4. Checks if refresh token is expired (errors — user must re-login)
5. Calls `POST /auth/v1.0/refresh-token` with the refresh token
6. Updates `dupr_credentials` with new rotated token pair
7. Returns new access token

### 5. Receive DUPR Rating (Webhook POST)

**Trigger URL:** `https://api.dinkmatch.club/flows/trigger/664e9ba0-589e-4a38-a757-cf73a7307a70`
**Flow ID:** `664e9ba0-589e-4a38-a757-cf73a7307a70`

**Registered with DUPR UAT** as the webhook endpoint for `RATING` topic.

Flow:
1. Receives `RATING` or `RATING_SEED` events from DUPR
2. Extracts `duprId`, singles/doubles ratings, metrics
3. Updates `dupr_connection` record with fresh ratings
4. Ignores other event types
5. Returns 200 OK immediately (DUPR requires fast response)

**DUPR webhook registration:**
- Endpoint: `POST https://uat.mydupr.com/api/v1.0/webhook`
- Body: `{ "webhookUrl": "...", "topics": ["RATING"] }`
- Auth: `Authorization: Bearer <partnerToken>`
- Response: `{ "status": "SUCCESS", "message": "Client Hook registered ok" }`

---

## Frontend Implementation

### Files

| File | Purpose |
|---|---|
| `src/composables/useDupr.ts` | DUPR service: SSO, connect/disconnect, submit, settings, submissions |
| `src/pages/PlayerPage.vue` | Profile DUPR connect/disconnect UI |
| `src/pages/ClubPage.vue` | Completed match submit (single + bulk), triple-dots menu, confirmation dialogs |
| `src/components/DuprLogo.vue` | Reusable DUPR logo component |
| `src/assets/dupr-logo.png` | Official DUPR favicon/logo |
| `src/components/MatchMetaChips.vue` | DUPR status chips (submitted/failed/pending) |
| `src/components/club/AddPlayerDialog.vue` | Club member check-in with `duprId` from server |
| `src/types/matchMeta.ts` | `duprStatus` type |

### SSO Flow (Frontend)

1. User clicks "Connect DUPR" in profile
2. `useDupr.openSsoIframe()` creates a full-screen iframe:
   - UAT: `https://uat.dupr.gg/login-external-app/<base64(clientKey)>`
   - Production: `https://dashboard.dupr.com/login-external-app/<base64(clientKey)>`
3. `allow="payment"` attribute set on iframe
4. `window.addEventListener('message', handler)` listens for postMessage
5. Validates origin (`https://uat.dupr.gg` or `https://dashboard.dupr.com`)
6. Extracts `userToken`, `refreshToken`, `duprId` from event data
7. Sends tokens to Connect DUPR flow for server-side verification
8. Caches connection in LocalStorage

### Match Submission UI

- **Single submit:** Triple-dots menu on each completed match → "Submit to DUPR"
  - Disabled (with lock icon) when not all players have DUPR IDs
  - Club-ID confirmation dialog (matching Data Management pattern)
- **Bulk submit:** "Submit All" button in completed matches toolbar
  - Right-aligned with DUPR logo
  - Tooltip positioned to the left
  - Club-ID confirmation dialog
- **Status chips:** Show submitted (blue check), failed (red), pending (blue) in MatchMetaChips

### Data Flow: dupr_id

1. Player connects DUPR via SSO → `dupr_connection` created, `directus_users.dupr_id` updated
2. Club members loaded → `dupr_id` fetched from `directus_users` (line 460 in `useClubMembers.ts`)
3. Player checks in → `duprId` passed to `checkInPlayer` as `extra` field
4. Cloud sync → `dupr_id` synced from `directus_users` to local `Player.duprId` (ClubPage.vue ~line 2580)
5. Match completes → `team_a`/`team_b` JSON snapshots include `duprId`
6. Submit flow → reads `duprId` from JSON snapshot, falls back to `dupr_connection` lookup

### Club Switch Data Contamination Fix

When switching clubs (different URL), the following UI state is cleared via a `watch(currentClubId, ...)`:
- `completedMatchKeyMap` — match key mappings
- `Dupr.state.submissions` — DUPR submission statuses
- `clubSettingsSearch` — settings search filter
- `showClubQrDialog` / `clubQrCodeDataUrl` — QR dialog state
- `_isClubSubscriptionExpired` — subscription status
- `_adminMatchStats` — cached match stats

Core data (players, queues, matches, settings) is already per-club cached in LocalStorage under `matchmaking_state_<clubId>`.

---

## Confirmation Pattern

Both single and bulk DUPR submission use the same club-ID confirmation as Data Management:

- Persistent Quasar dialog
- Text prompt: `Type "<club ID>" to confirm`
- Confirm button disabled until exact match
- Uses `confirmWithClubId` from `useDataManagement.ts`

---

## Commits

| Commit | Description |
|---|---|
| `797b110` | feat: add DUPR PARTNER integration with SSO, submission UI, and status chips |
| `0479e03` | feat: add DUPR logo, club-id confirmation, disable non-DUPR matches, sync dupr_id, remove manual entry |
| `c69ac9d` | feat: add server-side DUPR disconnect flow, remove update/delete (handled on DUPR) |
| `049a821` | fix: clear per-club UI state on switch and remove forced HTTPS in dev |
| `186d490` | build: rebuild PWA artifacts with DUPR integration and club switch fixes |

---

## Blockers

### DUPR UAT SSO CORS Bug (CRITICAL)

DUPR's UAT SSO iframe at `https://uat.dupr.gg` cannot call `https://api.uat.dupr.gg/auth/v1.0/login-read-only-token` because DUPR's API does not return `Access-Control-Allow-Origin` headers. This blocks all SSO login in UAT.

**Impact:** No player can connect DUPR. No credentials stored. No ratings fetched. No eligibility checked. No submissions tested end-to-end.

**Workaround:** None from our side. This is a DUPR infrastructure issue.

**Action:** Contact `tech@mydupr.com` to report the CORS misconfiguration on UAT.

**Testing setup:** We configured a Cloudflare tunnel at `https://uat.dinkmatch.club` pointing to `localhost:9000` (HTTP) to test from a public HTTPS domain. CORS was added to Directus (`CORS_ORIGIN` includes `https://uat.dinkmatch.club`). The SSO still fails because the error is inside DUPR's own iframe, not our origin.

---

## What's Not Done

### Eligibility Checking (BASIC_L1)

**Status:** Not implemented (blocked by SSO CORS)
**Plan:** Add to `build_payloads` in Submit DUPR Matches flow — for each player, fetch entitlements using their user access token, verify `BASIC_L1` is present in `tournaments` array. Cache for up to 24 hours.
**Endpoint:** `GET /subscription/v1.0/subscriptions` with `Authorization: Bearer <userToken>`

### Fetch DUPR Rating (Hardening)

**Status:** Existing flow exists but needs hardening (blocked by SSO CORS)
**Flow ID:** `7e6e70b0-22c6-4a83-9cf2-4105e5c9e097`
**Plan:** Authorize requested data, resolve verified identity, fetch authoritative ratings, persist freshness, return safe summary.

### Subscribe Users to Rating Webhooks

**Status:** Not done (blocked by SSO CORS)
**Plan:** After SSO connect, subscribe the user's `duprId` to `RATING` topic via `POST /v1.0/webhook/subscribe`. This triggers a `RATING_SEED` event immediately.
**Note:** Cannot subscribe users who haven't completed SSO (returns 400 Bad Request).

### Match Update/Delete Lifecycle

**Status:** Skipped by decision — handled on DUPR platform directly
**Rationale:** User decided that match edits and deletions are managed on the DUPR platform itself, not via API from DinkMatch.

### Tunnel for Local Testing

**Status:** Working
**Setup:** Cloudflare named tunnel `uat.dinkmatch.club` → `http://localhost:9000`
**DNS:** CNAME `uat.dinkmatch.club` → `a636d4ed-a1c9-4190-bf12-e80e6b40c40e.cfargotunnel.com`
**Config file:** `%APPDATA%\com.administrator.tunnel-cloudflared-desktop\accounts\dinkmatch.club\uat.dinkmatch.club.yml`
**Note:** Quasar dev server runs HTTP (basicSsl plugin removed from `quasar.config.ts`)

---

## Next Steps

1. **Report DUPR UAT CORS bug** to `tech@mydupr.com`
2. **Test SSO** from `https://uat.dinkmatch.club` once DUPR fixes CORS
3. **Add eligibility checking** (BASIC_L1) to Submit flow's `build_payloads`
4. **Harden Fetch DUPR Rating flow** (`7e6e70b0-22c6-4a83-9cf2-4105e5c9e097`)
5. **Subscribe connected users** to rating webhooks after SSO
6. **Test full submission flow** end-to-end with real DUPR UAT accounts
7. **Switch to production** when UAT testing is complete (update `dupr_settings.environment`, `api_base_url`, SSO iframe URL)
