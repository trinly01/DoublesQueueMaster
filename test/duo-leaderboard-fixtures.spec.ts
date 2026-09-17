import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { replayMatchesForRanking } from '../src/utils/ratingReplay';
import {
  buildDuoEntries,
  DUO_MIN_GAMES,
  type DuoEntry,
} from '../src/utils/duoStats';

// The fixture spec exercises the SHARED implementation (src/utils/duoStats.ts)
// used by useDuoLeaderboard and the leaderboard worker — no mirrored logic.

const MIN_GAMES = DUO_MIN_GAMES;

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

type DuoRow = {
  duo: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  synergy: number;
  combinedRating: number;
  duoScore: number;
  topOpponentNames?: string;
  topOpponentGames?: number;
};

function runDuoAlgorithm(
  matches: FixtureMatch[],
  includeNonCompetitive: boolean,
): DuoRow[] {
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

  const entries: DuoEntry[] = buildDuoEntries(replayInputs, ratingMap);
  return entries.map((e) => ({
    duo: `${e.player1.firstName || e.player1.username} & ${e.player2.firstName || e.player2.username}`,
    games: e.games,
    wins: e.wins,
    losses: e.losses,
    winRate: e.winRate,
    synergy: e.synergy,
    combinedRating: e.combinedRating,
    duoScore: e.duoScore,
    topOpponentNames: e.topOpponentNames,
    topOpponentGames: e.topOpponentGames,
  }));
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

  it('resolves topOpponentNames and topOpponentGames', () => {
    const entries = runDuoAlgorithm(matches, true);
    for (const e of entries) {
      expect(e.topOpponentNames).toBeTruthy();
      expect(e.topOpponentNames).toContain('&');
      expect(e.topOpponentGames).toBeGreaterThanOrEqual(1);
      expect(e.topOpponentGames).toBeLessThanOrEqual(e.games);
    }
    // Top duo's most-played opponent should be a real pair of names
    expect(entries[0].topOpponentNames).toMatch(/\S+ & \S+/);
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
