# Shared context — rating-aware network leaderboard redesign

## Current algorithm (src/utils/networkRanking.ts, shipped 8641765)
- Personalized PageRank: r_i = (1−λ_i)·p̃_i + λ_i·(Pᵀr)_i, power iteration
- λ_i = 0.8·games_i/(games_i+12) — adaptive damping (V6)
- p̃_i = shrunk own-performance: outcome-gated margin (win∈[1,1.25]/tie=0.5/loss∈[0,0.25])·marginShare, C=12 shrink toward club mean
- Edges per match (2v2): 2 teammate symmetric edgeW=1/3; 4 opponent directed — loser→winner edgeW·(1+μw), winner→loser edgeW·(1−μw), μw=|sA−sB|/(sA+sB)
- networkScore = rawScore/rMax·100; fields: ownPerformance, networkFlow, rawScore, provisional, gamesToReliable

## Pipeline (src/utils/leaderboardCompute.ts)
- computeNetworkRanked → filterCompetitive → toRankedInputs → computeNetworkScores
- toRankedInputs carries per-player: userId, username, name, firstName, lastName, level, rating?, avatar, linkedTo
- computeDuoNetworkEntries ALSO runs replayMatchesForRanking → ratingMap (for duoScore) — replay NOT run in player-network path
- Worker job kinds: 'network', 'duo-network', 'club', 'duos', 'matches'

## User's new requirement (verbatim)
"the network should also consider match scores, ratings, G/W/L, opponents, teammates — it is interrelated. graphs, nested, network"

## Open questions for agents
1. What rating data is actually available inside computeNetworkScores (stored p.rating = match-time or fetch-time snapshot? guest coverage?)
2. Should rating come from replayMatchesForRanking (career memory via stored-rating warm start) or stored p.rating?
3. Where does rating enter: teleport prior, edge weights, or both?
4. Is DUPR reachable/appropriate (sparse coverage — linked players only)?
