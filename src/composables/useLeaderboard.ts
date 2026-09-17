import { ref, type Ref } from 'vue';
import { LocalStorage } from 'quasar';
import { readItems } from '@likha-erp/likha-sdk';
import { likhaClient } from 'src/services/likhaClient';
import { rankClubPlayers } from 'src/utils/ratingReplay';
import { matchesFingerprint } from 'src/utils/leaderboardCompute';
import { runClubRanking } from 'src/utils/runLeaderboard';
import { resolveAvatarUrl } from 'src/utils/playerHelpers';
import type { DirectusCompletedMatch } from 'src/services/playerProfile';
import type { ClubMember } from 'src/composables/useClubMembers';

export type ClubLeaderboardEntry = {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  rating: number;
  avatar?: string;
  wins: number;
  losses: number;
  games: number;
  score: number;
  winRate: number;
  reliability: number;
  provisional: boolean;
  gamesToReliable: number;
};

export interface UseLeaderboardContext {
  currentClubUUID: Ref<string>;
  clubMembers: Ref<ClubMember[]>;
}

export function useLeaderboard(context: UseLeaderboardContext) {
  const { currentClubUUID, clubMembers } = context;

  const clubLeaderboard = ref<ClubLeaderboardEntry[]>([]);
  const clubLeaderboardLoading = ref(false);
  const includeNonCompetitive = ref(false);

  const getClubLeaderboardCacheKey = () =>
    `club_leaderboard_v2_${currentClubUUID.value}${includeNonCompetitive.value ? '_all' : ''}`;

  const loadCachedClubLeaderboard = (): string | null => {
    const raw = LocalStorage.getItem(getClubLeaderboardCacheKey());
    if (!raw) return null;
    try {
      const cached = raw as {
        data: ClubLeaderboardEntry[];
        timestamp: number;
        fingerprint?: string;
      };
      if (cached && Array.isArray(cached.data)) {
        clubLeaderboard.value = cached.data;
        return cached.fingerprint ?? null;
      }
    } catch (e) {
      console.error('Failed to load cached club leaderboard:', e);
    }
    return null;
  };

  const saveCachedClubLeaderboard = (fingerprint: string) => {
    LocalStorage.set(getClubLeaderboardCacheKey(), {
      data: clubLeaderboard.value,
      timestamp: Date.now(),
      fingerprint,
    });
  };

  const fetchClubLeaderboard = async () => {
    if (!currentClubUUID.value) return;
    if (clubLeaderboardLoading.value) return;
    const cachedFingerprint = loadCachedClubLeaderboard();
    clubLeaderboardLoading.value =
      !cachedFingerprint || clubLeaderboard.value.length === 0;
    try {
      // Club leaderboard — last 30 days, limit 1000
      const matches = (await likhaClient.request(
        readItems('completed_match', {
          filter: {
            _and: [
              { club: { _eq: currentClubUUID.value } },
              { completed_at: { _gte: '$NOW(-30 days)' } },
            ],
          },
          fields: ['*', 'players.directus_users_id.*'],
          sort: ['-completed_at'],
          limit: 1000,
        }),
      )) as DirectusCompletedMatch[];

      // Skip the replay entirely when the fetched data is identical to what
      // produced the cached leaderboard.
      const fp = matchesFingerprint(matches);
      if (cachedFingerprint === fp && clubLeaderboard.value.length > 0) {
        clubLeaderboardLoading.value = false;
        return;
      }

      // Replay matches off the main thread (Web Worker with inline fallback)
      // using the club-ranking path (deterministic sort, tie skip, guest
      // identity key, level-based seeding, iterated convergence).
      const replayed = await runClubRanking(
        matches,
        includeNonCompetitive.value,
      );

      // Build registered-user info map from the players junction.
      const userMap = new Map<
        string,
        {
          firstName: string;
          lastName: string;
          avatar?: string;
        }
      >();
      for (const m of matches) {
        for (const jp of m.players || []) {
          const user = jp.directus_users_id;
          if (!user?.username) continue;
          userMap.set(user.username, {
            firstName: user.first_name || user.username,
            lastName: user.last_name || '',
            avatar: resolveAvatarUrl(user.avatar),
          });
        }
      }

      const memberMap = new Map(clubMembers.value.map((m) => [m.username, m]));

      // Rank using the deterministic tiebreaker chain.
      const ranked = rankClubPlayers(replayed);
      const list = ranked
        .filter((p) => userMap.has(p.username))
        .map((p) => {
          const user = userMap.get(p.username);
          const member = memberMap.get(p.username);
          return {
            id: member?.id || p.username,
            username: p.username,
            firstName: member?.firstName || user?.firstName || p.firstName,
            lastName: member?.lastName || user?.lastName || p.lastName,
            rating: p.rating,
            avatar: resolveAvatarUrl(
              member?.avatar || user?.avatar || p.avatar,
            ),
            wins: p.wins,
            losses: p.losses,
            games: p.matchesPlayed,
            score: Math.round(p.rating),
            winRate: p.matchesPlayed > 0 ? (p.wins / p.matchesPlayed) * 100 : 0,
            reliability: p.reliability,
            provisional: p.provisional,
            gamesToReliable: p.gamesToReliable,
          };
        });
      clubLeaderboard.value = list.slice(0, 30);
      saveCachedClubLeaderboard(fp);
      console.log(
        '[fetchClubLeaderboard] matches:',
        matches.length,
        'players:',
        list.length,
        'leaderboard:',
        clubLeaderboard.value,
      );
    } catch (err) {
      console.error('Failed to fetch club leaderboard:', err);
      if (!cachedFingerprint || clubLeaderboard.value.length === 0) {
        clubLeaderboard.value = [];
      }
    } finally {
      clubLeaderboardLoading.value = false;
    }
  };

  return {
    clubLeaderboard,
    clubLeaderboardLoading,
    fetchClubLeaderboard,
    includeNonCompetitive,
  };
}
