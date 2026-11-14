# PVP Netcode Latency — Fix Plan (6-agent debate, R1-R3 converged)

**Constraint set:** free-only (no paid TURN/servers), same-WiFi PRIMARY (RTT ~1-5ms), remote secondary.
**Method:** 6 specialists (transport, netcode, bandwidth, render, skeptic, research) → R2 cross-exam → R3 binding votes.

## Root cause (verified by code + math)

The complaint is **NOT raw network latency**. On same-WiFi (RTT≈2ms), the guest's hit→ball-response dead air is **~95-135ms of self-inflicted pipeline latency**: 20Hz broadcast quantization (~25-50ms) + 50ms interpolation offset + frame times. Three correctness bugs compound it: magnet desync, stale-input ghost paddle, sfxQueue leak.

## Latency budget (guest hit → ball responds)

| Path | LAN RTT=2ms | WAN RTT=150ms |
|---|---|---|
| Before | ~95-135ms settle | ~245-285ms |
| After v1 (est.) | **~35-50ms** | ~130ms |

## Phase 0 — Instrumentation (~50 lines, gate: baseline captured)

`window.__dqmNet` debug handle + metrics in `useP2P.ts`/`useGameEngine.ts`:
- `posDivergence` = |playerPos − latest `ap`| p50/p95 @1Hz (guest) — sizes desync
- `stateGaps` histogram (inter-arrival p50/p95/p99, count >66/100/200ms) — host-jank detector
- `pingStats` ring buffer (RTT + inter-pong gap)
- `payloadBytes` = JSON.stringify(state).length sampled
- FPS EMA + `observeLongTasks()` (perfTelemetry already exists)
- Join-phase marks: joinRoom entry → onPeerJoin → peerVerified → gameReady
- **WAN add-on (deferred):** ICE getStats candidateType/RTT/loss, pong clock-offset

## Phase 1 — Proven bugs (ship regardless of measurement)

| Fix | Lines | File |
|---|---|---|
| **Disable magnet in PvP** — `!isPvP` gate on `playerMagnet`/`aiMagnet` (localStorage difficulty differs per device → paddle desync → phantom kitchen faults) | ~4 | `useGameEngine.ts:1460,2890` |
| **Stale-input decay** — host records `lastInputAt` on receive; `updateRemotePlayer` treats ax/az=0 after >300ms silence (ghost paddle slides for minutes on hidden guest) | ~10 | `useP2P.ts:636`, `useGameEngine.ts:2880` |
| **sfxQueue guard** — only push when `isPvP && isHost && playing`; cap ~8; clears stale-burst edge | ~5 | `useGameEngine.ts:313` |
| **Wall-clock broadcast timer** — `performance.now()` deltas not sim `dt` (host <20fps → ~15Hz effective → guest interp misalignment) | ~3 | `useGameEngine.ts:3246` |
| **Measured interp interval** — guest `t` uses observed inter-arrival EMA not hardcoded 0.05 | ~10 | `useGameEngine.ts:3354` |

## Phase 2 — Dead-air elimination (~140 lines)

| Fix | Lines | Notes |
|---|---|---|
| **Contact-confirmation (b)** — on `sendGuestFault('collision')`: swing anim + `paddleHit` sfx + subtle ball lurch. **Critical:** `pendingHit` window suspends Hermite interp + guest bounce/fault tracking until post-hit snapshot (seq>hitSeq) or ~150-200ms timeout — else fabricated bounce-faults | ~40-50 | `useGameEngine.ts:3143-3185,3293+` |
| **Ball dead-reckoning always-on** — render ball at latest snapshot + OWD offset, integrate bv+gravity between arrivals (extends existing :3440-3448 which freezes >200ms) | ~30 | `useGameEngine.ts:3293-3449` |
| **Payload diet** — hoist `pp2/ap2/hn/gn/lpm` to send-once/on-change; `sfx`/`ss`/`gs` on-change only | ~30 | `useGameEngine.ts:3250-3288` — ~55-65% smaller |
| **30Hz broadcast** — `STATE_BROADCAST_INTERVAL` 0.05→0.033 post-diet (measured-interval makes it safe); revertible constant | ~1 | `useGameEngine.ts:395` |

## Phase 3 — Presentation (~35 lines)

| Fix | Lines | Notes |
|---|---|---|
| **Opponent paddle Hermite** — finite-difference `pp`/`ap` velocity (pmd/pmz channels exist, ×PLAYER_MAX_SPEED) through `hermiteLerp` instead of damp λ=10 (0.35m trail at RTT=0). Fallback: λ→20 | ~30 | `useGameEngine.ts:3381` |
| **Local sfx on guest events** — play own-side paddleHit/ballBounce immediately, not via snapshot sfx array | ~5 | `useGameEngine.ts:525` |

## Phase 4 — Gated WAN/ops items (only if telemetry demands)

| Item | Gate | Effort |
|---|---|---|
| **Unreliable+unordered negotiated channel** for state/input (events/ping stay reliable) — `pc.createDataChannel('game',{negotiated:true,id:1,ordered:false,maxRetransmits:0})` via `room.getPeers()`, WeakMap-guarded | state-gap p99 >200ms on WAN OR loss stalls observed | ~40 lines + test matrix |
| **CF Durable Object signaling** — `createTopicStrategy` ~30 lines Worker on existing api.dinkmatch.club CF account (free tier confirmed Apr 2025); join 2-8s→<1s | join p95 >4s in Phase-0 marks | ~80 lines Worker + import swap |
| **Render fixes** — dpr `[1,2]`→`[1,1.5]`, drop always-visible `backdrop-filter`, merge court meshes | vs-AI test shows FPS<50 on target device | varies |
| **Event-driven ball** (fixed-timestep + seeded RNG) — the true end-state | residual dead-air >50ms after v1 | ~300-400 lines |
| **Lag-comp ring buffer** (~500ms guest paddle history, rewind on tryHit) | hit-accuracy complaints on WAN | ~50 lines |

## Rejected (debate consensus)

- **Rollback/lockstep netcode** — sim is non-deterministic (Math.random in tryHit/doServe, damp integration, variable dt)
- **WebTransport** — client→server only, no P2P mode; needs server
- **geckos.io/Colyseus** — requires always-on server + UDP ports; violates free-only P2P model
- **Full mirror-sim on guest** — doubles divergence surface; dead-reckoning captures ~80%
- **Bigger jitter buffer** — channel is ordered+reliable, no reordering possible; JITTER_BUFFER_SIZE=3 is vestigial
- **Input rate increase** — change-detection already bypasses cap on every real input (Netcode self-corrected)

## Dissent recorded

- **Netcode (D2)** dissented on V2/V4: wants 60Hz ball-only deltas + 20Hz full as v1, not deferred. Argument: pairs with render-newest model, halves quantization. Orchestrator ruling: deferred to v1.1 A/B — adds second seq-space (bseq ordering is make-or-break) for ~25ms gain; measured-interval + dead-reckoning captures most benefit safely.
- **Research (D6)** dissented on V5: ship CF DO now (free tier confirmed, join already bad). Orchestrator ruling: gated — it's ~80 lines untested Worker code + ops dependency for a once-per-match cost; Phase-0 join marks will almost certainly trigger it.

## Measurement gates

| Phase | Gate to proceed |
|---|---|
| 0→1 | Baseline captured (≥3 same-WiFi matches) |
| 1 | Tests green; magnet-disable doesn't break AI mode |
| 2 | posDivergence p95 <0.15m; no new fault miscalls; fault-rate unchanged |
| 3 | Subjective A/B feel; stateGaps p95 stable |
| 4 | Each item: its own telemetry trigger (above) |

## Verification

- `npm test`, `npm run typecheck`, `npm run lint`
- Same-WiFi A/B: two devices, before/after — dead-air self-report, posDivergence, stateGaps
- vs-AI control test (isolates render from netcode)
- Rebuild `docs/` on ship (Node ≥22.22.0)
