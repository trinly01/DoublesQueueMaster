// Leaderboard compute worker — thin wrapper around pure functions.
// All logic lives in leaderboardCompute/duoStats/ratingReplay (unit-tested
// directly); this file only shuttles messages so the heavy Elo replay +
// duo aggregation runs off the main thread.

import {
  computeClubRanked,
  computeDuoEntries,
} from 'src/utils/leaderboardCompute';
import type { DirectusCompletedMatch } from 'src/services/playerProfile';

export type LeaderboardJob = {
  kind: 'club' | 'duo';
  matches: DirectusCompletedMatch[];
  includeNonCompetitive: boolean;
};

self.onmessage = (e: MessageEvent<LeaderboardJob>) => {
  const job = e.data;
  const result =
    job.kind === 'duo'
      ? computeDuoEntries(job.matches, job.includeNonCompetitive)
      : computeClubRanked(job.matches, job.includeNonCompetitive);
  (self as unknown as Worker).postMessage(result);
};
