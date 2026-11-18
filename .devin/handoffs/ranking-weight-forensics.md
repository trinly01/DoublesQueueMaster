# Ranking weight forensics — Angelo investigation + λcap sweep

Date: 2026-11-18. Club `22e52ef0-bf60-4bd1-bea8-ef66193edf35`. Live data via
BOOKING_ADMIN_TOKEN (`.env`, never printed). Scripts (scratch, uncommitted):
`scripts/angelo-investigate.mjs`, `scripts/dupr-check.mjs`,
`scripts/lb-v8.mts` → `.tmp-analysis/lb-v8.mjs`. Raw outputs:
`.tmp-analysis/angelo-out.txt`, `.tmp-analysis/lb-v8-out.txt`.

Disambiguation: Angelo = `baribalangelog110408#7cx` (uid `049d3771-5352-42c6-838e-d41e1a830c3c`,
name "Angelo Baribal", duprId `Q69645`). NOT `angelobaribal110408#xn0` = rands.

---

## TASK A — Angelo data profile

### Match universe (all-time, all clubs — junction filter on players.directus_users_id.username)
- **183 completed_match rows**, 2026-08-19 → 2026-11-17 (~3 months).
- Club split: 165 at THIS club, 18 at club `2bf82b31-…` (different club — correctly excluded from this leaderboard).
- **46 of his matches fall inside the current 30d/limit-1000 club window** the leaderboard uses.

### Identity integrity — CLEAN, no split
- All 183 matches resolve to ONE identity: single userId, single username, single name. 89 distinct participant tuples differ ONLY in the embedded `rating` snapshot (and occasional `duprId` field presence). No guest-key splits, no duplicate accounts, no alternate usernames.
- Only two 'angelo' identities exist club-wide: Angelo and rands (distinct userIds).

### Results
- **All-time: 118W-65L-0T (64.5% WR)**, mean margin 4.9, median 4, max 11 — no score anomalies, no ties, no missing scores.
- **Inside 30d window (all modes): 31W-15L (67% WR)**.
- **Inside window, competitive-only (excl. fair_balance/variety_first): 25 games, 13W-12L (52% WR)**.
- Implied non-competitive record in-window: ~18W-3L — he dominates social/variety modes but is ~coin-flip in competitive play.
- Mode mix all-time: variety_first=65, strict_balance=65, balanced_variety=20, (none)=17, balance_first=12, fair_balance=4 — heavy non-competitive share.

### Rating snapshots (embedded `rating` field, 30d window)
- Angelo: n=46, min 1549 / med 1582 / mean 1584 / max 1623, latest 1623 — **above club median (~1450)**.
- Comparators: jeo mean 1592 (35-12), obal mean 1761 (44-16), trin mean 1758 (35-20), rands mean 1477 (53-52), marivic mean 1403 (44-53), jowinski mean 1522 (53-33), cara mean 1557 (49-29).
- His stored/DUPR-linked rating is genuinely good — not stale-low. All-time tuples show trajectory ~1406→1636 (grew over period).

### Network position (why centrality stays low)
- Volume: 46 window games vs leaders' 86–105 → less edge mass under any variant.
- Insular clustering: 24/183 matches with ONE teammate (`maratajaymar187#rqa`), 21 matches vs rands — narrow donor pool → less diversified inflow.
- priorScore (perf+rating prior) = 0.591 — mid-table; his 13-12 competitive record doesn't earn a high prior.

### VERDICT: **RESULTS problem, not DATA problem**
Evidence: clean single identity, zero anomalies, strong rating, excellent all-time and non-competitive records — but genuinely average competitive results (13-12) on low competitive volume (25g). The leaderboard (competitive graph) correctly reflects mediocre competitive output; the "he's strong" perception comes from non-competitive dominance + strong stored rating, neither of which the network algorithm is designed to reward. No mis-scored matches, no split identity, no wrong-club leakage found. Caveat: guest-side appearances can't be junction-filtered (team-JSON filter attempt failed auth) — but window scan shows only the one username, so no evidence of splits.

---

## TASK B — λcap sweep (competitive-only, V8c config = rating prior + surprise edges)

λ_i = cap·g/(g+12) (cap replaces the 0.8 numerator — established engine convention). All converged, NaN=0, 210 players, 594 matches.

| λcap | ρ(score,games) | Top-15 (net/g/W-L) | jeo | trin | Angelo | obal | shirwin | atthan | sandro | marivic | jowinski | cara | rands |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.25 | 0.568 | rands100/62/33-29, Jowinski100/50/34-16, James96/58/34-24, Cara94/50/31-19, Mikki89/51/24-27, jeo89/26/21-5, Marivic86/56/26-30, EUNICE83/37, Osang83/55, Obal82/36/24-12, Boyet82/48, Jel79/44, Alex79/38, Trin77/31, Timot76/34 | #6 | #14 | #45 | #10 | #20 | #21 | #40 | #7 | #2 | #4 | #1 |
| 0.35 | 0.612 | rands100, Jowinski95, James94, Cara90, Mikki89, Marivic86, Osang82, EUNICE79, jeo77(#9), Boyet77, Jel75, Alex75, Obal73(#13), angie71, Timot71 | #9 | #18 | #39 | #13 | #23 | #24 | #47 | #6 | #2 | #4 | #1 |
| (ref) cap=0.8 PROD-V8c | 0.735 | — | #20 | #22 | #32 | #17 | #46 | #47 | #78 | #3 | #6 | #7 | #1 |

Sweep context (same config): cap 0.30→ρ0.586 jeo#8 Angelo#41; cap 0.40→ρ0.628 jeo#11 Angelo#35; cap 0.50→ρ0.662 jeo#14 Angelo#33.

**Trend:** lowering λcap monotonically (a) drops ρ(score,games) — prior carries more weight so rank de-couples from activity, and (b) lifts small-sample strong performers: jeo #20→#6, Obal #17→#10, SHIRWIN #46→#20, atthan #47→#21, Sandro #78→#40 across cap 0.8→0.25. Angelo is INSENSITIVE (~#33–45) — his prior is mid (0.591), so more prior weight doesn't help him. Losers of the shift: high-volume middling performers (Marivic stays ~#6-7, rands stays #1 — both have big flow+prior).

### DUPR-boosted prior — NOT WIRED (data absent)
- `dupr_singles_rating`/`dupr_doubles_rating` on junction users: only **3 of 774 junction rows** in a 200-match sample have non-null values (~0.4% coverage; values ~3.4–3.7 DUPR-scale).
- `duprId`/`dupr_id` is just an identifier (~12% of participant slots, 48 distinct) — no rating attached in match payloads.
- Conclusion: a DUPR-sourced prior is impossible on current data — coverage far too sparse; would need a users-table join outside the match fetch.

### Degenerate-behavior check
All variants: converged (13–33 iters), NaN=0, uniqNet 50–60 — no divergence, no all-ties collapse.
