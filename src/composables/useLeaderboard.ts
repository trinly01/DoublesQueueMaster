import { ref, type Ref } from 'vue';
import { LocalStorage } from 'quasar';
import { readItems } from '@likha-erp/likha-sdk';
import { likhaClient } from 'src/services/likhaClient';
import {
  replayMatchesForRanking,
  rankClubPlayers,
} from 'src/utils/ratingReplay';
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

  const loadCachedClubLeaderboard = () => {
    const raw = LocalStorage.getItem(getClubLeaderboardCacheKey());
    if (!raw) return false;
    try {
      const cached = raw as {
        data: ClubLeaderboardEntry[];
        timestamp: number;
      };
      if (cached && Array.isArray(cached.data)) {
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
    if (!currentClubUUID.value) return;
    if (clubLeaderboardLoading.value) return;
    const cached = loadCachedClubLeaderboard();
    clubLeaderboardLoading.value =
      !cached || clubLeaderboard.value.length === 0;
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

      // Filter to competitive matches only (exclude Casual and Social modes),
      // unless the user has toggled to include non-competitive matches.
      const competitiveMatches = includeNonCompetitive.value
        ? matches
        : matches.filter((m) => {
            const mode = m.meta?.matchmakingMode;
            return mode !== 'fair_balance' && mode !== 'variety_first';
          });

      // Replay matches using the club-ranking path (with correctness fixes:
      // deterministic sort, tie skip, guest identity key, level-based seeding).
      const replayed = replayMatchesForRanking(
        competitiveMatches.map((m) => ({
          teamAScore: m.team_a_score,
          teamBScore: m.team_b_score,
          matchKey: m.match_key,
          completedAt: m.completed_at,
          matchmakingMode: m.meta?.matchmakingMode,
          teamA: (m.team_a || []).map((p) => ({
            userId: p.userId,
            username: p.username,
            name: p.firstName,
            firstName: p.firstName,
            lastName: p.lastName,
            level: p.level,
            rating: p.rating,
            avatar: p.avatar,
          })),
          teamB: (m.team_b || []).map((p) => ({
            userId: p.userId,
            username: p.username,
            name: p.firstName,
            firstName: p.firstName,
            lastName: p.lastName,
            level: p.level,
            rating: p.rating,
            avatar: p.avatar,
          })),
        })),
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
    includeNonCompetitive,
  };
}
