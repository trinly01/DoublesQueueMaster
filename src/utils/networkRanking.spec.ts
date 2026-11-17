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

  it('network embeddedness outranks win-loss record (the core spec)', () => {
    // W5/W6 lose every match but are the SHARED opponents of four mid
    // players — a pure W/L board buries them; network position lifts them
    // above players with wins. This is what "not wins or losses" means.
    const players = computeNetworkScores([
      m(['A', 'B'], ['W1', 'W2'], 21, 5, 'a1', '2025-01-01T00:00:00Z'),
      m(['A', 'B'], ['W3', 'W4'], 21, 5, 'a2', '2025-01-02T00:00:00Z'),
      m(['A'], ['M1'], 21, 5, 'a3', '2025-01-03T00:00:00Z'),
      m(['B'], ['M2'], 21, 5, 'a4', '2025-01-04T00:00:00Z'),
      m(['M3', 'X1'], ['W5', 'W6'], 21, 5, 'm1', '2025-01-05T00:00:00Z'),
      m(['M4', 'X2'], ['W5', 'W6'], 21, 5, 'm2', '2025-01-06T00:00:00Z'),
      m(['M5', 'X3'], ['W7', 'W8'], 21, 5, 'm3', '2025-01-07T00:00:00Z'),
      m(['M5'], ['A'], 5, 21, 'm4', '2025-01-08T00:00:00Z'),
    ]);
    const order = players.map((p) => p.username);
    expect(order[0]).toBe('A'); // most-connected hub tops the board
    const w5 = byName(players).get('W5')!;
    const m3 = byName(players).get('M3')!;
    expect(w5.wins).toBe(0);
    expect(w5.losses).toBe(2);
    expect(m3.wins).toBe(1);
    expect(order.indexOf('W5')).toBeLessThan(order.indexOf('M3'));
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

  it('satisfies the attribution invariant: raw = (1−λ)·own + networkFlow', () => {
    const players = computeNetworkScores([
      m(['A', 'B'], ['C', 'D'], 21, 5, 'k1', '2025-01-01T00:00:00Z'),
      m(['A', 'C'], ['B', 'D'], 21, 5, 'k2', '2025-01-02T00:00:00Z'),
      m(['E'], ['F'], 3, 21, 'k3', '2025-01-03T00:00:00Z'),
    ]);
    for (const p of players) {
      expect(p.ownPerformance).toBeGreaterThanOrEqual(0);
      expect(p.networkFlow).toBeGreaterThanOrEqual(0);
      expect(p.rawScore).toBeCloseTo(0.2 * p.ownPerformance + p.networkFlow, 6);
    }
  });
});
