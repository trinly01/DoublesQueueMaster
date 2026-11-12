# Reset Resurrection — Debate Decision Record

Six-agent adversarial debate (3 position papers + epoch redesign + 2 scenario matrices), 2 rounds, all agents cross-examined. This document records argued positions, concessions, unresolved tensions, and the orchestrator's rulings.

---

## 1. Root cause (confirmed by all parties)

`mergeAppState` checkpoint math has three defects; sync orchestration has four reliability gaps; privilege caching has one security gap. Non-admin devices self-heal (pull-only). The resurrection vector is **privileged devices** (admin/moderator) pushing merged state containing pre-reset entities.

| Path | Defect | Severity after debate |
|---|---|---|
| P1 | `guardFutureCheckpoint` zeroes legit server checkpoints on behind-clock devices → `effectiveResetAt=0` → unfiltered merge | Real, low-frequency trigger (needs skew > reset age) |
| P2 | Post-checkpoint entity touches survive filters (incl. spurious `updatedAt` bumps from `mergePlayerFromDB`) | **By-design LWW** — only true fix is per-entity tombstones (deferred) |
| P3 | `completedMatchesResetAt` winner-take-all LWW diverges from filter epoch → can persist 0, disabling saveState purge | **Real latent bug — unanimous #1 fix** |
| W1-W4 | TOCTOU PATCH, failed-push poll blackout, privilege staleness, club-switch pending loss | Sync-layer gaps, mostly orthogonal |

---

## 2. Debate positions and concessions

### Merge-layer minimalism (f160c689)
**Proposed:** bounded 24h skew guard + `Math.max` for `completedMatchesResetAt` + post-merge purge + actionLogs filter.
**Conceded in R2:** dropped post-merge purge pass (skeptic proved no-op); downgraded actionLogs filter to sign-off-gated; accepted sync-layer detection as complementary Layer 2; conceded scenarios 2/9 and privilege bugs are not theirs.
**Held:** `Math.max` is the unconditional must-ship; 24h bound as "floor-not-fix"; drift micro-fix (linkUpdatedAt/avoidUpdatedAt asymmetry between merge filter and saveState purge).

### Sync-layer detection (9bdcef0f)
**Proposed:** `detectServerResetAdvantage` — `server.XResetAt > local.XResetAt` per collection → surgical server-wins, no `Date.now()` in the comparison.
**Conceded in R2:** downgraded salvage filter to wholesale v1 (stamps are launderable — `mergePlayerFromDB`/`refreshPlayerRatings` bump `updatedAt=now`); ceded Path-3 `Math.max` to merge camp; ceded loadClubData hook to fast-follow; ceded ALL privilege/reliability/tab bugs to other workstreams.
**Held:** detection is the right primary mechanism — converts "is timestamp plausible?" (unanswerable under skew) into "has server adopted a reset I haven't?" (pure value comparison); complementary to merge filters, not substitute.

### Epoch redesign (6d681745)
**Proposed:** per-collection `resetEpochs` vector + entity epoch tags, immune to wall-clock.
**Conceded in R1:** deferred — 3-5× blast radius, doesn't escape LWW without server-issued sequencing, old-client compatibility breaks.
**Held in R2:** "clock-immune" is overstated (still compares two device-stamped wall-clocks); Directus `club.id` is UUID (no auto-increment), `version` int not atomic without CAS; `club_reset_epochs` collection could mint real sequence but only fixes ordering half.
**Recommendation:** ship hybrid + server `date_updated` as guard reference + purge-counter telemetry; revisit epoch only if `club_reset_epochs` lands AND telemetry shows ghosts reaching DUPR exports.

### Skeptic / test-first (da10f9e3)
**Proposed:** attack all camps, demand failing tests, rank by evidence.
**Conceded in R2:** upgraded purge extraction from "theater" to "harmless redundancy — drift fix is the real bug"; accepted sync-layer detection as "right design" (not the wholesale bypass originally attacked); elevated privilege fail-closed to ship set.
**Held:** REJECTED 24h bound as primary Path-1 fix — honoring a future checkpoint deletes up-to-δ of post-reset work (silent loss worse than resurrection) AND produces non-convergent merges across differently-clocked devices. Detection must be PAIRED with guard relaxation or it re-breaks on subsequent merges.
**Held:** Path-2 is by-design LWW (spec :3345 enshrines it); epoch redesign and wholesale bypass = unbounded silent loss.

### Edge-case matrix (bbe133c9)
**Delivered:** 10-scenario stress matrix traced through actual code.
**Key findings:** Scenario 2 (failed push blinds poll) only fixable sync-layer; Scenario 7 (hours-off clock) epoch wins, bounded skew fails; Scenario 9 (club switch) gap in ALL camps; Scenario 4 (post-reset-touch) is philosophical split needing product ruling.
**R2 hybrid scoring:** fixes/improves 6/10, neutral 2, **REGRESSES-RISK 1 (#7)**, uncovered 1 (#9).

### Multi-admin matrix (ddd66696)
**Delivered:** 8-scenario actor×device matrix + 5 security flags.
**Key findings:** demoted-admin unbounded push window (no TTL, realtime doesn't carry role fields); invisible privileged writer (admins M2M but not players M2M); reset-loss on logout (SPA nav, no pagehide, onUnmounted doesn't flush); two-tab races; moderator = full appState writer by design.
**R2 hybrid scoring:** content-resurrection FIXED for S1/S4/S6/S8; S2 PARTIAL (TTL bounds cold-start only); S3 PARTIAL (needs CAS); S5 PARTIAL (flush must precede auth clear); S7 LEFT OPEN.

---

## 3. Orchestrator rulings on unresolved tensions

### Ruling 1: Path-3 `Math.max` — SHIP UNCONDITIONALLY
Unanimous. Zero test breakage (all specs have value==stamp). Pure merge-internal correctness. Failing divergence repro first, then fix.

### Ruling 2: Sync-layer detection — SHIP as primary reset mechanism
All parties agree it's the right design. `server.XResetAt > local.XResetAt` is clock-immune for the comparison itself. Wholesale per flagged collection for v1 (salvage deferred — stamps launderable). `>` not `>=` (equal = already adopted, local edits legit).

**Required pairing (skeptic's catch):** detection alone is insufficient — an adopted future-dated checkpoint flows through `guardFutureCheckpoint` on subsequent merges → slow-clock peers zero it → resurrection returns. The guard must treat server-adopted checkpoints as trusted, OR detection must be paired with a guard relaxation. **This pairing is a ship-blocker, not optional.**

### Ruling 3: 24h skew bound — DEFER pending failing repro
Skeptic's technical argument is sound: honoring a future checkpoint deletes post-reset work (silent loss), and per-device clocks produce non-convergent merges. Merge-minimalist's counter (floor-not-fix) is also sound but the bound's safety depends on the pairing in Ruling 2. **Decision: write the skew repro test first; if detection+pairing closes Path 1, the bound becomes defense-in-depth for non-reset merges only.**

### Ruling 4: Post-merge purge pass — DROP standalone, KEEP drift fix
Skeptic proved it's a no-op (merged ⊆ filtered inputs). Merge-minimalist conceded. The REAL bug is the drift: merge filter includes `linkUpdatedAt`/`avoidUpdatedAt`/`lockUpdatedAt` but saveState purge omits them → merge keeps, saveState drops → flap. **Ship the 2-line predicate unification, not the purge pass.**

### Ruling 5: actionLogs — guard SHIP, filter SIGN-OFF-GATED
Missing `guardFutureCheckpoint` on `actionLogsResetAt` (:2510) is same bug class, 2 lines, zero test breakage. Content filter contradicts explicit tested contract (:4341 "Logs themselves are not deleted") — product decision required.

### Ruling 6: Scenario 7 regression risk — MUST SPECIFY CLAMP
Edge matrix caught a real regression: resetter with +2h clock stamps `T+2h` checkpoints → surgical filter evicts entities `<T+2h` → legit post-reset work deleted AND pushed. **Detection spec must include:** adopted checkpoints clamped to server `date_updated` (or bounded-skew window), and entity stamps on skewed devices need the same tolerance. This is a ship-blocker for the detection implementation.

### Ruling 7: Scenario 9 (club-switch pending loss) — SEPARATE WORKSTREAM
Gap in ALL camps. Detection can't fire for a push that never runs. Needs per-club pending-durability queue. Not a reset-resurrection fix — it's a sync-reliability bug that happens to affect resets.

### Ruling 8: Security findings — ELEVATE, PARTIALLY ORTHOGONAL
- **Demoted-admin unbounded push**: REAL. TTL on `club_meta_*` is defense-in-depth but insufficient (running session never re-checks). **True close = Directus PATCH permission on `club.appState`** — server-side verification at write instant. Client-side: fail-closed privilege (cached meta seeds UI, never sync-push until server-confirmed).
- **Invisible privileged writer**: client-fixable — intersect push-gate with member ids.
- **Reset-loss on logout**: flush must precede `clearLocalSession` (auth-ordering hole identified by multi-admin agent).
- **Two-tab races**: CAS covers both tabs and cross-device — prioritize over BroadcastChannel.
- **Moderator = full writer**: by design, not a bug.

### Ruling 9: Epoch redesign — STAYS DEFERRED
All parties agree. Residual holes (cross-clock ordering, hours-off skew tail, CAS-window fork) are real but rare. Revisit triggers: `club_reset_epochs` collection lands + telemetry shows DUPR corruption, or second reset-semantics bug appears.

---

## 4. Final fix architecture (consensus)

### Phase 1 — Ship now (proven bugs, testable)
| # | Fix | Owner camp | Test |
|---|---|---|---|
| 1 | `Math.max` for `completedMatchesResetAt` + explicit merged-field override | merge | failing divergence repro → fix → green |
| 2 | `detectServerResetAdvantage` helper (pure, cloudSyncHelpers.ts) | sync | unit specs per collection + edge cases |
| 3 | Hook detection at `applyServerMatchmaking` privileged+dirty (:445-454) + `performCloudSync` pre-push (:220-235) + verify (:247-258) | sync | orchestration specs (new useCloudSync.spec.ts) |
| 4 | Guard pairing: adopted checkpoints trusted / guard relaxation spec | merge+sync | skew repro test |
| 5 | Checkpoint predicate unification (linkUpdatedAt/avoidUpdatedAt/lockUpdatedAt in saveState purge) | merge | 2-line fix + spec |
| 6 | Poll-on-failed-push fix (don't skip poll while pending-from-failure) | sync | spec |
| 7 | Privilege fail-closed: cached `club_meta_*` seeds UI, never sync-push until server-confirmed | auth | failing test: demoted user + cached meta → push blocked |
| 8 | `useDataManagement.spec.ts` beforeEach backfill (missing checkpoint fields) | test | prerequisite for trusting reset assertions |

### Phase 2 — After Phase 1 evidence
| # | Fix | Gate |
|---|---|---|
| 9 | 24h skew bound OR trusted-epoch marker (decide via skew repro results) | failing skew test |
| 10 | `loadClubData` detection hook (replace `isRemoteReset`, fix repopulation bug) | Phase 1 stable |
| 11 | actionLogs content filter | product sign-off on "Logs themselves are not deleted" contract |
| 12 | Server `date_updated` as guard reference (partial skew mitigation) | Directus field availability |

### Phase 3 — Separate workstreams (not reset-resurrection)
| # | Item | Owner |
|---|---|---|
| 13 | Directus `club.appState` PATCH permissions audit | backend/infra |
| 14 | CAS/version precondition on appState PATCH (closes S3+S7 TOCTOU) | backend/infra |
| 15 | Club-switch pending-sync durability (per-club pending queue) | sync-reliability |
| 16 | Logout flush ordering (flush before clearLocalSession) + cache clearing | auth |
| 17 | Invisible privileged writer fix (intersect gate with member ids) | auth |
| 18 | Two-tab leader election or BroadcastChannel | sync-reliability |
| 19 | Realtime role-field subscription (admins/moderators in fields) | backend/schema |

### Deferred — revisit triggers documented
| # | Item | Trigger |
|---|---|---|
| 20 | Epoch redesign / `club_reset_epochs` collection | Directus seq available + DUPR corruption telemetry |
| 21 | Per-entity reset tombstones (Path-2 true fix) | product decision on LWW-vs-tombstone semantics |
| 22 | >24h skew bound | skew repro shows residual resurrection |

---

## 5. What each camp got right/wrong (debate scorecard)

| Camp | Right | Wrong/Conceded |
|---|---|---|
| Merge-minimalist | Math.max is must-ship; drift fix real; funnel argument valid | 24h bound unsafe as primary; purge pass no-op; underestimated detection's skew-immunity |
| Sync-layer | Detection is right primary mechanism; salvage overclaim corrected; ownership boundaries clean | Initially overclaimed "clock-immune"; loadClubData hook not ship-blocker; salvage filter downgraded |
| Epoch | Correctly identified LWW mismatch; honest cost-benefit | Overstated initial proposal; "clock-immune" detection still wall-clock; deferred correctly |
| Skeptic | Caught stale line refs; proved purge no-op; elevated privilege finding; rejected unsafe bound | Initially attacked surgical detection as wholesale bypass (strawman); upgraded appropriately |
| Edge matrix | Found scenario 9 gap; caught #7 regression risk; verified non-issues | "Clock-immune" claim only half-true (entity stamps still clock-derived) |
| Multi-admin | Found security bugs no merge fix solves; auth-ordering hole in flush; CAS covers S3+S7 | "Unbounded" overstated (fresh fetch overwrites on load); some claims need repros |

---

## 6. Test plan (failing-first per skeptic's protocol)

1. **Path-3 divergence repro**: side L `{value:7000, no stamp, settingsUpdatedAt:9500}` vs side S `{value:3000, stamp:6000}` → assert `merged.completedMatchesResetAt` equals filter epoch actually used. Predict FAIL → fix → green.
2. **Clock-skew repro**: local entity timestamps after reset checkpoint + local `lastModified > server.lastModified` + server collections empty + checkpoints set → assert merged players/queues/matches empty. Predict current FAIL → detection fix → green.
3. **Privilege fail-closed repro**: cached `club_meta_*` adminIds + demoted user → assert `performCloudSync` blocks push. Predict FAIL → fix → green.
4. **Missing-checkpoint repro**: server blob lacks `*ResetAt` fields → assert defined behavior (backfill-on-write or treat-as-advantageage).
5. **Constraint assertions that must stay green**: :2456/:3345 (post-checkpoint entities survive), :2537 (future-dated completedMatchesResetAt ignored — update offset if guard changes), :2572/:2776 (merge symmetry), :3428 (older stamp can't resurrect), :3399 (idempotent), :2256/:2286/:2324 (future-checkpoint guard — update if bound changes).

---

## 7. Residual risks (accepted)

- **Path-2 LWW resurrection**: post-checkpoint touches survive by design. Per-entity tombstones deferred. Inert ghost roster rows possible via `mergePlayerFromDB` timestamp bumps.
- **Cross-clock ordering**: `server.XResetAt > local.XResetAt` still compares two device-stamped wall-clocks. Reset-vs-reset ordering under skew stays ambiguous (epoch agent's residual).
- **Hours-off skew tail**: manual date changes/dual-boot RTC drift can exceed any bounded skew. Detection helps detection-side but entity stamps remain device-derived.
- **CAS-window fork**: ~1-RTT TOCTOU between verify-read and PATCH remains until server-side precondition lands.
- **Old-client vector**: peers running pre-checkpoint code push checkpoint-less blobs → detection can't fire → resurrection persists. Needs protocol version floor.
- **Scenario 9**: club-switch pending loss remains until sync-reliability workstream lands.

---

*Debate conducted per multi-agent protocol: bounded scopes, adversarial rounds, orchestrator-relayed arguments, filesystem handoffs. All file:line references verified against current codebase by at least two independent agents.*
