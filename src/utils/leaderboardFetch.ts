import { readItems } from '@likha-erp/likha-sdk';
import { likhaClient } from 'src/services/likhaClient';
import type { DirectusCompletedMatch } from 'src/services/playerProfile';

// Shared leaderboard match fetch — completed matches from the last 30 days,
// newest first, with the players → directus_users junction. Pages are
// concatenated because a single limit:1000 request silently truncates the
// window once a busy period exceeds it (same pattern as
// useDuoLeaderboard's fetchAllMatches, capped at 5000 matches).
const PAGE_SIZE = 500;
const MAX_PAGES = 10;

export async function fetchLeaderboardMatches(
  clubUUID?: string,
): Promise<DirectusCompletedMatch[]> {
  const all: DirectusCompletedMatch[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = (await likhaClient.request(
      readItems('completed_match', {
        filter: clubUUID
          ? {
              _and: [
                { club: { _eq: clubUUID } },
                { completed_at: { _gte: '$NOW(-30 days)' } },
              ],
            }
          : { completed_at: { _gte: '$NOW(-30 days)' } },
        fields: ['*', 'players.directus_users_id.*'],
        sort: ['-completed_at'],
        limit: PAGE_SIZE,
        page,
      }),
    )) as DirectusCompletedMatch[];
    if (!batch || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}
