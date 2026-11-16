# ClubPage Server-Load Audit (3-agent sweep)

Scope: will api.dinkmatch.club be overwhelmed by many concurrent
players/admins/mods on the Club page? Verdict up front: **viewers scale
fine to a few hundred; the club WRITE path falls over much earlier** —
the bottleneck is per-PATCH flow fan-out + ~1MB broadcast egress, not
request count.

## Per-client costs (verified)

- **1 WebSocket/tab** multiplexing 2 subscriptions: `club` update
  (full `appState` field!) + `dupr_submission` all-events
  (useCloudSync.ts:1040-1057, useDupr.ts:381-395).
- **Mount ≈ 11 request types**: payment_settings, readMe, club deep-read
  (~1MB: appState + members/admins/mods `_limit:-1`), report_player
  (**no limit**), completed_match keys (≤500), dupr_submission (≤500),
  dupr_settings, ratings-flow POST, feedback users batch; non-members
  also PATCH + a **second** ~1MB club read (useClubData.ts:234-257).
- **Steady idle ≈ 1 REST/min**: 60s member-scale ratings poll
  (useCloudSync.ts:1295-1298). Staleness poll (20s) sends **0 HTTP while
  the stream is healthy**; degraded = 1 slim GET/20s, drift → ~1MB pull.
- **Every tab-focus/visibility-resume** (3s throttle) = full ~1MB
  `loadClubData` + WS resubscribe (useCloudSync.ts:1131-1154,
  ClubPage.vue:3488-3511). Alt-tabging multiplies this.
- **Admin/mod mutation** = debounced CAS: slim probe GET + optional
  ~1MB GET + **~1MB PATCH of entire AppState** (useCloudSync.ts:467-563).
  Server then broadcasts full appState to **all N club subscribers**
  → egress ≈ pushes/min × N × ~1MB.

## THE bottleneck — `get appState` flow (flow-manager.json:4649-4711)

Trigger: `items.update` on `club` — **every club PATCH, no field
filter** (name/logo/member edits included, not just appState sync).

Per fire:
1. `get_players` exec loops **all** `appState.matchmaking.completedMatches`
   × teams × players → O(matches × 4) JS.
2. `trigger_save_completed_matches` — `iterationMode: parallel`,
   payload = **entire completedMatches array** → one `save completed
   match` sub-flow **per match**; each does rating exec +
   `completed_match` upsert (ON CONFLICT match_key — idempotent but the
   work still runs) + parallel `update player rating` per player.
3. `trigger_save_player_events` — parallel per player → user read +
   exec + event upsert.

`completedMatches` is only purged on **manual reset**
(`clearCompletedMatches`, matchmaking.ts:553-576) — grows unbounded
with club history. Cost per PATCH = O(M) parallel sub-flows ≈
1,000+ DB ops at M=200. CAS retries multiply. Nested amplifier:
`update player rating` writes `directus_users` → fires
`manual rating_updated_at` flow per update.

## Other amplifiers (ranked)

1. **`completedMatches.length` watcher fires on EVERY client** —
   realtime delivers the new match to all N viewers → each runs
   `fetchKeysUntilMapped` (1–7 GETs ≤500 rows, 4s retry loop) +
   `refreshPlayerRatings` (member-scale GET) per completion
   (ClubPage.vue:2878-2902, 3341-3360).
2. **Leaderboard dialog burst** — up to ~12 requests / ~6,600
   `completed_match` rows (`fields:*` + nested users) per open;
   `fetchDuoLeaderboard` paginates up to 10×500 sequentially; club/duo
   have **no fetched-guard** → refire on every toggle
   (useLeaderboard.ts:82-94, useDuoLeaderboard.ts:72-95,
   ClubPage.vue:3687-3699).
3. **`Submit DUPR Matches` flow** reads ALL connected `dupr_connection`
   rows unbounded per call (flow-manager.json:1136-1160).
4. **`Receive DUPR Rating` → nested `Refresh DUPR Entitlement`** — 2
   SQL UPDATEs + internal HTTP flow call (token + DUPR API) per webhook
   event; DUPR emits per match per player.
5. **Junction guard flows** — synchronous exec+SQL×3 per junction
   create; K-player signup = K in-request runs.
6. **`report_player` read has no limit** (playerReport.ts:319-335).
7. **Dashboard chart flows** — ~11 aggregation SQL per dashboard view.
8. **Permissions**: Player `club` update perm uses deep relational
   filters evaluated per row on every PATCH; junction collections have
   unrestricted Player read.

## Capacity math (rough)

| Scenario | Verdict |
|---|---|
| ~100-300 idle viewers | OK — ~1 REST/min each + WS idle; resume churn is the only spike |
| ~500+ viewers alt-tabbing | Egress bursts (500 × 1MB per focus wave) — noticeable, not fatal |
| 1 admin editing, small club (M<50) | OK-ish — fan-out ~hundreds of DB ops per PATCH |
| 1 admin editing, grown club (M>200) | **Falls over** — per-PATCH flow fan-out grows linearly; CAS retries multiply |
| Match completions during peak | N clients × (1-7 + 1) requests per completion + PATCH fan-out — burst risk |

## Fix priorities (not yet implemented)

1. Gate `get appState`: skip fan-out when completedMatches unchanged —
   e.g. client stamps `appState.pendingRatingSync` only when new
   completions exist, flow early-returns otherwise; or flow queries
   `completed_match` match_keys once and filters payload to NEW keys
   before fanning out (O(M) cheap read instead of O(M) sub-flows).
2. `completedMatches.length` watcher → restrict to roles that submit
   DUPR (admin/mod), or fetch keys filtered to unmapped matchIds in one
   GET instead of ≤7 retries.
3. Leaderboard dialog: add fetched-guards to club/duo tabs; consider
   server-side precompute.
4. `Submit DUPR Matches`: bound the `dupr_connection` scan (club/user).
5. `report_player`: add limit. Dashboard charts: cache aggregation.
6. Medium-term: shrink appState (completedMatches retention/trim) —
   reduces PATCH size, broadcast egress, AND flow fan-out input size.

## NOT COVERED / open questions

- Whether Directus WS subscriptions poll DB per-subscriber (version-
  dependent) — agents lacked web_search; verify against Directus docs.
- Exact appState byte size (the ~1MB figure is the repo's own comment
  estimate, not measured).
- `snapshot.json` in backend_schema_flows/ not examined.
- Whether `save completed match` sub-flow short-circuits already-
  processed match_keys before doing rating work (ON CONFLICT upsert
  suggests no — verify before sizing fix #1).
