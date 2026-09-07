import { ref, type Ref } from 'vue';
import { LocalStorage } from 'quasar';
import { readItems } from '@likha-erp/likha-sdk';
import { likhaClient } from 'src/services/likhaClient';
import { resolveAvatarUrl } from 'src/utils/playerHelpers';
import {
  replayMatchesForRanking,
  type RankedMatchInput,
  type RankedPlayer,
} from 'src/utils/ratingReplay';
import type { DirectusCompletedMatch } from 'src/services/playerProfile';

// Same team rating formula used in matchmaking (softened harmonic mean)
// 60% harmonic + 40% arithmetic — respects weakest link without over-penalizing
const computeTeamRating = (r1: number, r2: number): number => {
  const harmonic = 2 / (1 / Math.max(1, r1) + 1 / Math.max(1, r2));
  const arithmetic = (r1 + r2) / 2;
  return harmonic * 0.6 + arithmetic * 0.4;
};

// Identity key matching ratingReplay.ts playerIdentityKey
const playerKey = (p: {
  userId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}): string => {
  if (p.userId) return p.userId;
  if (p.username) return p.username;
  return `guest:${p.firstName || ''}|${p.lastName || ''}|${p.name || ''}`;
};

export type DuoLeaderboardEntry = {
  key: string;
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
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  synergy: number;
  avgPointDiff: number;
  combinedRating: number;
  closeGames: number;
  closeWins: number;
  closeWinRate: number;
  duoScore: number;
  topOpponentKey?: string;
  topOpponentNames?: string;
  topOpponentGames?: number;
};

export interface UseDuoLeaderboardContext {
  currentClubUUID: Ref<string>;
}

const MIN_GAMES = 3;
const PAGE_SIZE = 500;
const MAX_PAGES = 10;

export function useDuoLeaderboard(context: UseDuoLeaderboardContext) {
  const { currentClubUUID } = context;

  const duoLeaderboard = ref<DuoLeaderboardEntry[]>([]);
  const duoLeaderboardLoading = ref(false);

  const getCacheKey = () => `club_duo_leaderboard_${currentClubUUID.value}`;

  const loadCached = () => {
    const raw = LocalStorage.getItem(getCacheKey());
    if (!raw) return false;
    try {
      const cached = raw as { data: DuoLeaderboardEntry[]; timestamp: number };
      if (cached && Array.isArray(cached.data)) {
        duoLeaderboard.value = cached.data;
        return true;
      }
    } catch (e) {
      console.error('Failed to load cached duo leaderboard:', e);
    }
    return false;
  };

  const saveCached = () => {
    LocalStorage.set(getCacheKey(), {
      data: duoLeaderboard.value,
      timestamp: Date.now(),
    });
  };

  const computeExpectedWinRate = (
    teamRating: number,
    oppTeamRating: number,
  ): number => {
    const gap = teamRating - oppTeamRating;
    return 1 / (1 + Math.pow(10, -gap / 400));
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
    if (!currentClubUUID.value || duoLeaderboardLoading.value) return;
    const cached = loadCached();
    duoLeaderboardLoading.value = !cached || duoLeaderboard.value.length === 0;
    try {
      // Fetch ALL doubles matches from last 30 days (paginated)
      const matches = await fetchAllMatches();

      // Best Duo considers ALL doubles matches regardless of matchmaking mode
      const allMatches = matches;

      // Step 1: Replay matches to get current player ratings (starting from 1450 seed)
      // Same engine as the club leaderboard — ensures consistency
      const replayInputs: RankedMatchInput[] = allMatches.map((m) => ({
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
      }));

      const replayed: Record<string, RankedPlayer> =
        replayMatchesForRanking(replayInputs);

      // Build a map from identity key → replayed rating
      const ratingMap = new Map<string, number>();
      for (const [key, player] of Object.entries(replayed)) {
        ratingMap.set(key, player.rating);
      }

      // Helper to get replayed rating for a player
      const getReplayedRating = (p: {
        userId?: string;
        username?: string;
        firstName?: string;
        lastName?: string;
        name?: string;
      }): number => {
        const key = playerKey(p);
        return ratingMap.get(key) || 1450;
      };

      // Step 2: Build duo stats using replayed ratings
      const duoMap = new Map<
        string,
        {
          games: number;
          wins: number;
          losses: number;
          pointDiff: number;
          totalTeamRating: number;
          expectedWins: number;
          closeGames: number;
          closeWins: number;
          players: [
            DirectusCompletedMatch['team_a'][0],
            DirectusCompletedMatch['team_a'][0],
          ];
          opponents: Map<string, number>;
        }
      >();

      for (const m of allMatches) {
        const ta = m.team_a || [];
        const tb = m.team_b || [];
        if (ta.length !== 2 || tb.length !== 2) continue;

        const aWon = m.team_a_score > m.team_b_score;

        // Use replayed ratings for team rating calculation
        const r1a = getReplayedRating(ta[0]);
        const r2a = getReplayedRating(ta[1]);
        const r1b = getReplayedRating(tb[0]);
        const r2b = getReplayedRating(tb[1]);
        const teamRatingA = computeTeamRating(r1a, r2a);
        const teamRatingB = computeTeamRating(r1b, r2b);

        const sides = [
          {
            team: ta as [(typeof ta)[0], (typeof ta)[0]],
            won: aWon,
            scoreFor: m.team_a_score,
            scoreAgainst: m.team_b_score,
            opponents: tb as [(typeof tb)[0], (typeof tb)[0]],
            oppTeamRating: teamRatingB,
          },
          {
            team: tb as [(typeof tb)[0], (typeof tb)[0]],
            won: !aWon,
            scoreFor: m.team_b_score,
            scoreAgainst: m.team_a_score,
            opponents: ta as [(typeof ta)[0], (typeof ta)[0]],
            oppTeamRating: teamRatingA,
          },
        ];

        for (const side of sides) {
          const [p1, p2] = side.team;
          const key = [playerKey(p1), playerKey(p2)].sort().join('|');
          const oppKey = [
            playerKey(side.opponents[0]),
            playerKey(side.opponents[1]),
          ]
            .sort()
            .join('|');

          if (!duoMap.has(key)) {
            duoMap.set(key, {
              games: 0,
              wins: 0,
              losses: 0,
              pointDiff: 0,
              totalTeamRating: 0,
              expectedWins: 0,
              closeGames: 0,
              closeWins: 0,
              players: side.team,
              opponents: new Map(),
            });
          }

          const duo = duoMap.get(key)!;
          duo.games++;
          if (side.won) duo.wins++;
          else duo.losses++;
          duo.pointDiff += side.scoreFor - side.scoreAgainst;

          const teamRating = computeTeamRating(
            getReplayedRating(p1),
            getReplayedRating(p2),
          );
          duo.totalTeamRating += teamRating;
          duo.expectedWins += computeExpectedWinRate(
            teamRating,
            side.oppTeamRating,
          );

          const diff = Math.abs(side.scoreFor - side.scoreAgainst);
          if (diff <= 2) {
            duo.closeGames++;
            if (side.won) duo.closeWins++;
          }

          duo.opponents.set(oppKey, (duo.opponents.get(oppKey) || 0) + 1);
        }
      }

      // Step 3: Build entries
      const entries: DuoLeaderboardEntry[] = [];
      for (const [key, duo] of duoMap) {
        if (duo.games < MIN_GAMES) continue;

        const [p1, p2] = duo.players;
        const winRate = duo.wins / duo.games;
        const expectedWR = duo.expectedWins / duo.games;
        const synergy = Math.round((winRate - expectedWR) * 100);
        const avgPointDiff = Math.round((duo.pointDiff / duo.games) * 10) / 10;
        const combinedRating = Math.round(duo.totalTeamRating / duo.games);
        const closeWinRate =
          duo.closeGames > 0 ? duo.closeWins / duo.closeGames : 0;

        // Find top opponent
        let topOppKey: string | undefined;
        let topOppGames = 0;
        for (const [oppKey, count] of duo.opponents) {
          if (count > topOppGames) {
            topOppGames = count;
            topOppKey = oppKey;
          }
        }

        // Resolve top opponent names from match data
        let topOppNames: string | undefined;
        if (topOppKey) {
          const oppKeys = topOppKey.split('|');
          for (const m of allMatches) {
            const allPlayers = [...(m.team_a || []), ...(m.team_b || [])];
            const found = oppKeys.map((k) =>
              allPlayers.find((p) => playerKey(p) === k),
            );
            if (found[0] && found[1]) {
              topOppNames = `${found[0].firstName || found[0].username} & ${found[1].firstName || found[1].username}`;
              break;
            }
          }
        }

        // Effective Team Rating (ETR) — best practice for doubles partnership ranking.
        // ETR = teamRating + (synergy * 400)
        // Win probability vs another duo = 1 / (1 + 10^(-(ETR_a - ETR_b) / 400))
        const duoScore = combinedRating + synergy * 4;

        // Sort players alphabetically for consistent display
        const sortedPlayers = [p1, p2].sort((a, b) =>
          (a.username || '').localeCompare(b.username || ''),
        );

        entries.push({
          key,
          player1: {
            username: sortedPlayers[0].username || '',
            firstName:
              sortedPlayers[0].firstName || sortedPlayers[0].username || '',
            lastName: sortedPlayers[0].lastName,
            avatar: resolveAvatarUrl(sortedPlayers[0].avatar),
            rating: getReplayedRating(sortedPlayers[0]),
          },
          player2: {
            username: sortedPlayers[1].username || '',
            firstName:
              sortedPlayers[1].firstName || sortedPlayers[1].username || '',
            lastName: sortedPlayers[1].lastName,
            avatar: resolveAvatarUrl(sortedPlayers[1].avatar),
            rating: getReplayedRating(sortedPlayers[1]),
          },
          games: duo.games,
          wins: duo.wins,
          losses: duo.losses,
          winRate: Math.round(winRate * 100),
          synergy,
          avgPointDiff,
          combinedRating,
          closeGames: duo.closeGames,
          closeWins: duo.closeWins,
          closeWinRate: Math.round(closeWinRate * 100),
          duoScore: Math.round(duoScore * 10) / 10,
          topOpponentKey: topOppKey,
          topOpponentNames: topOppNames,
          topOpponentGames: topOppGames,
        });
      }

      entries.sort((a, b) => b.duoScore - a.duoScore);
      // No ceiling — show all qualifying duos (3+ games)
      duoLeaderboard.value = entries;
      saveCached();

      console.log(
        '[fetchDuoLeaderboard] matches:',
        matches.length,
        'duos:',
        entries.length,
      );
    } catch (err) {
      console.error('Failed to fetch duo leaderboard:', err);
      if (!cached || duoLeaderboard.value.length === 0) {
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
