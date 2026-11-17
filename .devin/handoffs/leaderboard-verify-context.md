# Leaderboard correctness debate — shared context

User screenshot (CLUB tab, "Include non-competitive" OFF, ~14 visible rows) shows
network ranking that looks nearly sorted by games played:

| # | Player | Net | G | W | L | second chip? |
|---|--------|-----|---|---|---|--------------|
| 1 | rands (@angelobaribal110408#xn0) | 100 | 62 | 33 | 29 | 3.215 |
| 2 | James (@jamesmanganaan1808#1xb) | 94 | 58 | 34 | 24 | 3.108 |
| 3 | Marivic (@margatch1771#74t) | 92 | 56 | 26 | 30 | no |
| 4 | Osang (@rose_n_raf#sg8) | 87 | 55 | 24 | 31 | no |
| 5 | Mikki (@lauricemichelle#aq1) | 83 | 51 | 24 | 27 | 3.637 |
| 6 | Cara (@eslabracassieralph#d3c) | 82 | 50 | 31 | 19 | no |
| 7 | Jowinski (@jowinskisoriano100#ciy) | 81 | 50 | 34 | 16 | no |
| 8 | Boyet (@boyet.castillo74#p2l) | 75 | 48 | 28 | 20 | 3.214 |
| 9 | Jel (@jelenamanganaan1012#zv5) | 71 | 44 | 24 | 20 | 3.537 |
| 10 | angie (@adamjedrix#6js) | 67 | 42 | 21 | 21 | no |
| 11 | Alex (@alexmalasan082#m0e) | 65 | 38 | 20 | 18 | no |
| 12 | EUNICE (@eunicekuan1982#f8n) | 63 | 37 | 19 | 18 | no |
| 13 | Marc Johnuel (@hjohnuel21#d2u) | 63 | 39 | 22 | 17 | 3.516 |
| 14 | Lenz (@gachallanf#mpr) | 61 | 38 | 22 | 16 | 4.206 |

## Observed anomalies to explain

1. **Near-perfect games-descending order** — ranks 1–10 strictly descending by
   games (62,58,56,55,51,50,50,48,44,42). Is this emergent connectivity
   dominance or a bug (p̃ dead / edges counting raw games)?
2. **Losing records outrank winning records** — Marivic (26-30) #3 above Cara
   (31-19) #6, Jowinski (34-16) #7. Legitimate if Marivic's network is much
   stronger, suspicious otherwise.
3. **Dual chips on some rows** — network score + a DUPR-scale number (3.215).
   Intended or leftover ratingChip for DUPR-linked players?

## Algorithm under test

`src/utils/networkRanking.ts` — personalized PageRank:
`r = (1-λ)p̃ + λPᵀr`, λ=0.8. p̃ = shrunk outcome-gated margin scalar
(win∈[1,1.25], tie=0.5, loss∈[0,0.25], shrink C=12 to club mean).
P = structural symmetric equal-share edges: each player splits edgeW=1/(n-1)
among all co-participants per match, accumulated globally, row-normalized once.
NetworkRankedPlayer exposes ownPerformance/networkFlow/rawScore/networkScore.

Fetch contract (useLeaderboard.ts:80-91): `readItems('completed_match')`,
filter `club _eq <clubUUID>` + `completed_at _gte $NOW(-30 days)`,
sort `-completed_at`, limit 1000, fields `*` + `players.directus_users_id.*`.

Live-data access: `.env` has `BOOKING_ADMIN_TOKEN`; BASE
`https://api.dinkmatch.club`. Scripts use `process.loadEnvFile('.env')` +
`fetch` with `Authorization: <token>`. TypeScript utils are runnable via
`npx vite-node <script.ts>` (vitest dep present) or a scratch spec file.
