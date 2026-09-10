import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { replayMatchesForRanking } from '../src/utils/ratingReplay';

// --- Helpers (mirrors useDuoLeaderboard.ts logic) ---

const SHRINKAGE_GAMES = 10;
const RECENCY_DECAY = 0.05;
const MARGIN_SCALE = 0.04;
const MARGIN_TO_RATING = 5;
const DIVERSITY_FLOOR = 0.85;
const MIN_GAMES = 2;

const playerKey = (p: {
  userId?: string;
  username?: string;
  firstName?: string;
}): string => {
  if (p.userId) return p.userId;
  if (p.username) return p.username;
  return `guest:${p.firstName || ''}`;
};

const computeTeamRating = (r1: number, r2: number): number => {
  const harmonic = 2 / (1 / Math.max(1, r1) + 1 / Math.max(1, r2));
  const arithmetic = (r1 + r2) / 2;
  return harmonic * 0.6 + arithmetic * 0.4;
};

const recencyWeight = (completedAt: string, now: number): number => {
  const ts = new Date(completedAt).getTime();
  const daysAgo = Math.max(0, (now - ts) / (1000 * 60 * 60 * 24));
  return Math.exp(-RECENCY_DECAY * daysAgo);
};

const computeExpectedWinRate = (tr: number, opr: number): number =>
  1 / (1 + Math.pow(10, -(tr - opr) / 400));

const computeExpectedMargin = (tr: number, opr: number): number =>
  (tr - opr) * MARGIN_SCALE;

type FixtureMatch = {
  id: string;
  club: string;
  match_key: string;
  match_type: string;
  team_a_score: number;
  team_b_score: number;
  completed_at: string;
  meta: { matchmakingMode?: string } | null;
  team_a: Array<{
    userId?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    level?: number;
    rating?: number;
  }>;
  team_b: Array<{
    userId?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    level?: number;
    rating?: number;
  }>;
};

function loadFixture(name: string): FixtureMatch[] {
  const path = resolve(
    process.cwd(),
    'test',
    'fixtures',
    `completed_matches_${name}_60d.json`,
  );
  return JSON.parse(readFileSync(path, 'utf8'));
}

function runDuoAlgorithm(
  matches: FixtureMatch[],
  includeNonCompetitive: boolean,
): Array<{
  duo: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  synergy: number;
  combinedRating: number;
  duoScore: number;
}> {
  // Step 1: Replay to get player ratings
  const replayInputs = matches.map((m) => ({
    teamAScore: m.team_a_score,
    teamBScore: m.team_b_score,
    matchKey: m.match_key,
    completedAt: m.completed_at,
    matchmakingMode: m.meta?.matchmakingMode,
    teamA: m.team_a.map((p) => ({
      userId: p.userId,
      username: p.username,
      name: p.firstName,
      firstName: p.firstName,
      lastName: p.lastName,
      level: p.level as 1 | 2 | 3,
      rating: p.rating,
      avatar: '',
    })),
    teamB: m.team_b.map((p) => ({
      userId: p.userId,
      username: p.username,
      name: p.firstName,
      firstName: p.firstName,
      lastName: p.lastName,
      level: p.level as 1 | 2 | 3,
      rating: p.rating,
      avatar: '',
    })),
  }));

  const replayed = replayMatchesForRanking(replayInputs, includeNonCompetitive);
  const ratingMap = new Map<string, number>();
  for (const [key, player] of Object.entries(replayed)) {
    ratingMap.set(key, player.rating);
  }
  const getR = (p: {
    userId?: string;
    username?: string;
    firstName?: string;
  }) => ratingMap.get(playerKey(p)) || 1450;

  // Step 2: Build duo stats
  const now = Date.now();
  const duoMap = new Map<
    string,
    {
      games: number;
      wins: number;
      losses: number;
      pointDiff: number;
      totalTeamRating: number;
      expectedWins: number;
      expectedMargin: number;
      closeGames: number;
      closeWins: number;
      players: [FixtureMatch['team_a'][0], FixtureMatch['team_a'][0]];
      opponents: Map<string, number>;
      recencyWeightSum: number;
      recencyWinSum: number;
    }
  >();

  for (const m of matches) {
    const ta = m.team_a || [];
    const tb = m.team_b || [];
    if (ta.length !== 2 || tb.length !== 2) continue;

    const aWon = m.team_a_score > m.team_b_score;
    const trA = computeTeamRating(getR(ta[0]), getR(ta[1]));
    const trB = computeTeamRating(getR(tb[0]), getR(tb[1]));
    const rw = recencyWeight(m.completed_at, now);

    const sides = [
      {
        team: ta as [FixtureMatch['team_a'][0], FixtureMatch['team_a'][0]],
        won: aWon,
        scoreFor: m.team_a_score,
        scoreAgainst: m.team_b_score,
        opponents: tb as [FixtureMatch['team_a'][0], FixtureMatch['team_a'][0]],
        oppTeamRating: trB,
      },
      {
        team: tb as [FixtureMatch['team_a'][0], FixtureMatch['team_a'][0]],
        won: !aWon,
        scoreFor: m.team_b_score,
        scoreAgainst: m.team_a_score,
        opponents: ta as [FixtureMatch['team_a'][0], FixtureMatch['team_a'][0]],
        oppTeamRating: trA,
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

      const teamRating = computeTeamRating(getR(p1), getR(p2));
      duo.totalTeamRating += teamRating;
      duo.expectedWins += computeExpectedWinRate(
        teamRating,
        side.oppTeamRating,
      );
      duo.expectedMargin += computeExpectedMargin(
        teamRating,
        side.oppTeamRating,
      );
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

  // Step 3: Score
  const entries: Array<{
    duo: string;
    games: number;
    wins: number;
    losses: number;
    winRate: number;
    synergy: number;
    combinedRating: number;
    duoScore: number;
  }> = [];

  for (const [, duo] of duoMap) {
    if (duo.games < MIN_GAMES) continue;

    const [p1, p2] = duo.players;
    const winRate = duo.wins / duo.games;
    const expectedWR = duo.expectedWins / duo.games;
    const rawSynergy = Math.round((winRate - expectedWR) * 100);
    const combinedRating = Math.round(duo.totalTeamRating / duo.games);

    const shrinkageFactor = Math.min(1, duo.games / SHRINKAGE_GAMES);
    const synergy = Math.round(rawSynergy * shrinkageFactor);

    const recentWR =
      duo.recencyWeightSum > 0
        ? duo.recencyWinSum / duo.recencyWeightSum
        : winRate;
    const recentForm = Math.round((recentWR - winRate) * 100);
    const formBonus = recentForm * 2.5;

    const actualMargin = duo.pointDiff / duo.games;
    const expectedMargin = duo.expectedMargin / duo.games;
    const marginResidual = actualMargin - expectedMargin;
    const marginBonus = marginResidual * MARGIN_TO_RATING;

    const uniqueOpponents = duo.opponents.size;
    const diversityFactor =
      DIVERSITY_FLOOR + (1 - DIVERSITY_FLOOR) * (uniqueOpponents / duo.games);

    const synergyBonus = synergy * 4;
    const duoScore =
      (combinedRating + synergyBonus + formBonus + marginBonus) *
      diversityFactor;

    entries.push({
      duo: `${p1.firstName || p1.username} & ${p2.firstName || p2.username}`,
      games: duo.games,
      wins: duo.wins,
      losses: duo.losses,
      winRate: Math.round(winRate * 100),
      synergy,
      combinedRating,
      duoScore: Math.round(duoScore * 10) / 10,
    });
  }

  entries.sort((a, b) => b.duoScore - a.duoScore);
  return entries;
}

// --- Tests ---

describe('Duo leaderboard — Siklab Pickleball Club fixtures', () => {
  const matches = loadFixture('siklab-pickleball-club');

  it('loads fixture with 1360 matches', () => {
    expect(matches.length).toBe(1360);
  });

  it('has mixed matchmaking modes', () => {
    const modes = new Set(
      matches.map((m) => m.meta?.matchmakingMode || 'none'),
    );
    expect(modes.has('strict_balance')).toBe(true);
    expect(modes.has('variety_first')).toBe(true);
    expect(modes.size).toBeGreaterThan(1);
  });

  it('produces duos sorted by duoScore descending', () => {
    const entries = runDuoAlgorithm(matches, true);
    expect(entries.length).toBeGreaterThan(100);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].duoScore).toBeGreaterThanOrEqual(
        entries[i].duoScore,
      );
    }
  });

  it('SHIRWIN & Tristan is top duo with includeNonCompetitive=true', () => {
    const entries = runDuoAlgorithm(matches, true);
    expect(entries[0].duo).toContain('SHIRWIN');
    expect(entries[0].duo).toContain('Tristan');
    expect(entries[0].duoScore).toBeGreaterThan(1800);
  });

  it('all duos have at least MIN_GAMES games', () => {
    const entries = runDuoAlgorithm(matches, true);
    for (const e of entries) {
      expect(e.games).toBeGreaterThanOrEqual(MIN_GAMES);
    }
  });

  it('win rates are between 0 and 100', () => {
    const entries = runDuoAlgorithm(matches, true);
    for (const e of entries) {
      expect(e.winRate).toBeGreaterThanOrEqual(0);
      expect(e.winRate).toBeLessThanOrEqual(100);
    }
  });

  it('duoScores are within reasonable range', () => {
    const entries = runDuoAlgorithm(matches, true);
    for (const e of entries) {
      expect(e.duoScore).toBeGreaterThan(1000);
      expect(e.duoScore).toBeLessThan(2200);
    }
  });

  it('includeNonCompetitive=false produces different (or same) results', () => {
    const withNon = runDuoAlgorithm(matches, true);
    const withoutNon = runDuoAlgorithm(matches, false);
    // Both should produce results
    expect(withNon.length).toBeGreaterThan(0);
    expect(withoutNon.length).toBeGreaterThan(0);
    // The top duo may differ since non-competitive matches are excluded
    // but both should be valid sorted lists
    for (let i = 1; i < withoutNon.length; i++) {
      expect(withoutNon[i - 1].duoScore).toBeGreaterThanOrEqual(
        withoutNon[i].duoScore,
      );
    }
  });
});

describe('Duo leaderboard — Siklab Tryout fixtures', () => {
  const matches = loadFixture('siklab-tryout');

  it('loads fixture with 30 matches', () => {
    expect(matches.length).toBe(30);
  });

  it('all matches are variety_first (Social)', () => {
    for (const m of matches) {
      expect(m.meta?.matchmakingMode).toBe('variety_first');
    }
  });

  it('produces only 2 duos with 2+ games (low partner repetition)', () => {
    const entries = runDuoAlgorithm(matches, true);
    expect(entries.length).toBe(2);
  });

  it('both qualifying duos are 0-2 (losing duos)', () => {
    const entries = runDuoAlgorithm(matches, true);
    for (const e of entries) {
      expect(e.wins).toBe(0);
      expect(e.losses).toBe(2);
      expect(e.winRate).toBe(0);
    }
  });

  it('Ednalyn appears in matches but not in duo results (only 1 game per partner)', () => {
    const hasEdnalyn = matches.some((m) =>
      [...m.team_a, ...m.team_b].some(
        (p) => p.username?.includes('ednalyn') || p.firstName === 'Ednalyn',
      ),
    );
    expect(hasEdnalyn).toBe(true);

    const entries = runDuoAlgorithm(matches, true);
    const ednalynDuo = entries.find((e) =>
      e.duo.toLowerCase().includes('ednalyn'),
    );
    expect(ednalynDuo).toBeUndefined();
  });
});
