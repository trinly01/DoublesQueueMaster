// Leaderboard compute worker — thin wrapper around pure functions.
// All logic lives in leaderboardCompute/duoStats/ratingReplay (unit-tested
// directly); this file only shuttles messages so the heavy Elo replay +
// duo aggregation runs off the main thread.
//
// Job kinds:
//   'club'         — club-ranking replay (Record<userKey, RankedPlayer>); also
//                    used by the Club & Global leaderboard tabs, whose
//                    post-filters (registered users, last club, top 30)
//                    stay in the page.
//   'duo'          — same replay + duo aggregation (DuoEntry[]).
//   'matches'      — legacy single-pass replay for the "My Matches" tab
//                    (Record<username, ReplayPlayer>); always competitive-only.
//   'duo-network'  — duoScore + member network-centrality bonus (DuoEntry[]).

import {
  computeClubRanked,
  computeDuoEntries,
  computeDuoNetworkEntries,
  computeMatchesReplay,
} from 'src/utils/leaderboardCompute';
import type { DirectusCompletedMatch } from 'src/services/playerProfile';

export type LeaderboardJob = {
  kind: 'club' | 'duo' | 'matches' | 'duo-network';
  matches: DirectusCompletedMatch[];
  includeNonCompetitive: boolean;
};

self.onmessage = (e: MessageEvent<LeaderboardJob>) => {
  const job = e.data;
  const result =
    job.kind === 'duo'
      ? computeDuoEntries(job.matches, job.includeNonCompetitive)
      : job.kind === 'duo-network'
        ? computeDuoNetworkEntries(job.matches, job.includeNonCompetitive)
        : job.kind === 'matches'
          ? computeMatchesReplay(job.matches)
          : computeClubRanked(job.matches, job.includeNonCompetitive);
  (self as unknown as Worker).postMessage(result);
};
