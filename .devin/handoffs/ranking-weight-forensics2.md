# Ranking forensics #2 — career-record players (Aira / Jaymar / Cyyy / Angelo)

Date: 2026-11-18. Club `22e52ef0-bf60-4bd1-bea8-ef66193edf35`. Live Directus data,
BOOKING_ADMIN_TOKEN via `.env` (never printed). Scripts (scratch): `scripts/career-players.mjs`,
`scripts/career-players2.mjs`; V8a run via `scripts/lb-v8.mts` → `.tmp-analysis/lb-v8-out.txt`.
Raw pulls: `.tmp-analysis/career-players-out.txt`, `career-players2-out.txt`.

Hypothesis under test: leaderboard's flat-1450 window replay is blind to career
strength — players with strong all-time records but quiet recent competitive
windows get invisible priors.

---

## 1. Per-player all-time vs window table

| Player (username) | uid | All-time W-L (WR%) | In-window (club+30d) | Competitive-only in-window | Rating first→latest (mean) |
|---|---|---|---|---|---|
| **Angelo** `baribalangelog110408#7cx` | 049d3771 | 183g **118-65 (64.5%)** | 47g 31-16 | 26g **13-13** | 1450→1549 (1531) |
| **Aira** `nairettap#yh3` (Aira Pastoral) | a2a86ed4 | 286g **156-130 (54.5%)** | 57g 33-24 | 26g **15-11** | 1450→1575 (1516) |
| **Jaymar** `maratajaymar187#rqa` | e803d0c1 | 207g **122-85 (58.9%)** | 50g 34-16 | 23g **14-9** | 1450→**1637** (1518) |
| **Cyyy** `quirimitcyrielle#7ln` | 45fc34a5 | 117g 55-62 (**47.0%**) | 37g 20-17 | 15g **8-7** | 1450→1493 (1442) |
| Jaira `jaijaipq431#3ka` (name-collision check) | 75fc4a06 | 192g 103-89 (53.6%) | 58g 28-30 | 24g **10-14** | 1450→1552 (1537) |
| Shai `shaira.agaceta#k3u` (disambiguation) | 3696e162 | 15g 6-9 (40%) | 15g 6-9 | 12g 5-7 | **1400**→1342 (1384) — new account |

Identity disambiguation: 'aira' also matches Jaira (jaijaipq431, 48 window
games — most active of the three) and Shai/Shaira (shaira.agaceta, only 15
all-time games, first rating 1400 = likely brand-new account). 'jaymar' =
maratajaymar187 confirmed single identity. 'cyyy' = Cyrielle/Cyyy Quirimit —
username does NOT contain 'cyyy'; found via name scan (22 window games).

**Career-vs-window verdict per player:**
- Angelo: career 64.5% but competitive-window 50% — strong career, average now. Hypothesis CONFIRMED.
- Aira: career 54.5%, comp-window 57.7% (15-11) — mildly above average both ways; modest case.
- Jaymar: career 58.9%, comp-window 60.9% (14-9) — genuinely good recently too; his low rank is volume (18-23 comp games) + insularity (24x Angelo's teammate circle — he IS Angelo's top teammate).
- **Cyyy: career 47% WR, rating mean 1442 — she is NOT a hidden strong player.** Below-average career and window; user perception not supported by data.
- Jaira: career 53.6% but comp-window 41.7% (10-14) — actually declining; career prior helps but results are poor.
- Shai: 15 games total, rating FALLING (1400→1342) — correctly invisible.

## 2. Is embedded `rating` career-cumulative? — YES (within sync history)
- **Every established player's FIRST recorded match snapshot = 1450** (flat seed),
  then evolves per match: Jaymar 1450→1637 over 207 matches, Cyyy 1450→1493 over
  117, Angelo 1450→1549 over 183. Latest ≈ post-all-time-record rating
  (58.9% WR → 1637; 47% WR → 1493 — ordering tracks career record).
- Exception: Shai first=1400 (new account, possibly different seed path).
- Conclusion: the field is cumulative Elo over ALL synced matches, NOT
  window-scoped and NOT reset — it CAN serve as career-memory warm start.
  Caveat: players who played before sync-tracking began still seed at 1450;
  history depth is bounded by when the system started recording.

## 3. Identity fragmentation — NONE
- All players: single userId throughout. Name variants exist but same uid:
  Aira Pastoral↔Nairetta Pastoral (279x/7x), Cyrielle↔Cyyy Quirimit (61x/56x),
  Shaira Joy↔Shai Agaceta. These are display-name edits, not splits —
  playerIdentityKey (userId) already merges them correctly.

## 4. V8a on competitive-only (latest-rating prior + surprise edges)
`runVariant(compInputs, {surpriseEdges:true, priorQ:buildQ('latest')})` — full
output in lb-v8-out.txt §"V8a-competitive". ρ(score,games)=0.7422, converged,
NaN=0.

Top-15: rands100 (62g 33-29), James89 (58g), Mikki88 (51g), Marivic87 (56g),
Cara85 (50g), Jowinski85 (50g), Osang83 (55g), Boyet70 (48g), EUNICE69 (37g),
angie67 (42g), Jel66 (44g), Alex66 (38g), Timot59 (34g), Marc Johnuel57 (39g),
Lenz57 (38g).

Tracked ranks — PROD-V8c (replay prior) → V8a-competitive (latest prior):
| player | replay-prior rank | latest-prior rank | prior Δ |
|---|---|---|---|
| Angelo | #32 | #31 | 0.591→0.615 |
| Aira | #39 | #38 | 0.609→0.644 |
| Jaira | #51 | #45 | 0.480→0.542 |
| Shai | #84 | #103 ↓ | 0.508→0.453 (latest rating fell to 1342 — correctly punished) |
| Jaymar | #54 | #47 | 0.623→0.679 |
| Cyyy | #110 | #99 | 0.535→0.580 |
| SHIRWIN | #46 | #37 | 0.830→0.968 |
| atthan | #47 | #44 | 0.836→0.852 |
| Sandro | #78 | #59 | 0.685→0.769 |
| jeo | #20 | #19 | 0.868→0.857 |
| trin | #22 | #20 | 0.701→0.731 |
| obal | #17 | #16 | 0.772→0.773 |
| marivic | #3 | #4 | ~same |
| jowinski | #6 | #6 | same |
| cara | #7 | #5 | 0.683→0.696 |

**Does career-memory prior help without leaf-inflation? YES, directionally:**
- Named players all move UP modestly (Jaymar +7, Cyyy +11, Jaira +6,
  Angelo/Aira +1) — correct direction, small magnitude.
- NO leaf inflation: SHIRWIN (prior 0.968!) only #37, atthan #44, Sandro
  3-0 → #59, Juha #79. Structural cap holds: low-game players' r ≈
  (1−λ)·prior + λ·flow with λ→small, so even prior≈1.0 can't reach the
  ~2.6 rawScore of leaders — they need flow, which needs games+connections.
- Shai correctly DROPS (#84→#103) — her latest career rating is low; the
  prior is honest in both directions.
- Top-15 order barely changes (rands/James/Mikki/Marivic/Cara/Jowinski) —
  established players' priors were already adequate; career memory mostly
  fixes the tail, not the head.
