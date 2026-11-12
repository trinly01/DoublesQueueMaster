import { describe, it, expect } from 'vitest';
import {
  computeClubRanked,
  computeMatchesReplay,
  filterCompetitive,
} from './leaderboardCompute';
import { replayMatches, replayMatchesForRanking } from './ratingReplay';
import type { DirectusCompletedMatch } from 'src/services/playerProfile';

// ---------------------------------------------------------------------------
// Fixtures — DirectusCompletedMatch shaped like the likhaClient payloads the
// leaderboard tabs consume (plain JSON, newest-first).
// ---------------------------------------------------------------------------

type TeamPlayer = DirectusCompletedMatch['team_a'][number];

const reg = (username: string, firstName = username): TeamPlayer => ({
  username,
  userId: `uid-${username}`,
  firstName,
  lastName: 'Last',
  rating: 1500,
  level: 2,
  avatar: `avatar-${username}.png`,
});

const guest = (firstName: string, lastName = 'Guest'): TeamPlayer => ({
  username: '',
  firstName,
  lastName,
  name: firstName,
  rating: 1500,
});

const makeMatch = (
  key: string,
  completedAt: string,
  teamA: TeamPlayer[],
  teamB: TeamPlayer[],
  teamAScore = 11,
  teamBScore = 5,
  matchmakingMode?: string,
): DirectusCompletedMatch => ({
  match_key: key,
  match_id: `mid-${key}`,
  match_type: 'doubles',
  team_a: teamA,
  team_b: teamB,
  team_a_score: teamAScore,
  team_b_score: teamBScore,
  completed_at: completedAt,
  club: 'club-uuid-1',
  meta: matchmakingMode ? { matchmakingMode } : undefined,
});

// ---------------------------------------------------------------------------
// The OLD inline pipelines, copied verbatim from ClubPage.vue before the
// compute moved into the worker. These are the fidelity oracle: the worker
// compute functions must produce deep-equal output.
// ---------------------------------------------------------------------------

// Old fetchGlobalLeaderboard mapping (no `name` field on players).
const oldGlobalMap = (m: DirectusCompletedMatch) => ({
  teamAScore: m.team_a_score,
  teamBScore: m.team_b_score,
  matchKey: m.match_key,
  completedAt: m.completed_at,
  matchmakingMode: m.meta?.matchmakingMode,
  teamA: (m.team_a || []).map((p) => ({
    userId: p.userId,
    username: p.username,
    firstName: p.firstName,
    lastName: p.lastName,
    rating: p.rating,
    level: p.level,
    avatar: p.avatar,
    linkedTo: p.linkedTo,
  })),
  teamB: (m.team_b || []).map((p) => ({
    userId: p.userId,
    username: p.username,
    firstName: p.firstName,
    lastName: p.lastName,
    rating: p.rating,
    level: p.level,
    avatar: p.avatar,
    linkedTo: p.linkedTo,
  })),
});

// Old fetchGlobalLeaderboard competitive filter (mode + all-registered).
const oldGlobalFilter = (matches: DirectusCompletedMatch[]) =>
  matches.filter((m) => {
    const mode = m.meta?.matchmakingMode;
    if (mode === 'fair_balance' || mode === 'variety_first') return false;
    return [...(m.team_a || []), ...(m.team_b || [])].every((p) => !!p.userId);
  });

const oldGlobalPipeline = (matches: DirectusCompletedMatch[]) =>
  replayMatchesForRanking(oldGlobalFilter(matches).map(oldGlobalMap));

// Old fetchMyMatchesLeaderboard mapping + competitive filter + reverse.
const oldMyMatchesMap = (m: DirectusCompletedMatch) => ({
  teamAScore: m.team_a_score,
  teamBScore: m.team_b_score,
  completedAt: m.completed_at,
  teamA: (m.team_a || []).map((p) => ({
    username: p.username,
    name: p.firstName,
    firstName: p.firstName,
    lastName: p.lastName,
    rating: p.rating,
    avatar: p.avatar,
    linkedTo: p.linkedTo,
  })),
  teamB: (m.team_b || []).map((p) => ({
    username: p.username,
    name: p.firstName,
    firstName: p.firstName,
    lastName: p.lastName,
    rating: p.rating,
    avatar: p.avatar,
    linkedTo: p.linkedTo,
  })),
});

const oldMyMatchesFilter = (matches: DirectusCompletedMatch[]) =>
  matches.filter((m) => {
    const mode = m.meta?.matchmakingMode;
    return mode !== 'fair_balance' && mode !== 'variety_first';
  });

const oldMyMatchesPipeline = (matches: DirectusCompletedMatch[]) =>
  replayMatches(
    [...oldMyMatchesFilter(matches)].reverse().map(oldMyMatchesMap),
  );

// A mixed fixture set: registered + guest players, competitive + social
// modes, several chronological steps (Directus order = newest first).
const fixtureMatches: DirectusCompletedMatch[] = [
  // newest
  makeMatch(
    'm4',
    '2026-01-04T18:00:00Z',
    [reg('alice', 'Alice'), reg('bob', 'Bob')],
    [reg('carol', 'Carol'), reg('dave', 'Dave')],
    8,
    11,
    'strict_balance',
  ),
  makeMatch(
    'm3',
    '2026-01-03T18:00:00Z',
    [reg('alice', 'Alice'), guest('Eve')],
    [reg('carol', 'Carol'), guest('Frank')],
    11,
    9,
    'fair_balance', // non-competitive — must be excluded by both pipelines
  ),
  makeMatch(
    'm2',
    '2026-01-02T18:00:00Z',
    [reg('bob', 'Bob'), reg('dave', 'Dave')],
    [reg('alice', 'Alice'), reg('carol', 'Carol')],
    11,
    7,
    'variety_first', // non-competitive
  ),
  makeMatch(
    'm1',
    '2026-01-01T18:00:00Z',
    [reg('alice', 'Alice'), reg('bob', 'Bob')],
    [reg('carol', 'Carol'), reg('dave', 'Dave')],
    11,
    5,
    'strict_balance',
  ),
  // oldest
];

// Same set but every match fully registered — what the global tab feeds the
// worker after its own mode + all-userId pre-filter.
const registeredOnlyMatches = fixtureMatches.filter((m) =>
  [...(m.team_a || []), ...(m.team_b || [])].every((p) => !!p.userId),
);

describe('filterCompetitive', () => {
  it('drops fair_balance and variety_first unless opted in', () => {
    expect(filterCompetitive(fixtureMatches, false)).toHaveLength(2);
    expect(filterCompetitive(fixtureMatches, true)).toHaveLength(4);
  });
});

describe('computeMatchesReplay (My Matches tab)', () => {
  it('returns players keyed by username — the legacy keyspace', () => {
    const result = computeMatchesReplay(fixtureMatches);
    // reg() players carry userId, but the legacy engine keys by
    // username||name — keys must be usernames, not uids.
    expect(Object.keys(result)).toContain('alice');
    expect(Object.keys(result)).not.toContain('uid-alice');
    expect(result['alice']).toMatchObject({
      username: 'alice',
      firstName: 'Alice',
      wins: expect.any(Number),
      losses: expect.any(Number),
      matchesPlayed: expect.any(Number),
    });
    expect(Number.isInteger(result['alice'].rating)).toBe(true);
    expect(result['alice'].initialRating).toBe(1450);
  });

  it('excludes non-competitive modes unconditionally', () => {
    const result = computeMatchesReplay(fixtureMatches);
    // m1 and m4 are the only competitive matches in the fixture.
    const totalGames = Object.values(result).reduce(
      (s, p) => s + p.matchesPlayed,
      0,
    );
    expect(totalGames).toBe(8); // 4 players × 2 matches
  });

  it('reverses newest-first input to chronological order', () => {
    // Two matches where Elo order changes the outcome: alice beats bob,
    // then bob beats alice. Newest-first input must still process the
    // older match first.
    const old = makeMatch(
      'old',
      '2026-01-01T10:00:00Z',
      [reg('alice')],
      [reg('bob')],
      11,
      5,
    );
    const recent = makeMatch(
      'new',
      '2026-01-02T10:00:00Z',
      [reg('bob')],
      [reg('alice')],
      11,
      5,
    );
    const newestFirst = [recent, old];
    const result = computeMatchesReplay(newestFirst);
    // Manually replayed oldest-first through the same legacy mapper shape.
    const expected = replayMatches([
      {
        teamAScore: 11,
        teamBScore: 5,
        completedAt: '2026-01-01T10:00:00Z',
        teamA: [
          {
            username: 'alice',
            name: 'alice',
            firstName: 'alice',
            lastName: 'Last',
            rating: 1500,
            avatar: 'avatar-alice.png',
            linkedTo: undefined,
          },
        ],
        teamB: [
          {
            username: 'bob',
            name: 'bob',
            firstName: 'bob',
            lastName: 'Last',
            rating: 1500,
            avatar: 'avatar-bob.png',
            linkedTo: undefined,
          },
        ],
      },
      {
        teamAScore: 11,
        teamBScore: 5,
        completedAt: '2026-01-02T10:00:00Z',
        teamA: [
          {
            username: 'bob',
            name: 'bob',
            firstName: 'bob',
            lastName: 'Last',
            rating: 1500,
            avatar: 'avatar-bob.png',
            linkedTo: undefined,
          },
        ],
        teamB: [
          {
            username: 'alice',
            name: 'alice',
            firstName: 'alice',
            lastName: 'Last',
            rating: 1500,
            avatar: 'avatar-alice.png',
            linkedTo: undefined,
          },
        ],
      },
    ]);
    expect(result).toEqual(expected);
    // Sanity: order mattered — alice won then lost, so she sits above/below
    // the flat seed but not at a trivially-reversed value.
    expect(result['alice'].rating).not.toBe(result['bob'].rating);
  });

  it('produces output identical to the previous inline ClubPage pipeline', () => {
    expect(computeMatchesReplay(fixtureMatches)).toEqual(
      oldMyMatchesPipeline(fixtureMatches),
    );
  });

  it('handles an empty match list', () => {
    expect(computeMatchesReplay([])).toEqual({});
  });
});

describe('computeClubRanked (reused by the Global leaderboard tab)', () => {
  // The global tab feeds the worker its own pre-filtered match set
  // (competitive modes + fully-registered players only) and then applies
  // rankClubPlayers on the main thread — exactly the useLeaderboard
  // pattern. This suite pins the equivalence that makes reusing the 'club'
  // job kind safe.
  it('matches the previous inline global-tab pipeline', () => {
    const competitive = oldGlobalFilter(registeredOnlyMatches);
    const expected = oldGlobalPipeline(competitive);
    expect(computeClubRanked(competitive, false)).toEqual(expected);
  });

  it('includeNonCompetitive cannot change the result on pre-filtered input', () => {
    const competitive = oldGlobalFilter(registeredOnlyMatches);
    const expected = oldGlobalPipeline(competitive);
    // True and false both yield the old result because non-competitive
    // modes were already removed before the worker call.
    expect(computeClubRanked(competitive, true)).toEqual(expected);
    expect(computeClubRanked(competitive, false)).toEqual(expected);
  });

  it('still filters non-competitive modes when given raw matches', () => {
    // Sanity: on UNFILTERED input the flag does matter — this is the club
    // tab's contract, unchanged by the global-tab reuse.
    const withSocial = computeClubRanked(fixtureMatches, false);
    const all = computeClubRanked(fixtureMatches, true);
    const gamesWith = Object.values(withSocial).reduce(
      (s, p) => s + p.matchesPlayed,
      0,
    );
    const gamesAll = Object.values(all).reduce(
      (s, p) => s + p.matchesPlayed,
      0,
    );
    expect(gamesAll).toBeGreaterThan(gamesWith);
  });
});
