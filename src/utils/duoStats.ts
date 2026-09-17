// Duo (partnership) leaderboard statistics — pure functions, no imports.
// Safe to run inside a Web Worker (no DOM, no Quasar, no Vue).
// Extracted from useDuoLeaderboard.ts so the composable, the worker, and
// the fixture spec all share one implementation.

export type DuoPlayerInput = {
  userId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  avatar?: string;
  level?: number;
  rating?: number;
};

export type DuoMatchInput = {
  teamAScore: number;
  teamBScore: number;
  completedAt?: string;
  teamA: DuoPlayerInput[];
  teamB: DuoPlayerInput[];
};

export type DuoEntry = {
  key: string;
  player1: DuoPlayerInput & { rating: number };
  player2: DuoPlayerInput & { rating: number };
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

// Same team rating formula used in matchmaking (softened harmonic mean)
// 60% harmonic + 40% arithmetic — respects weakest link without over-penalizing
const computeTeamRating = (r1: number, r2: number): number => {
  const harmonic = 2 / (1 / Math.max(1, r1) + 1 / Math.max(1, r2));
  const arithmetic = (r1 + r2) / 2;
  return harmonic * 0.6 + arithmetic * 0.4;
};

// Identity key matching ratingReplay.ts playerIdentityKey
export const duoPlayerKey = (p: {
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

export const DUO_MIN_GAMES = 2;

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
  players: [DuoPlayerInput, DuoPlayerInput];
  opponents: Map<string, number>;
  // Recency-weighted tracking
  recencyWeightSum: number;
  recencyWinSum: number;
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
const recencyWeight = (completedAt: string | undefined, now: number): number => {
  const ts = completedAt ? new Date(completedAt).getTime() : now;
  const daysAgo = Math.max(0, (now - ts) / (1000 * 60 * 60 * 24));
  return Math.exp(-RECENCY_DECAY * daysAgo);
};

/**
 * Build duo leaderboard entries from normalized matches.
 *
 * @param matches - normalized doubles matches (2v2 only are counted)
 * @param ratingMap - replayed player ratings keyed by duoPlayerKey
 * @param now - reference timestamp for recency weighting
 */
export function buildDuoEntries(
  matches: DuoMatchInput[],
  ratingMap: Map<string, number>,
  now = Date.now(),
): DuoEntry[] {
  const getRating = (p: DuoPlayerInput): number =>
    ratingMap.get(duoPlayerKey(p)) || 1450;

  // Display name per player key — built in the same pass as the stats so
  // top-opponent lookup stays O(matches) instead of O(duos × matches).
  const nameMap = new Map<string, string>();
  const displayName = (p: DuoPlayerInput) => p.firstName || p.username || '';

  const duoMap = new Map<string, DuoAccum>();

  for (const m of matches) {
    const ta = m.teamA || [];
    const tb = m.teamB || [];
    if (ta.length !== 2 || tb.length !== 2) continue;

    for (const p of [...ta, ...tb]) {
      const k = duoPlayerKey(p);
      if (!nameMap.has(k)) nameMap.set(k, displayName(p));
    }

    const aWon = m.teamAScore > m.teamBScore;
    const teamRatingA = computeTeamRating(getRating(ta[0]), getRating(ta[1]));
    const teamRatingB = computeTeamRating(getRating(tb[0]), getRating(tb[1]));
    const rw = recencyWeight(m.completedAt, now);

    const sides = [
      {
        team: ta as [DuoPlayerInput, DuoPlayerInput],
        won: aWon,
        scoreFor: m.teamAScore,
        scoreAgainst: m.teamBScore,
        opponents: tb as [DuoPlayerInput, DuoPlayerInput],
        oppTeamRating: teamRatingB,
      },
      {
        team: tb as [DuoPlayerInput, DuoPlayerInput],
        won: !aWon,
        scoreFor: m.teamBScore,
        scoreAgainst: m.teamAScore,
        opponents: ta as [DuoPlayerInput, DuoPlayerInput],
        oppTeamRating: teamRatingA,
      },
    ];

    for (const side of sides) {
      const [p1, p2] = side.team;
      const key = [duoPlayerKey(p1), duoPlayerKey(p2)].sort().join('|');
      const oppKey = [
        duoPlayerKey(side.opponents[0]),
        duoPlayerKey(side.opponents[1]),
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

      const teamRating = computeTeamRating(getRating(p1), getRating(p2));
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

  const entries: DuoEntry[] = [];
  for (const [key, duo] of duoMap) {
    if (duo.games < DUO_MIN_GAMES) continue;

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

    // Find top opponent — O(opponents) per duo, names via precomputed map
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
      const [k1, k2] = topOppKey.split('|');
      topOppNames = `${nameMap.get(k1) || ''} & ${nameMap.get(k2) || ''}`;
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
      player1: { ...sortedPlayers[0], rating: getRating(sortedPlayers[0]) },
      player2: { ...sortedPlayers[1], rating: getRating(sortedPlayers[1]) },
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
  return entries;
}
