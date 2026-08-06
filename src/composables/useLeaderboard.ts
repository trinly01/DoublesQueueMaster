import { ref, type Ref } from 'vue';
import { LocalStorage } from 'quasar';
import { readItems } from '@likha-erp/likha-sdk';
import { likhaClient } from 'src/services/likhaClient';
import { replayMatches } from 'src/utils/ratingReplay';
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
};

export interface UseLeaderboardContext {
  currentClubUUID: Ref<string>;
  clubMembers: Ref<ClubMember[]>;
}

export function useLeaderboard(context: UseLeaderboardContext) {
  const { currentClubUUID, clubMembers } = context;

  const clubLeaderboard = ref<ClubLeaderboardEntry[]>([]);
  const clubLeaderboardLoading = ref(false);

  const getClubLeaderboardCacheKey = () =>
    `club_leaderboard_${currentClubUUID.value}`;

  const loadCachedClubLeaderboard = () => {
    const raw = LocalStorage.getItem(getClubLeaderboardCacheKey());
    if (!raw) return false;
    try {
      const cached = raw as {
        data: ClubLeaderboardEntry[];
        timestamp: number;
      };
      if (
        cached &&
        Array.isArray(cached.data) &&
        Date.now() - cached.timestamp < 5 * 60 * 1000
      ) {
        clubLeaderboard.value = cached.data;
        return true;
      }
    } catch (e) {
      console.error('Failed to load cached club leaderboard:', e);
    }
    return false;
  };

  const saveCachedClubLeaderboard = () => {
    LocalStorage.set(getClubLeaderboardCacheKey(), {
      data: clubLeaderboard.value,
      timestamp: Date.now(),
    });
  };

  const fetchClubLeaderboard = async () => {
    if (!currentClubUUID.value || clubLeaderboardLoading.value) return;
    const cached = loadCachedClubLeaderboard();
    clubLeaderboardLoading.value =
      !cached || clubLeaderboard.value.length === 0;
    try {
      const matches = (await likhaClient.request(
        readItems('completed_match', {
          filter: { club: { _eq: currentClubUUID.value } },
          fields: ['*', 'players.directus_users_id.*'],
          sort: ['-completed_at'],
          limit: 500,
        }),
      )) as DirectusCompletedMatch[];

      // Replay matches chronologically using the same algorithm as the rating script.
      const replayed = replayMatches(
        [...matches].reverse().map((m) => ({
          teamAScore: m.team_a_score,
          teamBScore: m.team_b_score,
          teamA: (m.team_a || []).map((p) => ({
            username: p.username,
            name: p.firstName,
            firstName: p.firstName,
            lastName: p.lastName,
            rating: p.rating,
            avatar: p.avatar,
          })),
          teamB: (m.team_b || []).map((p) => ({
            username: p.username,
            name: p.firstName,
            firstName: p.firstName,
            lastName: p.lastName,
            rating: p.rating,
            avatar: p.avatar,
          })),
        })),
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

      const memberMap = new Map(
        clubMembers.value.map((m) => [m.username, m]),
      );
      const list = Object.values(replayed)
        .filter((p) => userMap.has(p.username))
        .map((p) => {
          const user = userMap.get(p.username);
          const member = memberMap.get(p.username);
          return {
            id: member?.id || p.username,
            username: p.username,
            firstName:
              member?.firstName || user?.firstName || p.firstName,
            lastName: member?.lastName || user?.lastName || p.lastName,
            rating: p.rating,
            avatar: resolveAvatarUrl(
              member?.avatar || user?.avatar || p.avatar,
            ),
            wins: p.wins,
            losses: p.losses,
            games: p.matchesPlayed,
            score: Math.round(p.rating),
            winRate:
              p.matchesPlayed > 0
                ? (p.wins / p.matchesPlayed) * 100
                : 0,
          };
        });
      const sorted = list.sort(
        (a, b) =>
          b.score - a.score || (b.rating || 1450) - (a.rating || 1450),
      );
      clubLeaderboard.value = sorted.slice(0, 20);
      saveCachedClubLeaderboard();
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
      if (!cached || clubLeaderboard.value.length === 0) {
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
  };
}
