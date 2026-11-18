import { describe, expect, it } from 'vitest';
import { computeNetworkScores } from './networkRanking';
import type {
  RankedMatchInput,
  ReplayPlayerInput,
} from './ratingReplay';

const pl = (name: string): ReplayPlayerInput => ({ username: name });

const m = (
  a: string[],
  b: string[],
  sa: number,
  sb: number,
  key: string,
  at = '2025-01-01T00:00:00Z',
): RankedMatchInput => ({
  teamAScore: sa,
  teamBScore: sb,
  completedAt: at,
  matchKey: key,
  teamA: a.map(pl),
  teamB: b.map(pl),
});

const byName = (players: ReturnType<typeof computeNetworkScores>) =>
  new Map(players.map((p) => [p.username, p]));

describe('computeNetworkScores', () => {
  it('returns empty array for no matches', () => {
    expect(computeNetworkScores([])).toEqual([]);
  });

  it('K4 sanity graph: A > B = C > D (debate Q4a)', () => {
    // {A,B} beat {C,D} 21-5; {A,C} beat {B,D} 21-5 — complete graph, so
    // ordering collapses to own performance: A(2W) > B=C(1W1L) > D(2L).
    const players = computeNetworkScores([
      m(['A', 'B'], ['C', 'D'], 21, 5, 'k1', '2025-01-01T00:00:00Z'),
      m(['A', 'C'], ['B', 'D'], 21, 5, 'k2', '2025-01-02T00:00:00Z'),
    ]);
    expect(players.map((p) => p.username)).toEqual(['A', 'B', 'C', 'D']);
    const d = byName(players).get('D')!;
    expect(d.wins).toBe(0);
    expect(d.losses).toBe(2);
  });

  it('few-game players rank by own performance, not network volume', () => {
    // P_lose drops two matches to hub S1 (10-0, high rank → real network
    // inflow) while P_win beats two weak pairs. Both have 2 games so
    // λ_i≈0.11 — own performance dominates, and the 2-0 player must
    // outrank the 0-2 player even though P_lose holds the stronger
    // network position. Adaptive λ is what makes small samples honest.
    const hubFiller = Array.from({ length: 8 }, (_, i) =>
      m(['S1'], [`hf${i}`], 21, 5, `h${i}`, `2025-01-0${i + 1}T00:00:00Z`),
    );
    const players = computeNetworkScores([
      ...hubFiller,
      m(['S1', 'S2'], ['P_lose', 'Z1'], 21, 5, 'l1', '2025-01-10T00:00:00Z'),
      m(['S1', 'S2'], ['P_lose', 'Z2'], 21, 5, 'l2', '2025-01-11T00:00:00Z'),
      m(['P_win', 'Y1'], ['W1', 'W2'], 21, 5, 'w1', '2025-01-12T00:00:00Z'),
      m(['P_win', 'Y2'], ['W3', 'W4'], 21, 5, 'w2', '2025-01-13T00:00:00Z'),
    ]);
    const order = players.map((p) => p.username);
    const pLose = byName(players).get('P_lose')!;
    const pWin = byName(players).get('P_win')!;
    // P_lose drew the club's strongest player (S1, 10-0) — a genuinely
    // tougher schedule — yet at 2 games each λ_i≈0.11 makes own
    // performance dominant, so the 2-0 player still ranks higher.
    expect(pLose.matchesPlayed).toBe(pWin.matchesPlayed);
    expect(pWin.ownPerformance).toBeGreaterThan(pLose.ownPerformance);
    expect(order.indexOf('P_win')).toBeLessThan(order.indexOf('P_lose'));
  });

  it('identical records are differentiated by network position', () => {
    // P_s and P_w both go 1W1L — same record, different opponents/network —
    // so the network term must produce different scores (a pure W/L board
    // would tie them exactly).
    const players = computeNetworkScores([
      m(['S1', 'S2'], ['W1', 'W2'], 21, 5, 's1', '2025-01-01T00:00:00Z'),
      m(['S1', 'S2'], ['W3', 'W4'], 21, 5, 's2', '2025-01-02T00:00:00Z'),
      m(['P_s', 'Q1'], ['W5', 'W6'], 21, 5, 'p1', '2025-01-03T00:00:00Z'),
      m(['P_s'], ['S1'], 5, 21, 'p2', '2025-01-04T00:00:00Z'),
      m(['P_w', 'Q2'], ['W7', 'W8'], 21, 5, 'p3', '2025-01-05T00:00:00Z'),
      m(['P_w'], ['W9'], 5, 21, 'p4', '2025-01-06T00:00:00Z'),
    ]);
    const ps = byName(players).get('P_s')!;
    const pw = byName(players).get('P_w')!;
    expect(ps.wins).toBe(pw.wins);
    expect(ps.losses).toBe(pw.losses);
    expect(ps.networkScore).not.toBe(pw.networkScore);
  });

  it('margin-weighted opponent edges: blowout win earns more network credit than squeaker', () => {
    // Both win once vs the same opponent C — identical W-L, different
    // margin. Under the old symmetric graph their inflow from C would be
    // equal; directed edges give the blowout winner the larger share of
    // C's rank. networkFlow isolates the edge effect from p̃.
    const players = computeNetworkScores([
      m(['C'], ['P_big'], 3, 21, 'w1', '2025-01-01T00:00:00Z'),
      m(['C'], ['P_small'], 10, 12, 'w2', '2025-01-02T00:00:00Z'),
    ]);
    const big = byName(players).get('P_big')!;
    const small = byName(players).get('P_small')!;
    expect(big.wins).toBe(small.wins);
    expect(big.networkFlow).toBeGreaterThan(small.networkFlow);
    expect(big.rawScore).toBeGreaterThan(small.rawScore);
  });

  it('tie matches count as ties, build edges, and produce uniform scores', () => {
    const players = computeNetworkScores([
      m(['T1', 'T2'], ['T3', 'T4'], 10, 10, 'k1'),
    ]);
    expect(players).toHaveLength(4);
    for (const p of players) {
      expect(p.ties).toBe(1);
      expect(p.wins).toBe(0);
      expect(p.losses).toBe(0);
      expect(p.matchesPlayed).toBe(1);
      // Fully symmetric graph — indistinguishable players share the top score.
      expect(p.networkScore).toBe(100);
    }
  });

  it('skips matches with cross-team identity collisions (no phantom nodes)', () => {
    const guest = { firstName: 'John', lastName: 'Smith', name: 'John' };
    const collisionMatch: RankedMatchInput = {
      teamAScore: 21,
      teamBScore: 5,
      completedAt: '2025-01-01T00:00:00Z',
      matchKey: 'bad',
      teamA: [guest, pl('ok1')],
      teamB: [{ ...guest }, pl('ok2')],
    };
    const players = computeNetworkScores([
      collisionMatch,
      m(['ok1', 'ok3'], ['ok4', 'ok5'], 21, 5, 'good', '2025-01-02T00:00:00Z'),
    ]);
    expect(players).toHaveLength(4);
    expect(players.every((p) => !p.key.startsWith('guest:'))).toBe(true);
    expect(players.every((p) => Number.isFinite(p.rawScore))).toBe(true);
  });

  it('skips degenerate matches with an empty side', () => {
    const emptySide: RankedMatchInput = {
      teamAScore: 21,
      teamBScore: 5,
      completedAt: '2025-01-01T00:00:00Z',
      matchKey: 'empty',
      teamA: [pl('ghost1'), pl('ghost2')],
      teamB: [],
    };
    const players = computeNetworkScores([
      emptySide,
      m(['ok1'], ['ok2'], 21, 5, 'real', '2025-01-02T00:00:00Z'),
    ]);
    expect(players.map((p) => p.username).sort()).toEqual(['ok1', 'ok2']);
  });

  it('is deterministic regardless of input order', () => {
    const matches = [
      m(['A', 'B'], ['C', 'D'], 21, 5, 'k1', '2025-01-01T00:00:00Z'),
      m(['A', 'C'], ['B', 'D'], 21, 5, 'k2', '2025-01-02T00:00:00Z'),
      m(['E'], ['F'], 10, 21, 'k3', '2025-01-03T00:00:00Z'),
    ];
    const a = computeNetworkScores(matches);
    const b = computeNetworkScores([...matches].reverse());
    expect(b).toEqual(a);
  });

  it('keeps disconnected components comparable (both aces score 100)', () => {
    const players = computeNetworkScores([
      m(['A1'], ['W1'], 21, 5, 'a1', '2025-01-01T00:00:00Z'),
      m(['A1'], ['W2'], 21, 5, 'a2', '2025-01-02T00:00:00Z'),
      m(['A2'], ['X1'], 21, 5, 'b1', '2025-01-03T00:00:00Z'),
      m(['A2'], ['X2'], 21, 5, 'b2', '2025-01-04T00:00:00Z'),
    ]);
    const top2 = players.slice(0, 2).map((p) => p.username).sort();
    expect(top2).toEqual(['A1', 'A2']);
    expect(players[0].networkScore).toBe(100);
    expect(players[1].networkScore).toBe(100);
  });

  it('flags provisional players under the rating threshold', () => {
    const few = computeNetworkScores([
      m(['R1'], ['S1'], 21, 5, 'k1'),
      m(['R1'], ['S2'], 21, 5, 'k2'),
    ]);
    const r1 = byName(few).get('R1')!;
    expect(r1.provisional).toBe(true);
    expect(r1.gamesToReliable).toBe(10);

    const many = computeNetworkScores(
      Array.from({ length: 15 }, (_, i) =>
        m(['VETERAN'], [`F${i}`], 21, 5, `v${i}`, `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
      ),
    );
    const vet = byName(many).get('VETERAN')!;
    expect(vet.provisional).toBe(false);
    expect(vet.gamesToReliable).toBe(0);
  });

  it('rating-aware prior: career rating lifts the teleport component', () => {
    // K4 graph, identical matches — the only difference is the rating map.
    // A high replayed rating raises A's shrinkage pseudo-count q_i, so
    // A's prior (and rawScore) must exceed the no-rating baseline.
    const matches = [
      m(['A', 'B'], ['C', 'D'], 21, 5, 'k1', '2025-01-01T00:00:00Z'),
      m(['A', 'C'], ['B', 'D'], 21, 5, 'k2', '2025-01-02T00:00:00Z'),
    ];
    const base = computeNetworkScores(matches);
    const rated = computeNetworkScores(
      matches,
      new Map([
        ['A', 1800],
        ['B', 1450],
        ['C', 1450],
        ['D', 1450],
      ]),
    );
    const aBase = byName(base).get('A')!;
    const aRated = byName(rated).get('A')!;
    expect(aRated.ownPerformance).toBeGreaterThan(aBase.ownPerformance);
    expect(aRated.rawScore).toBeGreaterThan(aBase.rawScore);
  });

  it('partial rating coverage: unrated players keep the pure p̃ prior', () => {
    const matches = [
      m(['A', 'B'], ['C', 'D'], 21, 5, 'k1', '2025-01-01T00:00:00Z'),
      m(['A', 'C'], ['B', 'D'], 21, 5, 'k2', '2025-01-02T00:00:00Z'),
    ];
    const base = computeNetworkScores(matches);
    const partial = computeNetworkScores(matches, new Map([['A', 1800]]));
    const bBase = byName(base).get('B')!;
    const bPartial = byName(partial).get('B')!;
    // B has no rating → prior stays p̃ exactly, even though A's rating
    // shifted the club mean r̄ for everyone else.
    expect(bPartial.ownPerformance).toBe(bBase.ownPerformance);
  });

  it('rating-surprise edges: upset wins earn more network credit', () => {
    // A (low rated) beats B (high rated) — an upset. The loser→winner
    // edge B→A is boosted by (1+κ·û), so A's networkFlow must exceed the
    // same fixture with equal ratings.
    const fixture = (ra?: number, rb?: number) =>
      computeNetworkScores([
        {
          teamAScore: 21,
          teamBScore: 5,
          completedAt: '2025-01-01T00:00:00Z',
          matchKey: 'x',
          teamA: [
            { username: 'A', rating: ra },
            { username: 'T1' },
          ],
          teamB: [
            { username: 'B', rating: rb },
            { username: 'T2' },
          ],
        },
      ]);
    const upset = byName(fixture(1400, 1800)).get('A')!;
    const even = byName(fixture(1500, 1500)).get('A')!;
    expect(upset.networkFlow).toBeGreaterThan(even.networkFlow);
  });

  it('tie matches ignore rating surprise — stay fully symmetric', () => {
    const players = computeNetworkScores([
      {
        teamAScore: 10,
        teamBScore: 10,
        completedAt: '2025-01-01T00:00:00Z',
        matchKey: 'k1',
        teamA: [
          { username: 'T1', rating: 1800 },
          { username: 'T2', rating: 1400 },
        ],
        teamB: [
          { username: 'T3', rating: 1500 },
          { username: 'T4', rating: 1500 },
        ],
      },
    ]);
    expect(players).toHaveLength(4);
    for (const p of players) {
      expect(p.networkScore).toBe(100);
    }
  });

  it('satisfies the attribution invariant: raw = (1−λ_i)·own + networkFlow', () => {
    const players = computeNetworkScores([
      m(['A', 'B'], ['C', 'D'], 21, 5, 'k1', '2025-01-01T00:00:00Z'),
      m(['A', 'C'], ['B', 'D'], 21, 5, 'k2', '2025-01-02T00:00:00Z'),
      m(['E'], ['F'], 3, 21, 'k3', '2025-01-03T00:00:00Z'),
    ]);
    for (const p of players) {
      expect(p.ownPerformance).toBeGreaterThanOrEqual(0);
      expect(p.networkFlow).toBeGreaterThanOrEqual(0);
      const lam = (0.8 * p.matchesPlayed) / (p.matchesPlayed + 12);
      expect(p.rawScore).toBeCloseTo(
        (1 - lam) * p.ownPerformance + p.networkFlow,
        6,
      );
    }
  });
});
