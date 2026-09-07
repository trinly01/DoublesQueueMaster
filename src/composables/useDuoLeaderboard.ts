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

// --- Improvement constants ---

// 1. Synergy shrinkage: temper synergy for low-sample duos.
// At SHRINKAGE_GAMES games, synergy is at full weight.
// Below that, synergy is shrunk proportionally.
// Based on OpenRating spec: "activation threshold of at least three shared matches"
// but full confidence requires more games.
const SHRINKAGE_GAMES = 10;

// 2. Recent form: exponential decay weighting.
// A match 30 days ago has ~22% the weight of a match today.
const RECENCY_DECAY = 0.05; // exp(-0.05 * 30) ≈ 0.22

// 3. Score margin: expected margin per game from rating gap.
// In pickleball to 11, ~0.04 points per rating point of gap.
// A 100-point gap → expected margin of ~4 points.
const MARGIN_SCALE = 0.04;
// Convert margin residual to rating points: 2 points above expected = +10 rating
const MARGIN_TO_RATING = 5;

// 4. Opponent diversity: penalize duos who only beat the same team.
// diversityFactor = 0.85 + 0.15 * (uniqueOpponents / games)
// All same opponent: 0.85, all different: 1.0
const DIVERSITY_FLOOR = 0.85;

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
  rawSynergy: number;
  avgPointDiff: number;
  combinedRating: number;
  closeGames: number;
  closeWins: number;
  closeWinRate: number;
  duoScore: number;
  recentForm: number;
  marginPerf: number;
  diversityFactor: number;
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

type DuoPlayer = DirectusCompletedMatch['team_a'][0];

type DuoAccum = {
  games: number;
  wins: number;
  losses: number;
  pointDiff: number;
  totalTeamRating: number;
  expectedWins: number;
  expectedMargin: number;
  closeGames: number;
  closeWins: number;
  players: [DuoPlayer, DuoPlayer];
  opponents: Map<string, number>;
  // Recency-weighted tracking
  recencyWeightSum: number;
  recencyWinSum: number;
};

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

  // Expected score margin from rating gap
  const computeExpectedMargin = (
    teamRating: number,
    oppTeamRating: number,
  ): number => {
    return (teamRating - oppTeamRating) * MARGIN_SCALE;
  };

  // Recency weight: exponential decay based on days ago
  const recencyWeight = (completedAt: string, now: number): number => {
    const ts = new Date(completedAt).getTime();
    const daysAgo = Math.max(0, (now - ts) / (1000 * 60 * 60 * 24));
    return Math.exp(-RECENCY_DECAY * daysAgo);
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
      const matches = await fetchAllMatches();
      const allMatches = matches;
      const now = Date.now();

      // Step 1: Replay matches to get current player ratings (starting from 1450 seed)
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

      const ratingMap = new Map<string, number>();
      for (const [key, player] of Object.entries(replayed)) {
        ratingMap.set(key, player.rating);
      }

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

      // Step 2: Build duo stats with all improvement signals
      const duoMap = new Map<string, DuoAccum>();

      for (const m of allMatches) {
        const ta = m.team_a || [];
        const tb = m.team_b || [];
        if (ta.length !== 2 || tb.length !== 2) continue;

        const aWon = m.team_a_score > m.team_b_score;
        const r1a = getReplayedRating(ta[0]);
        const r2a = getReplayedRating(ta[1]);
        const r1b = getReplayedRating(tb[0]);
        const r2b = getReplayedRating(tb[1]);
        const teamRatingA = computeTeamRating(r1a, r2a);
        const teamRatingB = computeTeamRating(r1b, r2b);
        const rw = recencyWeight(m.completed_at, now);

        const sides = [
          {
            team: ta as [DuoPlayer, DuoPlayer],
            won: aWon,
            scoreFor: m.team_a_score,
            scoreAgainst: m.team_b_score,
            opponents: tb as [DuoPlayer, DuoPlayer],
            oppTeamRating: teamRatingB,
          },
          {
            team: tb as [DuoPlayer, DuoPlayer],
            won: !aWon,
            scoreFor: m.team_b_score,
            scoreAgainst: m.team_a_score,
            opponents: ta as [DuoPlayer, DuoPlayer],
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
              expectedMargin: 0,
              closeGames: 0,
              closeWins: 0,
              players: side.team,
              opponents: new Map(),
              recencyWeightSum: 0,
              recencyWinSum: 0,
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
          duo.expectedMargin += computeExpectedMargin(
            teamRating,
            side.oppTeamRating,
          );

          // Recency-weighted form
          duo.recencyWeightSum += rw;
          duo.recencyWinSum += side.won ? rw : 0;

          const diff = Math.abs(side.scoreFor - side.scoreAgainst);
          if (diff <= 2) {
            duo.closeGames++;
            if (side.won) duo.closeWins++;
          }

          duo.opponents.set(oppKey, (duo.opponents.get(oppKey) || 0) + 1);
        }
      }

      // Step 3: Build entries with all improvements
      const entries: DuoLeaderboardEntry[] = [];
      for (const [key, duo] of duoMap) {
        if (duo.games < MIN_GAMES) continue;

        const [p1, p2] = duo.players;
        const winRate = duo.wins / duo.games;
        const expectedWR = duo.expectedWins / duo.games;
        const rawSynergy = Math.round((winRate - expectedWR) * 100);
        const avgPointDiff = Math.round((duo.pointDiff / duo.games) * 10) / 10;
        const combinedRating = Math.round(duo.totalTeamRating / duo.games);
        const closeWinRate =
          duo.closeGames > 0 ? duo.closeWins / duo.closeGames : 0;

        // --- Improvement 1: Synergy shrinkage ---
        // Temper synergy for low-sample duos. At 3 games, synergy × 0.3.
        // At 10+ games, full synergy. Prevents 3-game flukes from dominating.
        const shrinkageFactor = Math.min(1, duo.games / SHRINKAGE_GAMES);
        const synergy = Math.round(rawSynergy * shrinkageFactor);

        // --- Improvement 2: Recent form ---
        // Recency-weighted win rate vs overall win rate.
        // A duo on a hot streak gets a bonus; a slumping duo gets penalized.
        const recentWR =
          duo.recencyWeightSum > 0
            ? duo.recencyWinSum / duo.recencyWeightSum
            : winRate;
        const recentForm = Math.round((recentWR - winRate) * 100);
        // Form bonus: +50 rating points for 20% recent improvement
        const formBonus = recentForm * 2.5;

        // --- Improvement 3: Score margin performance ---
        // Compare actual margin to expected margin from rating gap.
        // Winning 11-2 vs a team you were expected to beat 11-7 = +5 margin residual.
        const actualMargin = duo.pointDiff / duo.games;
        const expectedMargin = duo.expectedMargin / duo.games;
        const marginResidual = actualMargin - expectedMargin;
        const marginPerf = Math.round(marginResidual * 10) / 10;
        const marginBonus = marginResidual * MARGIN_TO_RATING;

        // --- Improvement 4: Opponent diversity ---
        // Penalize duos who only play the same opponents.
        // Beating 5 different duos is more impressive than beating the same duo 5 times.
        const uniqueOpponents = duo.opponents.size;
        const diversityFactor =
          DIVERSITY_FLOOR +
          (1 - DIVERSITY_FLOOR) * (uniqueOpponents / duo.games);

        // Find top opponent
        let topOppKey: string | undefined;
        let topOppGames = 0;
        for (const [oppKey, count] of duo.opponents) {
          if (count > topOppGames) {
            topOppGames = count;
            topOppKey = oppKey;
          }
        }

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

        // --- Final ETR with all improvements ---
        // ETR = teamRating + synergyBonus + formBonus + marginBonus
        // All adjusted by diversity factor (penalizes low opponent variety)
        const synergyBonus = synergy * 4; // 400 scale
        const duoScore =
          (combinedRating + synergyBonus + formBonus + marginBonus) *
          diversityFactor;

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
          rawSynergy,
          avgPointDiff,
          combinedRating,
          closeGames: duo.closeGames,
          closeWins: duo.closeWins,
          closeWinRate: Math.round(closeWinRate * 100),
          duoScore: Math.round(duoScore * 10) / 10,
          recentForm,
          marginPerf,
          diversityFactor: Math.round(diversityFactor * 100) / 100,
          topOpponentKey: topOppKey,
          topOpponentNames: topOppNames,
          topOpponentGames: topOppGames,
        });
      }

      entries.sort((a, b) => b.duoScore - a.duoScore);
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
