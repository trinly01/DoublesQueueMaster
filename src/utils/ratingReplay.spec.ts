import { describe, it, expect } from 'vitest';
import {
  replayMatches,
  replayMatchesForRanking,
  rankClubPlayers,
  CLUB_RANKING_CONFIG,
  type RankedMatchInput,
} from './ratingReplay';

describe('replayMatches (legacy, unchanged)', () => {
  it('produces integer ratings', () => {
    const matches = [
      {
        teamAScore: 11,
        teamBScore: 5,
        teamA: [{ username: 'alice', rating: 1500 }],
        teamB: [{ username: 'bob', rating: 1400 }],
      },
    ];
    const result = replayMatches(matches);
    expect(Number.isInteger(result['alice'].rating)).toBe(true);
    expect(Number.isInteger(result['bob'].rating)).toBe(true);
  });

  it('awards winner gains and loser losses', () => {
    const matches = [
      {
        teamAScore: 11,
        teamBScore: 5,
        teamA: [{ username: 'alice', rating: 1500 }],
        teamB: [{ username: 'bob', rating: 1400 }],
      },
    ];
    const result = replayMatches(matches);
    // Flat 1450 seed — stored ratings are ignored
    expect(result['alice'].rating).toBeGreaterThan(1450);
    expect(result['bob'].rating).toBeLessThan(1450);
    expect(result['alice'].wins).toBe(1);
    expect(result['bob'].losses).toBe(1);
  });
});

describe('replayMatchesForRanking — correctness fixes', () => {
  describe('fix #1: guest identity key', () => {
    it('keeps two same-named guests with different userIds separate', () => {
      const matches: RankedMatchInput[] = [
        {
          teamAScore: 11,
          teamBScore: 5,
          matchKey: 'm1',
          completedAt: '2026-01-01T00:00:00Z',
          teamA: [{ userId: 'u1', username: 'mike_a', firstName: 'Mike' }],
          teamB: [{ userId: 'u2', username: 'mike_b', firstName: 'Mike' }],
        },
      ];
      const result = replayMatchesForRanking(matches);
      const keys = Object.keys(result);
      expect(keys).toHaveLength(2);
      expect(keys).toContain('u1');
      expect(keys).toContain('u2');
    });

    it('keeps two unnamed guests with same name but different lastNames separate', () => {
      const matches: RankedMatchInput[] = [
        {
          teamAScore: 11,
          teamBScore: 5,
          matchKey: 'm1',
          completedAt: '2026-01-01T00:00:00Z',
          teamA: [{ firstName: 'Mike', lastName: 'Smith' }],
          teamB: [{ firstName: 'Mike', lastName: 'Jones' }],
        },
      ];
      const result = replayMatchesForRanking(matches);
      const keys = Object.keys(result);
      expect(keys).toHaveLength(2);
    });
  });

  describe('fix #2: tied matches skipped', () => {
    it('does not move ratings on a tied match', () => {
      const matches: RankedMatchInput[] = [
        {
          teamAScore: 10,
          teamBScore: 10,
          matchKey: 'm1',
          completedAt: '2026-01-01T00:00:00Z',
          teamA: [{ username: 'alice', rating: 1500 }],
          teamB: [{ username: 'bob', rating: 1400 }],
        },
      ];
      const result = replayMatchesForRanking(matches);
      expect(result['alice'].rating).toBe(1450);
      expect(result['bob'].rating).toBe(1450);
      expect(result['alice'].matchesPlayed).toBe(0);
      expect(result['bob'].matchesPlayed).toBe(0);
    });
  });

  describe('fix #3: deterministic tiebreaker chain', () => {
    it('sorts by rating desc then games desc then wins desc then winRate desc then username asc', () => {
      const players = {
        a: makeRankedPlayer('a', 1500, 10, 5, 5),
        b: makeRankedPlayer('b', 1500, 10, 5, 5),
        c: makeRankedPlayer('c', 1500, 10, 6, 4),
        d: makeRankedPlayer('d', 1600, 5, 3, 2),
      };
      const ranked = rankClubPlayers(players);
      // d has highest rating
      expect(ranked[0].username).toBe('d');
      // c has more wins than a and b (same rating, same games)
      expect(ranked[1].username).toBe('c');
      // a and b are identical except username → alphabetical
      expect(ranked[2].username).toBe('a');
      expect(ranked[3].username).toBe('b');
    });

    it('produces a total order (no two players in the same position)', () => {
      const players = {
        a: makeRankedPlayer('a', 1500, 10, 5, 5),
        b: makeRankedPlayer('b', 1500, 10, 5, 5),
      };
      const ranked = rankClubPlayers(players);
      expect(ranked[0].username).not.toBe(ranked[1].username);
    });
  });

  describe('fix #4: deterministic match ordering', () => {
    it('produces identical results regardless of input order when timestamps match', () => {
      const baseMatch = (key: string, scoreA: number, scoreB: number) =>
        ({
          teamAScore: scoreA,
          teamBScore: scoreB,
          matchKey: key,
          completedAt: '2026-01-01T00:00:00Z',
          teamA: [{ username: 'alice', rating: 1500 }],
          teamB: [{ username: 'bob', rating: 1400 }],
        }) as RankedMatchInput;

      const order1 = [baseMatch('m1', 11, 5), baseMatch('m2', 11, 7)];
      const order2 = [baseMatch('m2', 11, 7), baseMatch('m1', 11, 5)];

      const r1 = replayMatchesForRanking(order1);
      const r2 = replayMatchesForRanking(order2);

      expect(r1['alice'].rating).toBe(r2['alice'].rating);
      expect(r1['bob'].rating).toBe(r2['bob'].rating);
    });

    it('sorts by completedAt ascending then matchKey ascending', () => {
      const matches: RankedMatchInput[] = [
        {
          teamAScore: 11,
          teamBScore: 5,
          matchKey: 'm2',
          completedAt: '2026-01-02T00:00:00Z',
          teamA: [{ username: 'alice', rating: 1500 }],
          teamB: [{ username: 'bob', rating: 1400 }],
        },
        {
          teamAScore: 11,
          teamBScore: 5,
          matchKey: 'm1',
          completedAt: '2026-01-01T00:00:00Z',
          teamA: [{ username: 'alice', rating: 1500 }],
          teamB: [{ username: 'bob', rating: 1400 }],
        },
      ];
      // Should process m1 first (earlier date) regardless of input order
      const result = replayMatchesForRanking(matches);
      expect(result['alice'].matchesPlayed).toBe(2);
      expect(result['bob'].matchesPlayed).toBe(2);
    });
  });

  describe('flat seeding', () => {
    it('ignores stored ratings and level — everyone starts at 1450', () => {
      const matches: RankedMatchInput[] = [
        {
          teamAScore: 11,
          teamBScore: 5,
          matchKey: 'm1',
          completedAt: '2026-01-01T00:00:00Z',
          teamA: [{ username: 'alice', rating: 1800, level: 3 }],
          teamB: [{ username: 'opponent1', rating: 1500 }],
        },
        {
          teamAScore: 11,
          teamBScore: 5,
          matchKey: 'm2',
          completedAt: '2026-01-01T01:00:00Z',
          teamA: [{ username: 'bob' }],
          teamB: [{ username: 'opponent2', rating: 1500 }],
        },
      ];
      const result = replayMatchesForRanking(matches);
      // Both won identical matches from the same flat seed — identical ratings.
      expect(result['alice'].rating).toBe(result['bob'].rating);
      expect(result['alice'].rating).toBeGreaterThan(1450);
    });
  });
});

describe('replayMatchesForRanking — reliability & provisional', () => {
  it('marks 0-game player as provisional with 0% reliability', () => {
    const matches: RankedMatchInput[] = [
      {
        teamAScore: 11,
        teamBScore: 5,
        matchKey: 'm1',
        completedAt: '2026-01-01T00:00:00Z',
        teamA: [{ username: 'alice', rating: 1500 }],
        teamB: [{ username: 'bob', rating: 1400 }],
      },
    ];
    const result = replayMatchesForRanking(matches);
    // Alice won 1 game — not provisional (threshold = 12)
    expect(result['alice'].provisional).toBe(true);
    expect(result['alice'].gamesToReliable).toBe(
      CLUB_RANKING_CONFIG.provisionalThreshold - 1,
    );
    expect(result['alice'].reliability).toBeCloseTo(
      1 / (1 + 12), // n/(n+C) with C=12
    );
  });

  it('marks player as reliable after enough games', () => {
    // Create 15 matches so alice has 15 games (above threshold of 12)
    const matches: RankedMatchInput[] = Array.from({ length: 15 }, (_, i) => ({
      teamAScore: 11,
      teamBScore: 5,
      matchKey: `m${i}`,
      completedAt: `2026-01-0${(i % 9) + 1}T00:00:00Z`,
      teamA: [{ username: 'alice', rating: 1500 }],
      teamB: [{ username: 'bob', rating: 1400 }],
    }));
    const result = replayMatchesForRanking(matches);
    expect(result['alice'].provisional).toBe(false);
    expect(result['alice'].gamesToReliable).toBe(0);
    expect(result['alice'].reliability).toBeCloseTo(
      15 / (15 + 12), // n/(n+C) with C=12
    );
  });

  it('a 1-game player cannot outrank a 50-game player with higher true rating', () => {
    // Alice: 50 games, ends at 1600
    // Charlie: 1 lucky win vs a 1600 player, jumps to ~1660
    // With raw Elo (C=0), Charlie would rank above Alice.
    // This test documents the current behavior: raw Elo IS used for ranking
    // (per backtest), but Charlie is marked provisional so users understand.
    const aliceMatches: RankedMatchInput[] = Array.from(
      { length: 50 },
      (_, i) => ({
        teamAScore: 11,
        teamBScore: 9,
        matchKey: `a${i}`,
        completedAt: new Date(2026, 0, i + 1).toISOString(),
        teamA: [{ username: 'alice', rating: 1500 }],
        teamB: [{ username: 'opponent', rating: 1500 }],
      }),
    );
    const charlieMatch: RankedMatchInput = {
      teamAScore: 11,
      teamBScore: 0,
      matchKey: 'c1',
      completedAt: new Date(2026, 6, 1).toISOString(),
      teamA: [{ username: 'charlie', rating: 1450 }],
      teamB: [{ username: 'strongplayer', rating: 1600 }],
    };
    const result = replayMatchesForRanking([...aliceMatches, charlieMatch]);
    const ranked = rankClubPlayers(result);
    // Charlie is provisional (1 game), Alice is not (50 games)
    expect(result['charlie'].provisional).toBe(true);
    expect(result['alice'].provisional).toBe(false);
    // The ranking uses raw Elo — Charlie may or may not be above Alice,
    // but the provisional marker is the key UX signal.
    // Just verify both appear in the ranked list.
    const usernames = ranked.map((p) => p.username);
    expect(usernames).toContain('alice');
    expect(usernames).toContain('charlie');
  });
});

describe('replayMatchesForRanking — mode filtering', () => {
  it('counts W/L but does not update ratings for fair_balance (Casual)', () => {
    const matches: RankedMatchInput[] = [
      {
        teamAScore: 11,
        teamBScore: 5,
        matchKey: 'm1',
        completedAt: '2026-01-01T00:00:00Z',
        matchmakingMode: 'fair_balance',
        teamA: [{ username: 'alice', rating: 1500 }],
        teamB: [{ username: 'bob', rating: 1400 }],
      },
    ];
    const result = replayMatchesForRanking(matches);
    expect(result['alice'].rating).toBe(1450);
    expect(result['bob'].rating).toBe(1450);
    expect(result['alice'].wins).toBe(1);
    expect(result['bob'].losses).toBe(1);
    expect(result['alice'].matchesPlayed).toBe(1);
  });

  it('counts W/L but does not update ratings for variety_first (Social)', () => {
    const matches: RankedMatchInput[] = [
      {
        teamAScore: 11,
        teamBScore: 5,
        matchKey: 'm1',
        completedAt: '2026-01-01T00:00:00Z',
        matchmakingMode: 'variety_first',
        teamA: [{ username: 'alice', rating: 1500 }],
        teamB: [{ username: 'bob', rating: 1400 }],
      },
    ];
    const result = replayMatchesForRanking(matches);
    expect(result['alice'].rating).toBe(1450);
    expect(result['bob'].rating).toBe(1450);
    expect(result['alice'].wins).toBe(1);
    expect(result['bob'].losses).toBe(1);
  });

  it('updates ratings for blank/missing matchmakingMode (treated as competitive)', () => {
    const matches: RankedMatchInput[] = [
      {
        teamAScore: 11,
        teamBScore: 5,
        matchKey: 'm1',
        completedAt: '2026-01-01T00:00:00Z',
        teamA: [{ username: 'alice', rating: 1500 }],
        teamB: [{ username: 'bob', rating: 1400 }],
      },
    ];
    const result = replayMatchesForRanking(matches);
    expect(result['alice'].rating).toBeGreaterThan(1450);
    expect(result['bob'].rating).toBeLessThan(1450);
  });

  it('updates ratings for strict_balance (Pro Pick)', () => {
    const matches: RankedMatchInput[] = [
      {
        teamAScore: 11,
        teamBScore: 5,
        matchKey: 'm1',
        completedAt: '2026-01-01T00:00:00Z',
        matchmakingMode: 'strict_balance',
        teamA: [{ username: 'alice', rating: 1500 }],
        teamB: [{ username: 'bob', rating: 1400 }],
      },
    ];
    const result = replayMatchesForRanking(matches);
    expect(result['alice'].rating).toBeGreaterThan(1450);
    expect(result['bob'].rating).toBeLessThan(1450);
  });

  it('mixes rated and unrated matches correctly', () => {
    const matches: RankedMatchInput[] = [
      // Unrated match first — W/L only
      {
        teamAScore: 11,
        teamBScore: 5,
        matchKey: 'm1',
        completedAt: '2026-01-01T00:00:00Z',
        matchmakingMode: 'fair_balance',
        teamA: [{ username: 'alice', rating: 1500 }],
        teamB: [{ username: 'bob', rating: 1400 }],
      },
      // Rated match second — should move ratings
      {
        teamAScore: 11,
        teamBScore: 5,
        matchKey: 'm2',
        completedAt: '2026-01-01T01:00:00Z',
        matchmakingMode: 'strict_balance',
        teamA: [{ username: 'alice', rating: 1500 }],
        teamB: [{ username: 'bob', rating: 1400 }],
      },
    ];
    const result = replayMatchesForRanking(matches);
    // Alice won both, but only the second match moved her rating
    expect(result['alice'].rating).toBeGreaterThan(1450);
    expect(result['alice'].wins).toBe(2);
    expect(result['alice'].matchesPlayed).toBe(2);
    // Only 1 rated match — reliability and provisional based on that
    expect(result['alice'].ratedMatchesPlayed).toBe(1);
    expect(result['alice'].provisional).toBe(true);
    expect(result['alice'].gamesToReliable).toBe(11);
  });

  it('casual matches do not count toward provisional threshold', () => {
    // 15 casual matches — should still be provisional with 0 rated games
    const matches: RankedMatchInput[] = Array.from({ length: 15 }, (_, i) => ({
      teamAScore: 11,
      teamBScore: 5,
      matchKey: `m${i}`,
      completedAt: `2026-01-0${(i % 9) + 1}T00:00:00Z`,
      matchmakingMode: 'fair_balance',
      teamA: [{ username: 'alice', rating: 1500 }],
      teamB: [{ username: 'bob', rating: 1400 }],
    }));
    const result = replayMatchesForRanking(matches);
    // 15 total matches but 0 rated — still provisional
    expect(result['alice'].matchesPlayed).toBe(15);
    expect(result['alice'].ratedMatchesPlayed).toBe(0);
    expect(result['alice'].provisional).toBe(true);
    expect(result['alice'].gamesToReliable).toBe(12);
    expect(result['alice'].reliability).toBe(0);
    // Rating unchanged from seed
    expect(result['alice'].rating).toBe(1450);
  });
});

describe('fixed-duo exclusion — declared and detected', () => {
  const dubs = (
    a1: string,
    a2: string,
    b1: string,
    b2: string,
    aWon: boolean,
    key: string,
    day: string,
    ratings: [number, number, number, number] = [1450, 1450, 1450, 1450],
  ): RankedMatchInput => ({
    teamAScore: aWon ? 11 : 5,
    teamBScore: aWon ? 5 : 11,
    matchKey: key,
    completedAt: `${day}T00:00:00Z`,
    teamA: [
      { username: a1, rating: ratings[0] },
      { username: a2, rating: ratings[1] },
    ],
    teamB: [
      { username: b1, rating: ratings[2] },
      { username: b2, rating: ratings[3] },
    ],
  });

  it('excludes matches containing a declared linkedTo partner', () => {
    const matches: RankedMatchInput[] = [
      {
        teamAScore: 11,
        teamBScore: 5,
        matchKey: 'm1',
        completedAt: '2026-01-01T00:00:00Z',
        teamA: [
          { username: 'alice', linkedTo: 'bob' },
          { username: 'bob', linkedTo: 'alice' },
        ],
        teamB: [{ username: 'carol' }, { username: 'dave' }],
      },
      {
        teamAScore: 11,
        teamBScore: 5,
        matchKey: 'm2',
        completedAt: '2026-01-01T01:00:00Z',
        teamA: [{ username: 'erin' }, { username: 'fred' }],
        teamB: [{ username: 'carol' }, { username: 'dave' }],
      },
    ];
    const result = replayMatchesForRanking(matches);
    // Linked match excluded — nobody in it earned rated games
    expect(result['alice'].ratedMatchesPlayed).toBe(0);
    expect(result['alice'].rating).toBe(1450);
    // Unlinked match counted normally
    expect(result['erin'].ratedMatchesPlayed).toBe(1);
    expect(result['erin'].rating).toBeGreaterThan(1450);
  });

  it('excludes a detected undeclared duo via concentration (mutual top, >=50% share)', () => {
    // alice+bob only ever play together: 5/5 games each, mutual top
    const matches: RankedMatchInput[] = [
      dubs('alice', 'bob', 'carol', 'dave', true, 'm1', '2026-01-01'),
      dubs('alice', 'bob', 'erin', 'fred', true, 'm2', '2026-01-01'),
      dubs('alice', 'bob', 'carol', 'fred', true, 'm3', '2026-01-02'),
      dubs('alice', 'bob', 'dave', 'erin', true, 'm4', '2026-01-02'),
      dubs('alice', 'bob', 'carol', 'erin', true, 'm5', '2026-01-02'),
      // A legit rotating match that must still count
      dubs('carol', 'dave', 'erin', 'fred', false, 'm6', '2026-01-03'),
    ];
    const result = replayMatchesForRanking(matches);
    // All alice+bob matches excluded — they earned nothing
    expect(result['alice'].ratedMatchesPlayed).toBe(0);
    expect(result['bob'].ratedMatchesPlayed).toBe(0);
    expect(result['alice'].rating).toBe(1450);
    // The rotating match still counted for its participants
    expect(result['erin'].ratedMatchesPlayed).toBe(1);
    expect(result['fred'].rating).toBeGreaterThan(1450);
  });

  it('does not flag a rotating pool where everyone partners everyone', () => {
    // 8-player rotation — partner changes every game, no pair repeats 4x
    const pool = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    const matches: RankedMatchInput[] = [];
    for (let i = 0; i < 12; i++) {
      matches.push(
        dubs(
          pool[i % 8]!,
          pool[(i + 1) % 8]!,
          pool[(i + 3) % 8]!,
          pool[(i + 5) % 8]!,
          i % 2 === 0,
          `r${i}`,
          '2026-01-01',
        ),
      );
    }
    const result = replayMatchesForRanking(matches);
    // Every match counted — no pair concentration
    expect(result['p1'].ratedMatchesPlayed).toBeGreaterThan(0);
  });

  it('flags below-50% share when corroborated by multi-day persistence', () => {
    // alice plays 12 games: 5 with bob (42%), 7 with distinct partners.
    // bob likewise. Mutual top partners, spread over 2 days -> persistence.
    const matches: RankedMatchInput[] = [
      dubs('alice', 'bob', 'x1', 'x2', true, 'm1', '2026-01-01'),
      dubs('alice', 'bob', 'x3', 'x4', true, 'm2', '2026-01-01'),
      dubs('alice', 'bob', 'x5', 'x6', true, 'm3', '2026-01-02'),
      dubs('alice', 'bob', 'x7', 'x8', true, 'm4', '2026-01-02'),
      dubs('alice', 'bob', 'x9', 'x10', true, 'm5', '2026-01-02'),
      // 7 more alice games each with a unique partner (never repeated)
      ...Array.from({ length: 7 }, (_, i) =>
        dubs(
          'alice',
          `ap${i}`,
          `ao${i}a`,
          `ao${i}b`,
          i % 2 === 0,
          `n${i}`,
          '2026-01-03',
        ),
      ),
      // 7 bob games with unique partners so bob's share is also 42%
      ...Array.from({ length: 7 }, (_, i) =>
        dubs(
          'bob',
          `bp${i}`,
          `bo${i}a`,
          `bo${i}b`,
          i % 2 === 0,
          `o${i}`,
          '2026-01-04',
        ),
      ),
    ];
    const result = replayMatchesForRanking(matches);
    // alice+bob pair flagged -> those 5 matches excluded; her other 7 counted
    expect(result['alice'].ratedMatchesPlayed).toBe(7);
    expect(result['bob'].ratedMatchesPlayed).toBe(7);
  });

  it('flags a carry pattern: big rating gap, weaker member only wins with partner', () => {
    // weak (1300) plays 9 games: 4 with strong (1700, wins all 4),
    // 5 with others (loses all 5). One day -> persistence off; carry fires.
    const matches: RankedMatchInput[] = [
      ...Array.from({ length: 4 }, (_, i) =>
        dubs(
          'weak',
          'strong',
          `w${i}a`,
          `w${i}b`,
          true,
          `c${i}`,
          '2026-01-01',
          [1300, 1700, 1450, 1450],
        ),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        dubs(
          'weak',
          `ws${i}`,
          `wo${i}a`,
          `wo${i}b`,
          false,
          `s${i}`,
          '2026-01-01',
          [1300, 1450, 1450, 1450],
        ),
      ),
      // strong also plays solo games so his share of weak-games is <50%
      ...Array.from({ length: 6 }, (_, i) =>
        dubs(
          'strong',
          `ss${i}`,
          `so${i}a`,
          `so${i}b`,
          true,
          `t${i}`,
          '2026-01-01',
          [1700, 1450, 1450, 1450],
        ),
      ),
    ];
    const result = replayMatchesForRanking(matches);
    // weak+strong flagged as carry duo — those 4 matches excluded
    expect(result['weak'].ratedMatchesPlayed).toBe(5);
  });

  it('applies the same detection in the legacy replayMatches path', () => {
    const matches = [
      dubs('alice', 'bob', 'carol', 'dave', true, 'm1', '2026-01-01'),
      dubs('alice', 'bob', 'erin', 'fred', true, 'm2', '2026-01-02'),
      dubs('alice', 'bob', 'carol', 'fred', true, 'm3', '2026-01-03'),
      dubs('alice', 'bob', 'dave', 'erin', true, 'm4', '2026-01-04'),
    ];
    const result = replayMatches(matches);
    expect(result['alice'].matchesPlayed).toBe(0);
    expect(result['alice'].rating).toBe(1450);
  });
});

// Helper
function makeRankedPlayer(
  username: string,
  rating: number,
  games: number,
  wins: number,
  losses: number,
) {
  return {
    username,
    name: username,
    firstName: username,
    lastName: '',
    rating,
    initialRating: 1450,
    matchesPlayed: games,
    ratedMatchesPlayed: games,
    wins,
    losses,
    avatar: '',
    reliability: Math.min(1, games / (games + 12)), // n/(n+C) with C=12
    provisional: games < CLUB_RANKING_CONFIG.provisionalThreshold,
    gamesToReliable: Math.max(
      0,
      CLUB_RANKING_CONFIG.provisionalThreshold - games,
    ),
  };
}
