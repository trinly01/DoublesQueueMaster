# Match Imbalance Distribution — Live Directus Analysis (90 days)

**Purpose:** ground the rating-suppression threshold decision with the REAL
distribution of forecasted favorite win%, reconstructed from live
`completed_match` snapshots.

**Date analyzed:** 2026-11-23 (data through 2026-11-21). Window: `completed_at`
≥ 2026-08-25 (~87 days of activity inside the 90-day filter).
**Source:** `GET https://api.dinkmatch.club/items/completed_match` (read-only,
admin token from `.env`). Raw pull: `.tmp-analysis/matches-90d.json` (4,355
rows); enriched per-match computations: `.tmp-analysis/matches-90d-enriched.json`.
Scripts: `.tmp-analysis/{fetch-matches,analyze,final}.mjs` — do not commit.

## 1. Dataset

| Slice | n | Notes |
|---|---|---|
| Fetched (90d, all clubs) | 4,355 | 40 club UUIDs (+19 null-club rows) |
| **Analyzed** | **4,346** | excluded 9 bad-score rows (e.g. 11-100, 111-5, 6-0 — same `winScore>22‖<7` policy as `scripts/lib/loadFixtures.mjs`); 0 ties, 0 dup `match_key`, 0 empty teams |
| Production-competitive* | **2,834** | mode ∉ {`variety_first`,`fair_balance`} — matches production `isNonCompetitive` (matchmaking.ts:1648); includes 256 manual matches with no recorded mode |
| Explicit competitive modes | 2,578 | `balance_first` 402 + `balanced_variety` 1,053 + `strict_balance` 1,123 |
| Non-competitive modes | 1,512 | `variety_first` 1,429 + `fair_balance` 83 — ratings never apply here anyway |
| `ratingApplied===true` | 447 | competitive mode AND every player account-linked — the only rows where `directus_users.rating` verifiably moved |
| Match type | 4,315 doubles 2v2, 30 singles 1v1, 1 weird 2v1 | singles negligible |

\* **Primary decision slice = production-competitive (2,834).** Suppression is
moot for `variety_first`/`fair_balance` (ratings already skipped). The 256
no-mode rows are all `generationType:'manual'`; production treats undefined
mode as competitive, and 26 of them have `ratingApplied:true`.

All-time collection size is 6,158 rows (oldest 2026-06-07) — the 90d window
covers ~71% of all recorded history. No `completed_at=null` rows exist.

### Clubs (production-competitive n)

| Club | n | med fav% | ≥65% | ≥70% | ≥75% | max fav% |
|---|---|---|---|---|---|---|
| **Siklab Pickleball Club** (`22e52ef0`) | **1,679** | 53.0 | 91 | 34 | 7 | 82.0 |
| Dinkilicious (`a9f5add0`) | 367 | 51.2 | 1 | 0 | 0 | 65.8 |
| Dink or Drink (`f73429a2`) | 220 | 53.2 | 9 | 2 | 0 | 72.0 |
| Court Jumpers (`b06d80cc`) | 198 | 50.8 | 0 | 0 | 0 | 63.9 |
| Pickle Folk (`e1476f81`) | 69 | 51.8 | 0 | 0 | 0 | 61.4 |
| Court Jumpers (`90bcb7c3`) | 60 | 50.6 | 0 | 0 | 0 | 60.2 |
| Court Jumpers (`db1ba32e`) | 56 | 50.5 | 0 | 0 | 0 | 57.3 |
| adDINKted (`fc3d4ca8`) | 41 | 51.6 | 0 | 0 | 0 | 55.5 |

**Imbalance is essentially a Siklab phenomenon**: 91 of 106 prod-competitive
matches with fav%≥65 are Siklab's (86%); 34 of 39 with fav%≥70 (87%).
Siklab is also the club where ratings actually evolve (largest linked
roster). Other clubs' forecasts sit near 50-50 — mostly flat seed ratings.

## 2. Method (exact replica of production forecast)

Per match, ratings taken from the **inline `team_a`/`team_b` JSON snapshot**
(`{username, level, rating, …}`) — verified in `matchmaking.ts:1705-1728` that
the snapshot captures **pre-match** ratings (`calculateShift` returns copies;
originals in `teamA/teamB` keep pre-shift values). Formula replicated from
`matchmaking-core.ts:776-809`:

```
harmonic  = n / Σ(1 / max(1, rating || 1450))
arithmetic= Σ(rating || 1450) / n
teamRating= 0.6·harmonic + 0.4·arithmetic
favProb   = max(1/(1+10^((rB-rA)/400)), 1-that)
winner    = higher of team_a_score / team_b_score
```

Hand-verified on 4 matches (incl. a 1v1 and two 80%+ forecasts) — exact match.
Every snapshot player has a rating (0/17,323 missing). `rating || 1450`
JS-semantics preserved (0/undefined → 1450). Ratings are **per-club** (each
club's synced `appState` has its own player map) — snapshots are the correct
per-club forecast inputs; no `directus_users` lookup needed.

## 3. Headline histogram — favorite win% buckets

### Production-competitive matches (n=2,834) — PRIMARY

| fav win% bucket | n | favorite won | upset | favWon% | upset% |
|---|---|---|---|---|---|
| 50-60 | 2,548 | 1,436 | 1,112 | 56.4% | 43.6% |
| 60-65 | 180 | 131 | 49 | 72.8% | 27.2% |
| 65-70 | 67 | 58 | 9 | 86.6% | 13.4% |
| 70-75 | 31 | 25 | 6 | 80.6% | 19.4% |
| 75-80 | 6 | 6 | 0 | 100% | 0% |
| 80-85 | 2 | 2 | 0 | 100% | 0% |
| 85-90 | 0 | — | — | — | — |
| 90-95 | 0 | — | — | — | — |
| 95-100 | 0 | — | — | — | — |

**89.9% of competitive matches forecast ≤60% favorite.** Max observed
favProb in competitive play: **82.0%** (Siklab). Zero matches ≥85%.

### All analyzed matches, any mode (n=4,346) — for contrast

| bucket | n | favWon | upset |
|---|---|---|---|
| 50-60 | 3,752 | 2,089 | 1,663 |
| 60-65 | 329 | 246 | 83 |
| 65-70 | 153 | 131 | 22 |
| 70-75 | 74 | 65 | 9 |
| 75-80 | 25 | 21 | 4 |
| 80-85 | 11 | 10 | 1 |
| 85-90 | 2 | 1 | 1 |
| ≥90 | 0 | — | — |

### Non-competitive modes (n=1,512) — ratings already skipped

Same shape but heavier tail (stagnant seed ratings produce occasional
mismatches when a rated player wanders into an unrated session): 4.2% ≥70%,
max 87.4% — the only ≥85% matches in the whole dataset are `variety_first`
(Siklab, ratings ~1340 vs ~1675).

### `ratingApplied===true` only (n=447) — the verifiably-rated subset

Wider spread than the full competitive set (59.5% in 50-60 vs 89.9%):
8.5% ≥65%, 4.5% ≥70%, max 80-85 bucket (2 matches). Where ratings truly
move, imbalance is ~3× more common — small-n caveat applies.

## 4. Suppression thresholds — "rating-data loss" per T

Definition (per spec): suppressed = `favProb ≥ T AND favorite won`.
% shown for **prod-competitive (2,834)**; %of-all-4,346 in parens.

| T | suppressed n | % of prodComp | % of all 4,346 | matches p≥T (any result) | upsets kept @p≥T |
|---|---|---|---|---|---|
| 65 | 91 | **3.21%** (2.09%) | 106 | 15 |
| 70 | 33 | **1.16%** (0.76%) | 39 | 6 |
| 75 | 8 | **0.28%** (0.18%) | 8 | 0 |
| 80 | 2 | **0.07%** (0.05%) | 2 | 0 |
| 85 | 0 | 0.00% | 0 | 0 |
| 90 | 0 | 0.00% | 0 | 0 |

Explicit-modes-only slice (2,578) is nearly identical: T=70 → 22 (0.85%),
T=75 → 4 (0.16%), T≥85 → 0.

Cumulative favProb distribution (prodComp): <55%: 71.9% · <60%: 89.9% ·
<65%: 96.3% · <70%: 98.6% · <75%: 99.7% · <80%: 99.9% · <85%: 100%.

**Reading:** a suppression threshold anywhere in 70-80 would touch
**0.07-1.2% of competitive matches** — i.e. roughly 1-12 per 1,000 matches.
At T=75+ the policy would almost never fire on current data.

## 5. Trends & calibration caveats

- **Imbalance is growing as ratings mature.** ProdComp matches/month with
  fav%≥65: Aug 4/122 (3.3%) → Sep 4/537 (0.7%) → Oct 43/1,254 (3.4%) →
  Nov 55/921 (**6.0%**). Nov max fav% = 82%. Expect the ≥65 rate to keep
  rising as more clubs accumulate rated history — size thresholds with
  headroom, not at the current edge.
- **Forecast under-predicts favorites in the tail (small n).** fav%≥65 band
  (n=106): favorites actually won **85.8%** vs 69.3% mean forecast;
  fav%≥70 band (n=39): **84.6%** actual vs 73.5% forecast. Direction is
  consistent across bands (60-75: 77% actual vs ~64.5% forecast) — likely
  Elo lag + `0.6H+0.4A` understating team edges. Treat winProb as the
  *matchmaker's* forecast, not calibrated truth; real mismatches may be
  somewhat more decisive than the buckets suggest.
- Suppressed@70 matches are mostly blowouts (0-11, 1-11, 2-11, 4-11, 6-11,
  11-4, 11-5…) — exactly the low-information outcomes suppression targets.
  The 6 upsets at p≥70 are the high-value rating events any policy keeps.

## 6. Data caveats

- **Rating source = completion-time snapshot**, not reconstructed replay.
  It is the rating the matcher/clubs saw at scoring time — pre-match,
  per-club, includes guest-local ratings. Cannot recover ratings for players
  whose local state was reset (`*_resetAt` checkpoints) mid-window; snapshot
  still records whatever rating was live, which is what matters for the
  forecast.
- **Guests/unlinked:** `ratingApplied:false` + `unlinked_players` (495
  prodComp rows) — linked players' shifts are reverted locally and nothing
  persists to `directus_users`; guest local ratings still evolve and feed
  matchmaking. Included in prodComp since the forecast is still real.
- **`ratingApplied` field only exists on newer records** (447 true / 495
  false / 1,892 undefined within prodComp) — the `===true` slice is the
  only verifiably-rated subset and skews toward `balanced_variety` (331/447)
  and recent dates; treat its wider spread as suggestive, not definitive.
- **Manual no-mode matches (256)** counted as competitive per production
  semantics; excluding them moves T=70 suppression 33→22 (explicit slice).
- **9 excluded bad-score rows** (winScore>22 or <7, e.g. 11-100, 111-5, 6-0)
  — consistent with `loadFixtures.mjs` cleaning policy; kept out of all
  histograms. 1 anomalous 2v1 match included (formula handles it).
- **`isEdited` matches kept** (flagged in meta; prior pipeline policy).
- **Per-club ratings:** a player at two clubs has independent rating
  trajectories; snapshots handle this correctly. 19 rows have `club=null`.
- Directus `status:'draft'` on all rows — drafts are still the authoritative
  synced records here (the appState flow writes them); no published-only
  filter needed.
- Bucket edges: lower-bound inclusive, e.g. 60-65 = [60,65); favProb=50.0
  exact lands in 50-60 (≥10% of matches are dead-even 50.0 forecasts).

## 7. Reproduce

```bash
export PATH="$LOCALAPPDATA/nvm/v24.21.0:$PATH"
cd <repo>
node .tmp-analysis/fetch-matches.mjs   # -> matches-90d.json (needs .env token)
node .tmp-analysis/analyze.mjs         # -> console + matches-90d-enriched.json
node .tmp-analysis/final.mjs           # prodComp slices, per-club, thresholds
```

Prior art worth knowing: `scripts/lib/{loadFixtures,replayEngine,evaluate}.mjs`
+ `test/fixtures/completed_matches_20261005.csv` (2,889 rows, stale ~7 weeks)
implement the same cleaning policy and an Elo replay engine — the
`ratingReplay.ts` mirror. Fixture predates this pull; refresh via the same
Directus query if a CSV is needed.
