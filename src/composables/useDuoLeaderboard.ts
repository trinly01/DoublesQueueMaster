import { ref, type Ref } from 'vue';
import { LocalStorage } from 'quasar';
import { readItems } from '@likha-erp/likha-sdk';
import { likhaClient } from 'src/services/likhaClient';
import { resolveAvatarUrl } from 'src/utils/playerHelpers';
import { matchesFingerprint } from 'src/utils/leaderboardCompute';
import { runDuoRanking } from 'src/utils/runLeaderboard';
import type { DuoEntry } from 'src/utils/duoStats';
import type { DirectusCompletedMatch } from 'src/services/playerProfile';

export type DuoLeaderboardEntry = DuoEntry & {
  player1: {
    username: string;
    firstName: string;
    lastName?: string;
    avatar?: string;
    rating: number;
  };
  player2: {
    username: string;
    firstName: string;
    lastName?: string;
    avatar?: string;
    rating: number;
  };
};

export interface UseDuoLeaderboardContext {
  currentClubUUID: Ref<string>;
  includeNonCompetitive: Ref<boolean>;
}

const PAGE_SIZE = 500;
const MAX_PAGES = 10;

export function useDuoLeaderboard(context: UseDuoLeaderboardContext) {
  const { currentClubUUID, includeNonCompetitive } = context;

  const duoLeaderboard = ref<DuoLeaderboardEntry[]>([]);
  const duoLeaderboardLoading = ref(false);

  const getCacheKey = () =>
    `club_duo_leaderboard_${currentClubUUID.value}${includeNonCompetitive.value ? '_all' : ''}`;

  const loadCached = (): string | null => {
    const raw = LocalStorage.getItem(getCacheKey());
    if (!raw) return null;
    try {
      const cached = raw as {
        data: DuoLeaderboardEntry[];
        timestamp: number;
        fingerprint?: string;
      };
      if (cached && Array.isArray(cached.data)) {
        duoLeaderboard.value = cached.data;
        return cached.fingerprint ?? null;
      }
    } catch (e) {
      console.error('Failed to load cached duo leaderboard:', e);
    }
    return null;
  };

  const saveCached = (fingerprint: string) => {
    LocalStorage.set(getCacheKey(), {
      data: duoLeaderboard.value,
      timestamp: Date.now(),
      fingerprint,
    });
  };

  const fetchAllMatches = async (): Promise<DirectusCompletedMatch[]> => {
    const all: DirectusCompletedMatch[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = (await likhaClient.request(
        readItems('completed_match', {
          filter: {
            _and: [
              { club: { _eq: currentClubUUID.value } },
              { completed_at: { _gte: '$NOW(-30 days)' } },
              { match_type: { _eq: 'doubles' } },
            ],
          },
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
  };

  const fetchDuoLeaderboard = async () => {
    if (!currentClubUUID.value) return;
    const cachedFingerprint = loadCached();
    duoLeaderboardLoading.value =
      !cachedFingerprint || duoLeaderboard.value.length === 0;
    try {
      const matches = await fetchAllMatches();

      // Skip the replay entirely when the fetched data is identical to what
      // produced the cached leaderboard.
      const fp = matchesFingerprint(matches);
      if (cachedFingerprint === fp && duoLeaderboard.value.length > 0) {
        duoLeaderboardLoading.value = false;
        return;
      }

      // Heavy work (3-pass Elo replay + duo aggregation) runs in a Web Worker
      // when available — see runLeaderboard.ts for the inline fallback.
      const entries = await runDuoRanking(matches, includeNonCompetitive.value);

      duoLeaderboard.value = entries.map((e) => ({
        ...e,
        player1: {
          username: e.player1.username || '',
          firstName: e.player1.firstName || e.player1.username || '',
          lastName: e.player1.lastName,
          avatar: resolveAvatarUrl(e.player1.avatar),
          rating: e.player1.rating,
        },
        player2: {
          username: e.player2.username || '',
          firstName: e.player2.firstName || e.player2.username || '',
          lastName: e.player2.lastName,
          avatar: resolveAvatarUrl(e.player2.avatar),
          rating: e.player2.rating,
        },
      }));
      saveCached(fp);

      console.log(
        '[fetchDuoLeaderboard] matches:',
        matches.length,
        'duos:',
        entries.length,
      );
    } catch (err) {
      console.error('Failed to fetch duo leaderboard:', err);
      if (!cachedFingerprint || duoLeaderboard.value.length === 0) {
        duoLeaderboard.value = [];
      }
    } finally {
      duoLeaderboardLoading.value = false;
    }
  };

  return {
    duoLeaderboard,
    duoLeaderboardLoading,
    fetchDuoLeaderboard,
  };
}
