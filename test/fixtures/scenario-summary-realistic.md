# Realistic Scenario Summary (Matchmaking-Balanced)

Engine: **Gap 0.75 win + softUnderdog75 loss (with 2x partner ratio cap)** (current production)

Only includes matchups where |teamRatingA - teamRatingB| <= 150, based on the softened harmonic mean used by matchmaking.

| Scenario | Team (rating / change) | Opponent (rating / change) | Score | Team Rating Diff |
|----------|------------------------|---------------------------|-------|------------------|
| balanced vs balanced, close win | 1500/1500 (+14/+13) | 1500/1500 (-14/-13) | 11-9 | 0 |
| balanced vs balanced, blowout win | 1500/1500 (+15/+15) | 1500/1500 (-15/-15) | 11-2 | 0 |
| balanced vs balanced, close loss | 1500/1500 (-14/-13) | 1500/1500 (+14/+13) | 9-11 | 0 |
| balanced vs balanced, blowout loss | 1500/1500 (-15/-15) | 1500/1500 (+15/+15) | 2-11 | 0 |
| balanced vs weak+strong, close win | 1500/1500 (+14/+13) | 1300/1700 (-9/-18) | 11-9 | 16 |
| balanced vs weak+strong, blowout win | 1500/1500 (+15/+15) | 1300/1700 (-10/-20) | 11-2 | 16 |
| balanced vs weak+strong, close loss | 1500/1500 (-14/-13) | 1300/1700 (+12/+15) | 9-11 | 16 |
| balanced vs weak+strong, blowout loss | 1500/1500 (-15/-15) | 1300/1700 (+13/+17) | 2-11 | 16 |
| balanced vs huge gap, close win | 1500/1500 (+14/+13) | 1200/1800 (-9/-18) | 11-9 | 36 |
| balanced vs huge gap, blowout win | 1500/1500 (+15/+15) | 1200/1800 (-10/-20) | 11-2 | 36 |
| balanced vs huge gap, close loss | 1500/1500 (-14/-13) | 1200/1800 (+10/+17) | 9-11 | 36 |
| balanced vs huge gap, blowout loss | 1500/1500 (-15/-15) | 1200/1800 (+11/+19) | 2-11 | 36 |
| weak+strong vs balanced, close win | 1300/1700 (+12/+15) | 1500/1500 (-14/-13) | 11-9 | 16 |
| weak+strong vs balanced, blowout win | 1300/1700 (+13/+17) | 1500/1500 (-15/-15) | 11-2 | 16 |
| weak+strong vs balanced, close loss | 1300/1700 (-9/-18) | 1500/1500 (+14/+13) | 9-11 | 16 |
| weak+strong vs balanced, blowout loss | 1300/1700 (-10/-20) | 1500/1500 (+15/+15) | 2-11 | 16 |
| weak+strong vs weak+strong, close win | 1300/1700 (+12/+15) | 1300/1700 (-9/-18) | 11-9 | 0 |
| weak+strong vs weak+strong, blowout win | 1300/1700 (+13/+17) | 1300/1700 (-10/-20) | 11-2 | 0 |
| weak+strong vs weak+strong, close loss | 1300/1700 (-9/-18) | 1300/1700 (+12/+15) | 9-11 | 0 |
| weak+strong vs weak+strong, blowout loss | 1300/1700 (-10/-20) | 1300/1700 (+13/+17) | 2-11 | 0 |
| weak+strong vs huge gap, close win | 1300/1700 (+12/+15) | 1200/1800 (-9/-18) | 11-9 | 20 |
| weak+strong vs huge gap, blowout win | 1300/1700 (+13/+17) | 1200/1800 (-10/-20) | 11-2 | 20 |
| weak+strong vs huge gap, close loss | 1300/1700 (-9/-18) | 1200/1800 (+10/+17) | 9-11 | 20 |
| weak+strong vs huge gap, blowout loss | 1300/1700 (-10/-20) | 1200/1800 (+11/+19) | 2-11 | 20 |
| huge gap vs balanced, close win | 1200/1800 (+10/+17) | 1500/1500 (-14/-13) | 11-9 | 36 |
| huge gap vs balanced, blowout win | 1200/1800 (+11/+19) | 1500/1500 (-15/-15) | 11-2 | 36 |
| huge gap vs balanced, close loss | 1200/1800 (-9/-18) | 1500/1500 (+14/+13) | 9-11 | 36 |
| huge gap vs balanced, blowout loss | 1200/1800 (-10/-20) | 1500/1500 (+15/+15) | 2-11 | 36 |
| huge gap vs weak+strong, close win | 1200/1800 (+10/+17) | 1300/1700 (-9/-18) | 11-9 | 20 |
| huge gap vs weak+strong, blowout win | 1200/1800 (+11/+19) | 1300/1700 (-10/-20) | 11-2 | 20 |
| huge gap vs weak+strong, close loss | 1200/1800 (-9/-18) | 1300/1700 (+12/+15) | 9-11 | 20 |
| huge gap vs weak+strong, blowout loss | 1200/1800 (-10/-20) | 1300/1700 (+13/+17) | 2-11 | 20 |
| huge gap vs huge gap, close win | 1200/1800 (+10/+17) | 1200/1800 (-9/-18) | 11-9 | 0 |
| huge gap vs huge gap, blowout win | 1200/1800 (+11/+19) | 1200/1800 (-10/-20) | 11-2 | 0 |
| huge gap vs huge gap, close loss | 1200/1800 (-9/-18) | 1200/1800 (+10/+17) | 9-11 | 0 |
| huge gap vs huge gap, blowout loss | 1200/1800 (-10/-20) | 1200/1800 (+11/+19) | 2-11 | 0 |
| weak+weak vs weak+weak, close win | 1300/1300 (+14/+13) | 1300/1300 (-14/-13) | 11-9 | 0 |
| weak+weak vs weak+weak, blowout win | 1300/1300 (+15/+15) | 1300/1300 (-15/-15) | 11-2 | 0 |
| weak+weak vs weak+weak, close loss | 1300/1300 (-14/-13) | 1300/1300 (+14/+13) | 9-11 | 0 |
| weak+weak vs weak+weak, blowout loss | 1300/1300 (-15/-15) | 1300/1300 (+15/+15) | 2-11 | 0 |
| strong+strong vs strong+strong, close win | 1700/1700 (+14/+13) | 1700/1700 (-14/-13) | 11-9 | 0 |
| strong+strong vs strong+strong, blowout win | 1700/1700 (+15/+15) | 1700/1700 (-15/-15) | 11-2 | 0 |
| strong+strong vs strong+strong, close loss | 1700/1700 (-14/-13) | 1700/1700 (+14/+13) | 9-11 | 0 |
| strong+strong vs strong+strong, blowout loss | 1700/1700 (-15/-15) | 1700/1700 (+15/+15) | 2-11 | 0 |
