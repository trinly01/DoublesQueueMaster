import { describe, it, expect } from 'vitest';
import {
  RatingEngine,
  mergeAppState,
  gcTombstones,
  enforceOneMatchPerCourtOnState,
} from './matchmaking';
import type {
  Player,
  AppState,
  QueueEntry,
  ActiveMatch,
  CompletedMatch,
} from './matchmaking';

// Helper to build a minimal player for tests
const makePlayer = (rating: number, extra: Partial<Player> = {}): Player => ({
  username: `p${rating}`,
  level: 2,
  rating,
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  ...extra,
});

// Zero-sum invariant: total winner gain == total loser loss (unless floor clamps).
function assertZeroSum(
  winners: Player[],
  losers: Player[],
  result: { updatedWinners: Player[]; updatedLosers: Player[] },
  floorExpected = false,
) {
  const totalGain = result.updatedWinners.reduce(
    (s, p, i) => s + (p.rating - winners[i].rating),
    0,
  );
  const totalLoss = result.updatedLosers.reduce(
    (s, p, i) => s + (losers[i].rating - p.rating),
    0,
  );
  if (!floorExpected) {
    expect(totalGain).toBe(totalLoss);
  } else {
    expect(totalGain).toBeGreaterThanOrEqual(totalLoss);
  }
}

describe('RatingEngine.calculateShift', () => {
  it('winners gain and losers lose (zero-sum)', () => {
    const w = [makePlayer(1500), makePlayer(1500)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const r = RatingEngine.calculateShift(w, l, 11, 10);
    assertZeroSum(w, l, r);
    r.updatedWinners.forEach((p) => expect(p.rating).toBeGreaterThan(1500));
    r.updatedLosers.forEach((p) => expect(p.rating).toBeLessThan(1500));
  });

  it('blowout moves ratings more than a close game', () => {
    const w = [makePlayer(1500), makePlayer(1500)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const rClose = RatingEngine.calculateShift(w, l, 11, 10);
    const rBlowout = RatingEngine.calculateShift(w, l, 11, 0);
    const closeGain = rClose.updatedWinners[0].rating - 1500;
    const blowoutGain = rBlowout.updatedWinners[0].rating - 1500;
    expect(blowoutGain).toBeGreaterThan(closeGain);
  });

  it('big upset: underdogs gain large; favorites lose large (zero-sum)', () => {
    const w = [makePlayer(1000), makePlayer(1000)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const r = RatingEngine.calculateShift(w, l, 11, 9);
    assertZeroSum(w, l, r);
    expect(r.updatedWinners[0].rating).toBeGreaterThan(1000);
    expect(r.updatedWinners[1].rating).toBeGreaterThan(1000);
    expect(r.updatedLosers[0].rating).toBeLessThan(1500);
    expect(r.updatedLosers[1].rating).toBeLessThan(1500);
  });

  it('mixed team win: low-rated partner gets more credit than high-rated partner', () => {
    const w = [makePlayer(2000), makePlayer(1000)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const r = RatingEngine.calculateShift(w, l, 11, 9);
    assertZeroSum(w, l, r);
    const highRatedGain = r.updatedWinners[0].rating - 2000;
    const lowRatedGain = r.updatedWinners[1].rating - 1000;
    expect(lowRatedGain).toBeGreaterThan(highRatedGain);
  });

  it('mixed team loss: soft underdog means higher-rated partner pays more, but not much more', () => {
    const w = [makePlayer(1500), makePlayer(1500)];
    const l = [makePlayer(2000), makePlayer(1000)];
    const r = RatingEngine.calculateShift(w, l, 11, 9);
    assertZeroSum(w, l, r);
    const highRatedLoss = 2000 - r.updatedLosers[0].rating;
    const lowRatedLoss = 1000 - r.updatedLosers[1].rating;
    expect(highRatedLoss).toBeGreaterThan(lowRatedLoss);
    expect(Math.abs(highRatedLoss - lowRatedLoss)).toBeLessThanOrEqual(15);
    expect(highRatedLoss).toBeGreaterThan(0);
  });

  it('per-player swing: singles (K=24) equals doubles per-player (K=48 split by 2)', () => {
    const sW = [makePlayer(1500)];
    const sL = [makePlayer(1500)];
    const dW = [makePlayer(1500), makePlayer(1500)];
    const dL = [makePlayer(1500), makePlayer(1500)];

    const singles = RatingEngine.calculateShift(sW, sL, 11, 10);
    const doubles = RatingEngine.calculateShift(dW, dL, 11, 10);

    const sGain = singles.updatedWinners[0].rating - 1500;
    const dGain = doubles.updatedWinners[0].rating - 1500;
    // K_SINGLES=24 means the full singles pool is 24, divided by 2 players.
    // K_DOUBLES=48 means the doubles pool is 48, divided by 4 players.
    // Both formats yield ~12 points per player for an even close match.
    expect(Math.abs(sGain - dGain)).toBeLessThanOrEqual(2);
  });

  it('floor hit: rating clamps at 100, never negative', () => {
    const w = [makePlayer(150)];
    const l = [makePlayer(105)];
    const r = RatingEngine.calculateShift(w, l, 11, 0);
    assertZeroSum(w, l, r, true);
    expect(r.updatedLosers[0].rating).toBe(100);
    expect(r.updatedWinners[0].rating).toBeGreaterThan(150);
  });

  // --- Real-CSV regression cases ---

  it('CSV Match 6: Shirwin+James vs Peejay+Eddie 11-4', () => {
    const w = [
      makePlayer(1632, { username: 'Shirwin' }),
      makePlayer(1529, { username: 'James' }),
    ];
    const l = [
      makePlayer(1565, { username: 'Peejay' }),
      makePlayer(1548, { username: 'Eddie' }),
    ];
    const r = RatingEngine.calculateShift(w, l, 11, 4);
    // Underdog James gets more credit than favorite Shirwin.
    const jamesGain = r.updatedWinners[1].rating - 1529;
    const shirwinGain = r.updatedWinners[0].rating - 1632;
    expect(jamesGain).toBeGreaterThan(shirwinGain);
    expect(jamesGain).toBeGreaterThan(0);
    expect(shirwinGain).toBeGreaterThan(0);
    // Soft underdog losses: higher-rated Peejay pays slightly more.
    const peejayLoss = 1565 - r.updatedLosers[0].rating;
    const eddieLoss = 1548 - r.updatedLosers[1].rating;
    expect(peejayLoss).toBeGreaterThan(eddieLoss);
    expect(Math.abs(peejayLoss - eddieLoss)).toBeLessThanOrEqual(2);
  });

  it('CSV Match 18: Dimple+Luv vs Rommel+Abbey 11-1 upset', () => {
    const w = [
      makePlayer(1469, { username: 'Dimple' }),
      makePlayer(1486, { username: 'Luv' }),
    ];
    const l = [
      makePlayer(1514, { username: 'Rommel' }),
      makePlayer(1441, { username: 'Abbey' }),
    ];
    const r = RatingEngine.calculateShift(w, l, 11, 1);
    const rommelLoss = 1514 - r.updatedLosers[0].rating;
    const abbeyLoss = 1441 - r.updatedLosers[1].rating;
    // Soft underdog losses: higher-rated Rommel pays slightly more.
    expect(rommelLoss).toBeGreaterThan(abbeyLoss);
    expect(Math.abs(rommelLoss - abbeyLoss)).toBeLessThanOrEqual(2);
    expect(rommelLoss).toBeGreaterThan(0);
  });

  it('CSV Match 28: Peejay+Shirwin vs Jayson+Trin 11-2 upset', () => {
    const w = [
      makePlayer(1542, { username: 'Peejay' }),
      makePlayer(1567, { username: 'Shirwin' }),
    ];
    const l = [
      makePlayer(1400, { username: 'Jayson' }),
      makePlayer(1636, { username: 'Trin' }),
    ];
    const r = RatingEngine.calculateShift(w, l, 11, 2);
    const trinLoss = 1636 - r.updatedLosers[1].rating;
    const jaysonLoss = 1400 - r.updatedLosers[0].rating;
    // Soft underdog losses: higher-rated Trin pays more than Jayson.
    expect(trinLoss).toBeGreaterThan(jaysonLoss);
    expect(Math.abs(trinLoss - jaysonLoss)).toBeLessThanOrEqual(8);
    expect(trinLoss).toBeGreaterThan(0);
  });

  it('CSV Match 10: Jayson+Trin vs Henri+Celine 11-2', () => {
    const w = [
      makePlayer(1397, { username: 'Jayson' }),
      makePlayer(1630, { username: 'Trin' }),
    ];
    const l = [
      makePlayer(1421, { username: 'Henri' }),
      makePlayer(1555, { username: 'Celine' }),
    ];
    const r = RatingEngine.calculateShift(w, l, 11, 2);
    const jaysonGain = r.updatedWinners[0].rating - 1397;
    const trinGain = r.updatedWinners[1].rating - 1630;
    // Underdog Jayson gets more credit than favorite Trin.
    expect(jaysonGain).toBeGreaterThan(trinGain);
    expect(jaysonGain).toBeGreaterThan(10);
    expect(trinGain).toBeGreaterThan(0);
  });

  it('anti-carry: weak partner in huge gap pair gets less credit than before, but still more than strong partner', () => {
    const w = [makePlayer(2000), makePlayer(1000)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const r = RatingEngine.calculateShift(w, l, 11, 9);
    assertZeroSum(w, l, r);
    const strongGain = r.updatedWinners[0].rating - 2000;
    const weakGain = r.updatedWinners[1].rating - 1000;
    // Even with the gap penalty, the weak partner (who overperformed vs the
    // 1500 opponents) still earns more than the strong partner.
    expect(weakGain).toBeGreaterThan(strongGain);
    // Anti-carry: the gap penalty keeps the difference reasonable. With the
    // old pure underdog model the weak partner would have taken most of the pool.
    expect(weakGain - strongGain).toBeLessThan(10);
  });
});

// Minimal AppState builder for merge tests
const makeState = (overrides: Partial<AppState> = {}): AppState => ({
  teamSize: 2,
  players: {},
  queues: [],
  activeMatches: [],
  completedMatches: [],
  lastModified: 0,
  ...overrides,
});

const makeQueueEntry = (
  username: string,
  overrides: Partial<QueueEntry> = {},
): QueueEntry => ({
  username,
  queueType: 'GENERAL',
  enteredAt: 1000,
  createdAt: 1000,
  updatedAt: 1000,
  queuedAt: 1000,
  ...overrides,
});

const makeMatch = (
  matchId: string,
  teamA: string[] = ['alice'],
  teamB: string[] = ['bob'],
  overrides: Partial<ActiveMatch> = {},
): ActiveMatch => ({
  matchId,
  queueSource: 'GENERAL',
  teamA,
  teamB,
  expectedDifference: 0,
  status: 'in-progress',
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

const makeCompletedMatch = (
  matchId: string,
  overrides: Partial<CompletedMatch> = {},
): CompletedMatch => ({
  matchId,
  matchType: 'doubles',
  teamA: [],
  teamB: [],
  teamAScore: 11,
  teamBScore: 9,
  completedAt: 2000,
  updatedAt: 2000,
  ...overrides,
});

// Normalize a state for convergence comparisons: ignore tombstones and sort
// deterministic arrays so two equivalent states compare equal.
const normalize = (state: AppState) => {
  const players = Object.fromEntries(
    Object.entries(state.players).sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    ...state,
    players,
    queues: state.queues
      .filter((q) => !q.deletedAt)
      .sort((a, b) => {
        const byUser = a.username.localeCompare(b.username);
        if (byUser !== 0) return byUser;
        return a.queueType.localeCompare(b.queueType);
      }),
    activeMatches: state.activeMatches
      .filter((m) => !m.deletedAt)
      .sort((a, b) => a.matchId.localeCompare(b.matchId)),
    completedMatches: state.completedMatches
      .slice()
      .sort((a, b) => a.matchId.localeCompare(b.matchId)),
  };
};

const normalizedEqual = (a: AppState, b: AppState) => {
  const aa = normalize(a);
  const bb = normalize(b);
  return JSON.stringify(aa) === JSON.stringify(bb);
};

const assertInvariants = (state: AppState) => {
  const liveQueueUsers = new Set(
    state.queues.filter((q) => !q.deletedAt).map((q) => q.username),
  );
  const liveMatchUsers = new Set<string>();
  state.activeMatches
    .filter((m) => !m.deletedAt)
    .forEach((m) => {
      m.teamA.forEach((u) => liveMatchUsers.add(u));
      m.teamB.forEach((u) => liveMatchUsers.add(u));
    });

  // INV1: no player in both a live queue and a live match
  liveQueueUsers.forEach((u) => {
    expect(liveMatchUsers.has(u)).toBe(false);
  });

  // INV2: no player in more than one live match
  const userToMatchCount = new Map<string, number>();
  state.activeMatches
    .filter((m) => !m.deletedAt)
    .forEach((m) => {
      [...m.teamA, ...m.teamB].forEach((u) => {
        userToMatchCount.set(u, (userToMatchCount.get(u) || 0) + 1);
      });
    });
  userToMatchCount.forEach((count) => {
    expect(count).toBeLessThanOrEqual(1);
  });

  // INV3: no duplicate live queue entries per username
  const seenQueueUsers = new Set<string>();
  state.queues
    .filter((q) => !q.deletedAt)
    .forEach((q) => {
      expect(seenQueueUsers.has(q.username)).toBe(false);
      seenQueueUsers.add(q.username);
    });

  // INV4: a matchId in completedMatches must not also be live in activeMatches
  const completedIds = new Set(state.completedMatches.map((m) => m.matchId));
  state.activeMatches
    .filter((m) => !m.deletedAt)
    .forEach((m) => {
      expect(completedIds.has(m.matchId)).toBe(false);
    });
};

const mergeBothWays = (a: AppState, b: AppState) => {
  const ab = mergeAppState(a, b);
  const ba = mergeAppState(b, a);
  expect(normalizedEqual(ab, ba)).toBe(true);
  return ab;
};

describe('mergeAppState — queue deletion / resurrection', () => {
  it('a removed player (tombstone on server) does NOT resurrect from a stale live local copy', () => {
    // Server (admin A) removed the player: tombstone with newer deletedAt.
    const server = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice', createdAt: 500 }),
      },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 1000,
          deletedAt: 2000,
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    // Local (admin B, offline/stale) still has the old LIVE entry.
    const local = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice', createdAt: 500 }),
      },
      queues: [makeQueueEntry('alice', { queuedAt: 1000, updatedAt: 1000 })],
      lastModified: 1500,
    });

    const merged = mergeAppState(local, server);
    const liveAlice = merged.queues.filter(
      (q) => q.username === 'alice' && !q.deletedAt,
    );
    expect(liveAlice.length).toBe(0);
  });

  it('the deletion tombstone is RETAINED in the merged state so it propagates durably', () => {
    const server = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 1000,
          deletedAt: 2000,
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const local = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [makeQueueEntry('alice', { queuedAt: 1000, updatedAt: 1000 })],
      lastModified: 1500,
    });

    const merged = mergeAppState(local, server);
    const aliceTombstone = merged.queues.find(
      (q) => q.username === 'alice' && q.deletedAt,
    );
    expect(aliceTombstone).toBeDefined();
    expect(aliceTombstone?.deletedAt).toBe(2000);
  });

  it('an intentional re-queue (newer queuedAt) DOES override an older tombstone', () => {
    // Server still has the old tombstone.
    const server = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 1000,
          deletedAt: 2000,
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    // Local admin re-queued the player AFTER the deletion (newer queuedAt).
    const local = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 3000,
          createdAt: 3000,
          updatedAt: 3000,
        }),
      ],
      lastModified: 3000,
    });

    const merged = mergeAppState(local, server);
    const liveAlice = merged.queues.filter(
      (q) => q.username === 'alice' && !q.deletedAt,
    );
    expect(liveAlice.length).toBe(1);
    expect(liveAlice[0]?.queuedAt).toBe(3000);
  });

  it('a cancelled match (tombstone on server) does NOT resurrect from a stale live local copy', () => {
    const server = makeState({
      activeMatches: [
        {
          matchId: 'm1',
          queueSource: 'GENERAL',
          teamA: ['alice', 'bob'],
          teamB: ['carol', 'dave'],
          expectedDifference: 0,
          status: 'in-progress',
          createdAt: 1000,
          updatedAt: 2000,
          deletedAt: 2000,
        },
      ],
      lastModified: 2000,
    });
    const local = makeState({
      activeMatches: [
        {
          matchId: 'm1',
          queueSource: 'GENERAL',
          teamA: ['alice', 'bob'],
          teamB: ['carol', 'dave'],
          expectedDifference: 0,
          status: 'in-progress',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      lastModified: 1500,
    });

    const merged = mergeAppState(local, server);
    const liveM1 = merged.activeMatches.filter(
      (m) => m.matchId === 'm1' && !m.deletedAt,
    );
    expect(liveM1.length).toBe(0);
    const tombstoneM1 = merged.activeMatches.find(
      (m) => m.matchId === 'm1' && m.deletedAt,
    );
    expect(tombstoneM1).toBeDefined();
    expect(tombstoneM1?.deletedAt).toBe(2000);
  });

  it('a completed match does not resurrect from stale admin because completedMatches guard re-tombstones it', () => {
    const server = makeState({
      activeMatches: [
        {
          matchId: 'm1',
          queueSource: 'GENERAL',
          teamA: ['alice', 'bob'],
          teamB: ['carol', 'dave'],
          expectedDifference: 0,
          status: 'in-progress',
          createdAt: 1000,
          updatedAt: 2000,
          deletedAt: 2000,
        },
      ],
      completedMatches: [
        {
          matchId: 'm1',
          matchType: 'doubles',
          teamA: [{ username: 'alice' }, { username: 'bob' }],
          teamB: [{ username: 'carol' }, { username: 'dave' }],
          teamAScore: 11,
          teamBScore: 9,
          completedAt: 2000,
          updatedAt: 2000,
        },
      ],
      lastModified: 2000,
    });
    const local = makeState({
      activeMatches: [
        {
          matchId: 'm1',
          queueSource: 'GENERAL',
          teamA: ['alice', 'bob'],
          teamB: ['carol', 'dave'],
          expectedDifference: 0,
          status: 'in-progress',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      lastModified: 1500,
    });

    const merged = mergeAppState(local, server);
    const liveM1 = merged.activeMatches.filter(
      (m) => m.matchId === 'm1' && !m.deletedAt,
    );
    expect(liveM1.length).toBe(0);
    expect(merged.completedMatches.length).toBe(1);
  });

  it('a cancelled match tombstone does NOT pull players out of the queue', () => {
    const server = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice' }),
      },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 3000,
          createdAt: 3000,
          updatedAt: 3000,
        }),
      ],
      activeMatches: [
        {
          matchId: 'm1',
          queueSource: 'GENERAL',
          teamA: ['alice'],
          teamB: ['bob'],
          expectedDifference: 0,
          status: 'in-progress',
          createdAt: 1000,
          updatedAt: 2000,
          deletedAt: 2000,
        },
      ],
      lastModified: 2000,
    });
    const local = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice' }),
        bob: makePlayer(1500, { username: 'bob' }),
      },
      activeMatches: [
        {
          matchId: 'm1',
          queueSource: 'GENERAL',
          teamA: ['alice'],
          teamB: ['bob'],
          expectedDifference: 0,
          status: 'in-progress',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      lastModified: 1500,
    });

    const merged = mergeAppState(local, server);
    const aliceInQueue = merged.queues.some(
      (q) => q.username === 'alice' && !q.deletedAt,
    );
    expect(aliceInQueue).toBe(true);
  });
});

describe('mergeAppState — queue consistency', () => {
  it('concurrent add of same user in different queueTypes yields one live entry', () => {
    const a = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', { queueType: 'GENERAL', queuedAt: 1000 }),
      ],
      lastModified: 1000,
    });
    const b = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', { queueType: 'WINNERS', queuedAt: 2000 }),
      ],
      lastModified: 2000,
    });
    const merged = mergeAppState(a, b);
    const live = merged.queues.filter((q) => !q.deletedAt);
    expect(live.length).toBe(1);
    expect(live[0]?.queueType).toBe('WINNERS');
    assertInvariants(merged);
  });

  it('add-then-remove across admins: later removal wins', () => {
    const a = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [makeQueueEntry('alice', { queuedAt: 1000 })],
      lastModified: 1000,
    });
    const b = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 1000,
          deletedAt: 2000,
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.queues.some((q) => !q.deletedAt)).toBe(false);
    assertInvariants(merged);
  });

  it('remove-then-add across admins: later add wins', () => {
    const a = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 1000,
          deletedAt: 2000,
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const b = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 3000,
          createdAt: 3000,
          updatedAt: 3000,
        }),
      ],
      lastModified: 3000,
    });
    const merged = mergeAppState(a, b);
    const live = merged.queues.filter((q) => !q.deletedAt);
    expect(live.length).toBe(1);
    expect(live[0]?.queuedAt).toBe(3000);
    assertInvariants(merged);
  });

  it('clock-skew guard: stale live entry with high updatedAt but old queuedAt does not beat newer tombstone', () => {
    const a = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 1000,
          deletedAt: 2000,
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const b = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 1000,
          // Simulated wrong clock: updatedAt is later than tombstone, but queuedAt is older
          updatedAt: 5000,
        }),
      ],
      lastModified: 5000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.queues.some((q) => !q.deletedAt)).toBe(false);
    assertInvariants(merged);
  });

  it('enteredAt=0 sentinel (fairness_first) is not purged by checkpoint logic', () => {
    const a = makeState({
      queuesResetAt: 500,
      queues: [
        makeQueueEntry('alice', {
          enteredAt: 0,
          createdAt: 1000,
          updatedAt: 1000,
          queuedAt: 1000,
        }),
      ],
      lastModified: 1000,
    });
    const b = makeState({
      queuesResetAt: 500,
      queues: [],
      lastModified: 1000,
    });
    const merged = mergeAppState(a, b);
    expect(
      merged.queues.some((q) => q.username === 'alice' && !q.deletedAt),
    ).toBe(true);
    assertInvariants(merged);
  });

  it('clear-queue tombstones propagate and stale live entries do not resurrect', () => {
    const a = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 1000,
          deletedAt: 2000,
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const b = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [makeQueueEntry('alice', { queuedAt: 1000 })],
      lastModified: 1000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.queues.some((q) => !q.deletedAt)).toBe(false);
    assertInvariants(merged);
  });

  it('queue XOR match: a player placed in a match on B is removed from queue on A', () => {
    const a = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice' }),
        bob: makePlayer(1500, { username: 'bob' }),
      },
      queues: [
        makeQueueEntry('alice', { queuedAt: 1000 }),
        makeQueueEntry('bob', { queuedAt: 1000 }),
      ],
      activeMatches: [],
      lastModified: 1000,
    });
    const b = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice' }),
        bob: makePlayer(1500, { username: 'bob' }),
      },
      queues: [],
      activeMatches: [
        makeMatch('m1', ['alice'], ['bob'], {
          createdAt: 2000,
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.queues.some((q) => !q.deletedAt)).toBe(false);
    expect(merged.activeMatches.filter((m) => !m.deletedAt).length).toBe(1);
    assertInvariants(merged);
  });
});

describe('mergeAppState — match consistency', () => {
  it('concurrent distinct matches with disjoint players both survive', () => {
    const a = makeState({
      activeMatches: [
        makeMatch('m1', ['alice', 'bob'], ['carol', 'dave'], {
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const b = makeState({
      activeMatches: [
        makeMatch('m2', ['eddy', 'fred'], ['gina', 'hank'], {
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.activeMatches.filter((m) => !m.deletedAt).length).toBe(2);
    assertInvariants(merged);
  });

  it('same player in two concurrent matches keeps only one; other players return to queue', () => {
    const a = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice' }),
        bob: makePlayer(1500, { username: 'bob' }),
        carol: makePlayer(1500, { username: 'carol' }),
      },
      activeMatches: [makeMatch('m1', ['alice'], ['bob'], { updatedAt: 2000 })],
      lastModified: 2000,
    });
    const b = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice' }),
        carol: makePlayer(1500, { username: 'carol' }),
      },
      activeMatches: [
        makeMatch('m2', ['alice'], ['carol'], { updatedAt: 3000 }),
      ],
      lastModified: 3000,
    });
    const merged = mergeAppState(a, b);
    const live = merged.activeMatches.filter((m) => !m.deletedAt);
    expect(live.length).toBe(1);
    expect(live[0]?.matchId).toBe('m2');
    expect(
      merged.queues.some((q) => q.username === 'bob' && !q.deletedAt),
    ).toBe(true);
    assertInvariants(merged);
  });

  it('completed match on server wins over in-progress stale copy; ratings are not re-applied', () => {
    const a = makeState({
      activeMatches: [
        makeMatch('m1', ['alice'], ['bob'], {
          updatedAt: 2000,
          deletedAt: 2000,
        }),
      ],
      completedMatches: [
        makeCompletedMatch('m1', {
          teamA: [{ username: 'alice' }],
          teamB: [{ username: 'bob' }],
        }),
      ],
      lastModified: 2000,
    });
    const b = makeState({
      activeMatches: [makeMatch('m1', ['alice'], ['bob'], { updatedAt: 1000 })],
      completedMatches: [],
      lastModified: 1000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.activeMatches.filter((m) => !m.deletedAt).length).toBe(0);
    expect(merged.completedMatches.length).toBe(1);
    assertInvariants(merged);
  });

  it('match created offline on A + different match completed on B both survive', () => {
    const a = makeState({
      activeMatches: [makeMatch('m1', ['alice'], ['bob'], { updatedAt: 2000 })],
      completedMatches: [],
      lastModified: 2000,
    });
    const b = makeState({
      activeMatches: [
        makeMatch('m2', ['carol'], ['dave'], {
          updatedAt: 3000,
          deletedAt: 3000,
        }),
      ],
      completedMatches: [
        makeCompletedMatch('m2', {
          teamA: [{ username: 'carol' }],
          teamB: [{ username: 'dave' }],
        }),
      ],
      lastModified: 3000,
    });
    const merged = mergeAppState(a, b);
    const liveMatches = merged.activeMatches.filter((m) => !m.deletedAt);
    expect(
      liveMatches.map((m) => ({ id: m.matchId, deleted: m.deletedAt })),
    ).toEqual([{ id: 'm1', deleted: undefined }]);
    const m2Tombstone = merged.activeMatches.find((m) => m.matchId === 'm2');
    expect(m2Tombstone?.deletedAt).toBe(3000);
    expect(merged.completedMatches.length).toBe(1);
    assertInvariants(merged);
  });

  it('match reset checkpoint purges old matches; tombstoned-after-reset survives', () => {
    const a = makeState({
      matchesResetAt: 500,
      activeMatches: [
        makeMatch('m1', ['alice'], ['bob'], { createdAt: 100, updatedAt: 100 }),
      ],
      lastModified: 1000,
    });
    const b = makeState({
      matchesResetAt: 500,
      activeMatches: [
        makeMatch('m2', ['alice'], ['bob'], {
          createdAt: 1000,
          updatedAt: 1000,
        }),
      ],
      lastModified: 1000,
    });
    const merged = mergeAppState(a, b);
    const live = merged.activeMatches.filter((m) => !m.deletedAt);
    expect(live.length).toBe(1);
    expect(live[0]?.matchId).toBe('m2');
    assertInvariants(merged);
  });
});

describe('mergeAppState — player consistency', () => {
  it('player delete vs edit: later deletion wins, but fresher stats are overlaid', () => {
    const a = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          matchesPlayed: 5,
          wins: 3,
          losses: 2,
          statsUpdatedAt: 1000,
          updatedAt: 2000,
          deletedAt: 2000,
        }),
      },
      lastModified: 2000,
    });
    const b = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          matchesPlayed: 6,
          wins: 4,
          losses: 2,
          statsUpdatedAt: 3000,
          updatedAt: 1000,
          addedAt: 1000,
        }),
      },
      lastModified: 1000,
    });
    const merged = mergeAppState(a, b);
    const alice = merged.players.alice;
    expect(alice?.deletedAt).toBe(2000);
    expect(alice?.matchesPlayed).toBe(6);
    expect(alice?.wins).toBe(4);
  });

  it('player delete propagates over a stale live copy with high updatedAt', () => {
    // Server tombstones the player. A stale offline admin holds a live copy whose
    // updatedAt got bumped by an unrelated edit. The deletion must still win.
    const local = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          matchesPlayed: 6,
          wins: 4,
          losses: 2,
          statsUpdatedAt: 3000,
          updatedAt: 5000,
          addedAt: 1000,
        }),
      },
      lastModified: 5000,
    });
    const server = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          matchesPlayed: 5,
          wins: 3,
          losses: 2,
          updatedAt: 1000,
          addedAt: 1000,
          deletedAt: 2000,
        }),
      },
      lastModified: 2000,
    });
    const merged = mergeAppState(local, server);
    expect(merged.players.alice?.deletedAt).toBe(2000);
    // Fresher stats from the local live copy should still be overlaid.
    expect(merged.players.alice?.matchesPlayed).toBe(6);
    expect(merged.players.alice?.wins).toBe(4);
  });

  it('player re-add after deletion beats a stale tombstone', () => {
    // Server still has the old tombstone, but local re-added the player, so
    // addedAt is newer than deletedAt. Live copy should win.
    const local = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          matchesPlayed: 6,
          wins: 4,
          losses: 2,
          updatedAt: 3000,
          addedAt: 3000,
        }),
      },
      lastModified: 3000,
    });
    const server = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          matchesPlayed: 5,
          wins: 3,
          losses: 2,
          updatedAt: 1000,
          addedAt: 1000,
          deletedAt: 2000,
        }),
      },
      lastModified: 2000,
    });
    const merged = mergeAppState(local, server);
    expect(merged.players.alice?.deletedAt).toBeUndefined();
    expect(merged.players.alice?.matchesPlayed).toBe(6);
  });

  it('player re-add with old addedAt still loses to a newer deletion', () => {
    const local = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          updatedAt: 3000,
          addedAt: 1000,
        }),
      },
      lastModified: 3000,
    });
    const server = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          updatedAt: 1000,
          addedAt: 1000,
          deletedAt: 2000,
        }),
      },
      lastModified: 2000,
    });
    const merged = mergeAppState(local, server);
    expect(merged.players.alice?.deletedAt).toBe(2000);
  });

  it('concurrent rating change: higher ratingUpdatedAt wins', () => {
    const a = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          rating: 1550,
          ratingUpdatedAt: 2000,
          updatedAt: 2000,
        }),
      },
      lastModified: 2000,
    });
    const b = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          rating: 1520,
          ratingUpdatedAt: 1000,
          updatedAt: 2000,
        }),
      },
      lastModified: 2000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.players.alice?.rating).toBe(1550);
  });

  it('concurrent stats change: higher statsUpdatedAt wins', () => {
    const a = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          matchesPlayed: 5,
          wins: 3,
          statsUpdatedAt: 2000,
          updatedAt: 2000,
        }),
      },
      lastModified: 2000,
    });
    const b = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          matchesPlayed: 10,
          wins: 8,
          statsUpdatedAt: 3000,
          updatedAt: 1000,
        }),
      },
      lastModified: 1000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.players.alice?.matchesPlayed).toBe(10);
    expect(merged.players.alice?.wins).toBe(8);
  });

  it('per-field independence: avatar edit does not clobber fresher stats', () => {
    const a = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          avatar: 'avatar1.png',
          updatedAt: 3000,
          statsUpdatedAt: 1000,
          matchesPlayed: 1,
        }),
      },
      lastModified: 3000,
    });
    const b = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          avatar: 'avatar2.png',
          updatedAt: 1000,
          statsUpdatedAt: 2000,
          matchesPlayed: 5,
        }),
      },
      lastModified: 1000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.players.alice?.avatar).toBe('avatar1.png');
    expect(merged.players.alice?.matchesPlayed).toBe(5);
  });

  it('player reset checkpoint purges old players; tombstoned/statted-after-reset survive', () => {
    const a = makeState({
      playersResetAt: 500,
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          createdAt: 100,
          updatedAt: 100,
        }),
      },
      lastModified: 1000,
    });
    const b = makeState({
      playersResetAt: 500,
      players: {
        bob: makePlayer(1500, {
          username: 'bob',
          createdAt: 1000,
          updatedAt: 1000,
        }),
        carol: makePlayer(1500, {
          username: 'carol',
          createdAt: 100,
          updatedAt: 100,
          statsUpdatedAt: 1000,
        }),
      },
      lastModified: 1000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.players.alice).toBeUndefined();
    expect(merged.players.bob).toBeDefined();
    expect(merged.players.carol).toBeDefined();
  });
});

describe('mergeAppState — reset / checkpoint consistency', () => {
  it('local full reset (newer empty state) overwrites server', () => {
    const local = makeState({
      lastModified: 3000,
    });
    const server = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [makeQueueEntry('alice')],
      activeMatches: [makeMatch('m1')],
      lastModified: 2000,
    });
    const merged = mergeAppState(local, server);
    expect(Object.keys(merged.players).length).toBe(0);
    expect(merged.queues.length).toBe(0);
    expect(merged.activeMatches.length).toBe(0);
  });

  it('remote full reset (newer empty server) is adopted', () => {
    const local = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [makeQueueEntry('alice')],
      activeMatches: [makeMatch('m1')],
      lastModified: 2000,
    });
    const server = makeState({
      lastModified: 3000,
    });
    const merged = mergeAppState(local, server);
    expect(Object.keys(merged.players).length).toBe(0);
    expect(merged.queues.length).toBe(0);
    expect(merged.activeMatches.length).toBe(0);
  });

  it('partial session reset via checkpoints carries across admins', () => {
    const a = makeState({
      queuesResetAt: 1500,
      matchesResetAt: 1500,
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [makeQueueEntry('alice')],
      activeMatches: [makeMatch('m1')],
      lastModified: 1000,
    });
    const b = makeState({
      queuesResetAt: 1500,
      matchesResetAt: 1500,
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [],
      activeMatches: [],
      lastModified: 3000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.players.alice).toBeDefined();
    expect(merged.queues.length).toBe(0);
    expect(merged.activeMatches.length).toBe(0);
    expect(merged.queuesResetAt).toBe(1500);
    expect(merged.matchesResetAt).toBe(1500);
  });

  it('pre-reset stale offline data is purged; post-reset data survives', () => {
    const a = makeState({
      queuesResetAt: 2000,
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 3000,
          createdAt: 3000,
          updatedAt: 3000,
        }),
      ],
      lastModified: 3000,
    });
    const b = makeState({
      queuesResetAt: 2000,
      queues: [
        makeQueueEntry('bob', {
          queuedAt: 1500,
          createdAt: 1500,
          updatedAt: 1500,
        }),
      ],
      lastModified: 1500,
    });
    const merged = mergeAppState(a, b);
    const live = merged.queues.filter((q) => !q.deletedAt);
    expect(live.length).toBe(1);
    expect(live[0]?.username).toBe('alice');
  });

  it('completedMatches epoch reset drops old completed matches', () => {
    const a = makeState({
      completedMatchesResetAt: 2000,
      completedMatches: [
        makeCompletedMatch('old', { completedAt: 1000, updatedAt: 1000 }),
        makeCompletedMatch('new', { completedAt: 3000, updatedAt: 3000 }),
      ],
      lastModified: 3000,
    });
    const b = makeState({
      completedMatchesResetAt: 2000,
      completedMatches: [],
      lastModified: 1000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.completedMatches.length).toBe(1);
    expect(merged.completedMatches[0]?.matchId).toBe('new');
  });
});

describe('mergeAppState — convergence & multi-admin healing', () => {
  it('merging is order-independent for disjoint edits (commutative on normalized live state)', () => {
    const a = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [makeQueueEntry('alice', { queuedAt: 1000 })],
      activeMatches: [makeMatch('m1', ['alice'], ['bob'], { updatedAt: 1000 })],
      lastModified: 1000,
    });
    const b = makeState({
      players: { carol: makePlayer(1500, { username: 'carol' }) },
      queues: [makeQueueEntry('carol', { queuedAt: 2000 })],
      activeMatches: [
        makeMatch('m2', ['carol'], ['dave'], { updatedAt: 2000 }),
      ],
      lastModified: 2000,
    });
    mergeBothWays(a, b);
  });

  it('merging is idempotent: re-merging the same state reaches a fixed point', () => {
    const a = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 1000,
          deletedAt: 2000,
          updatedAt: 2000,
        }),
      ],
      activeMatches: [makeMatch('m1', ['alice'], ['bob'], { updatedAt: 1000 })],
      lastModified: 2000,
    });
    const b = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 3000,
          createdAt: 3000,
          updatedAt: 3000,
        }),
      ],
      activeMatches: [
        makeMatch('m1', ['alice'], ['bob'], {
          updatedAt: 2000,
          deletedAt: 2000,
        }),
      ],
      completedMatches: [
        makeCompletedMatch('m1', {
          teamA: [{ username: 'alice' }],
          teamB: [{ username: 'bob' }],
        }),
      ],
      lastModified: 3000,
    });
    const first = mergeAppState(a, b);
    const second = mergeAppState(first, b);
    expect(normalizedEqual(first, second)).toBe(true);
    assertInvariants(first);
    assertInvariants(second);
  });

  it('three-admin offline divergence converges after pairwise exchanges', () => {
    // Baseline: alice and bob are in the queue, no matches.
    const base = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice' }),
        bob: makePlayer(1500, { username: 'bob' }),
        carol: makePlayer(1500, { username: 'carol' }),
        dave: makePlayer(1500, { username: 'dave' }),
      },
      queues: [
        makeQueueEntry('alice', { queuedAt: 1000 }),
        makeQueueEntry('bob', { queuedAt: 1000 }),
        makeQueueEntry('carol', { queuedAt: 1000 }),
        makeQueueEntry('dave', { queuedAt: 1000 }),
      ],
      lastModified: 1000,
    });

    // Admin A removes alice and drafts m1 (alice+bob vs carol+dave)
    const a = mergeAppState(
      base,
      makeState({
        ...base,
        queues: [
          makeQueueEntry('alice', {
            queuedAt: 1000,
            deletedAt: 2000,
            updatedAt: 2000,
          }),
          makeQueueEntry('bob', {
            queuedAt: 1000,
            deletedAt: 2000,
            updatedAt: 2000,
          }),
          makeQueueEntry('carol', {
            queuedAt: 1000,
            deletedAt: 2000,
            updatedAt: 2000,
          }),
          makeQueueEntry('dave', {
            queuedAt: 1000,
            deletedAt: 2000,
            updatedAt: 2000,
          }),
        ],
        activeMatches: [
          makeMatch('m1', ['alice', 'bob'], ['carol', 'dave'], {
            updatedAt: 2000,
          }),
        ],
        lastModified: 2000,
      }),
    );

    // Admin B (offline) kept the queue and also drafted a different match
    const b = mergeAppState(
      base,
      makeState({
        ...base,
        queues: [
          makeQueueEntry('alice', {
            queuedAt: 1000,
            deletedAt: 2500,
            updatedAt: 2500,
          }),
          makeQueueEntry('bob', {
            queuedAt: 1000,
            deletedAt: 2500,
            updatedAt: 2500,
          }),
          makeQueueEntry('carol', {
            queuedAt: 1000,
            deletedAt: 2500,
            updatedAt: 2500,
          }),
          makeQueueEntry('dave', {
            queuedAt: 1000,
            deletedAt: 2500,
            updatedAt: 2500,
          }),
        ],
        activeMatches: [
          makeMatch('m2', ['alice', 'carol'], ['bob', 'dave'], {
            updatedAt: 2500,
          }),
        ],
        lastModified: 2500,
      }),
    );

    // Admin C (offline) did nothing; just holds base.
    const c = structuredClone(base) as AppState;

    // Simulate a sequence of pairwise syncs: A↔B, B↔C, A↔C
    let aState = mergeAppState(a, b);
    let bState = mergeAppState(b, aState);
    const cState = mergeAppState(c, bState);
    aState = mergeAppState(aState, cState);
    bState = mergeAppState(bState, cState);

    // After all exchanges, normalized live states should be identical.
    expect(normalizedEqual(aState, bState)).toBe(true);
    expect(normalizedEqual(bState, cState)).toBe(true);
    assertInvariants(aState);
    assertInvariants(bState);
    assertInvariants(cState);
  });

  it('full lifecycle split across two admins converges and satisfies invariants', () => {
    // Admin A: alice and bob queued, then a match is drafted.
    const a = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice' }),
        bob: makePlayer(1500, { username: 'bob' }),
      },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 1000,
          deletedAt: 2000,
          updatedAt: 2000,
        }),
        makeQueueEntry('bob', {
          queuedAt: 1000,
          deletedAt: 2000,
          updatedAt: 2000,
        }),
      ],
      activeMatches: [makeMatch('m1', ['alice'], ['bob'], { updatedAt: 2000 })],
      lastModified: 2000,
    });

    // Admin B (offline/stale): still has alice and bob in queue, no match.
    const b = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice' }),
        bob: makePlayer(1500, { username: 'bob' }),
      },
      queues: [
        makeQueueEntry('alice', { queuedAt: 1000 }),
        makeQueueEntry('bob', { queuedAt: 1000 }),
      ],
      activeMatches: [],
      lastModified: 1000,
    });

    // A and B sync: match wins, queue entries removed.
    const afterSync = mergeAppState(a, b);
    expect(afterSync.activeMatches.filter((m) => !m.deletedAt).length).toBe(1);
    expect(afterSync.queues.filter((q) => !q.deletedAt).length).toBe(0);
    assertInvariants(afterSync);

    // Now B completes the match offline (tombstones active + creates completedMatch).
    const bCompleted = mergeAppState(
      afterSync,
      makeState({
        ...afterSync,
        activeMatches: [
          makeMatch('m1', ['alice'], ['bob'], {
            updatedAt: 3000,
            deletedAt: 3000,
          }),
        ],
        completedMatches: [
          makeCompletedMatch('m1', {
            teamA: [{ username: 'alice' }],
            teamB: [{ username: 'bob' }],
          }),
        ],
        lastModified: 3000,
      }),
    );
    expect(bCompleted.activeMatches.filter((m) => !m.deletedAt).length).toBe(0);
    expect(bCompleted.completedMatches.length).toBe(1);
    assertInvariants(bCompleted);

    // A comes back online with stale active match; B's completed wins and re-tombstones.
    const final = mergeAppState(a, bCompleted);
    expect(final.activeMatches.filter((m) => !m.deletedAt).length).toBe(0);
    expect(final.completedMatches.length).toBe(1);
    assertInvariants(final);
  });

  it('repeated re-merges do not oscillate between tombstone and live (stability)', () => {
    const a = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 1000,
          deletedAt: 2000,
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const b = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [makeQueueEntry('alice', { queuedAt: 1000 })],
      lastModified: 1000,
    });
    let current = mergeAppState(a, b);
    for (let i = 0; i < 5; i++) {
      current = mergeAppState(current, a);
    }
    expect(
      current.queues.some((q) => q.username === 'alice' && !q.deletedAt),
    ).toBe(false);
    expect(
      current.queues.some(
        (q) => q.username === 'alice' && q.deletedAt === 2000,
      ),
    ).toBe(true);
  });
});

describe('mergeAppState — merge algebra', () => {
  it('merging is associative: merge(merge(a,b),c) equals merge(a,merge(b,c))', () => {
    const a = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice', updatedAt: 1000 }),
      },
      queues: [makeQueueEntry('alice', { queuedAt: 1000 })],
      activeMatches: [makeMatch('m1', ['alice'], ['bob'], { updatedAt: 1000 })],
      lastModified: 1000,
    });
    const b = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          matchesPlayed: 3,
          statsUpdatedAt: 2000,
          updatedAt: 1000,
        }),
      },
      queues: [makeQueueEntry('alice', { queuedAt: 2000, updatedAt: 2000 })],
      activeMatches: [
        makeMatch('m2', ['carol'], ['dave'], { updatedAt: 2000 }),
      ],
      lastModified: 2000,
    });
    const c = makeState({
      players: {
        bob: makePlayer(1500, { username: 'bob', updatedAt: 3000 }),
      },
      queues: [makeQueueEntry('bob', { queuedAt: 3000, updatedAt: 3000 })],
      activeMatches: [makeMatch('m3', ['eddy'], ['fred'], { updatedAt: 3000 })],
      lastModified: 3000,
    });
    const ab = mergeAppState(a, b);
    const abC = mergeAppState(ab, c);
    const bc = mergeAppState(b, c);
    const aBc = mergeAppState(a, bc);
    expect(normalizedEqual(abC, aBc)).toBe(true);
    assertInvariants(abC);
    assertInvariants(aBc);
  });

  it('double-completion of same match keeps one completed record and does not double-apply stats', () => {
    const a = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          matchesPlayed: 5,
          wins: 3,
          losses: 2,
          statsUpdatedAt: 2000,
          updatedAt: 2000,
        }),
        bob: makePlayer(1500, {
          username: 'bob',
          matchesPlayed: 5,
          wins: 2,
          losses: 3,
          statsUpdatedAt: 2000,
          updatedAt: 2000,
        }),
      },
      activeMatches: [
        makeMatch('m1', ['alice'], ['bob'], {
          updatedAt: 2000,
          deletedAt: 2000,
        }),
      ],
      completedMatches: [
        makeCompletedMatch('m1', {
          teamA: [{ username: 'alice' }],
          teamB: [{ username: 'bob' }],
          teamAScore: 11,
          teamBScore: 9,
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const b = makeState({
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          matchesPlayed: 5,
          wins: 3,
          losses: 2,
          statsUpdatedAt: 3000,
          updatedAt: 3000,
        }),
        bob: makePlayer(1500, {
          username: 'bob',
          matchesPlayed: 5,
          wins: 2,
          losses: 3,
          statsUpdatedAt: 3000,
          updatedAt: 3000,
        }),
      },
      activeMatches: [
        makeMatch('m1', ['alice'], ['bob'], {
          updatedAt: 3000,
          deletedAt: 3000,
        }),
      ],
      completedMatches: [
        makeCompletedMatch('m1', {
          teamA: [{ username: 'alice' }],
          teamB: [{ username: 'bob' }],
          teamAScore: 11,
          teamBScore: 7,
          updatedAt: 3000,
        }),
      ],
      lastModified: 3000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.activeMatches.filter((m) => !m.deletedAt).length).toBe(0);
    expect(merged.completedMatches.length).toBe(1);
    // Higher updatedAt completed record wins.
    expect(merged.completedMatches[0]?.teamBScore).toBe(7);
    // Stats must be taken from the higher statsUpdatedAt side (b), not summed.
    expect(merged.players.alice?.matchesPlayed).toBe(5);
    expect(merged.players.alice?.statsUpdatedAt).toBe(3000);
    assertInvariants(merged);
  });

  it('match tombstone beats stale live copy even with high updatedAt clock skew', () => {
    const a = makeState({
      activeMatches: [
        makeMatch('m1', ['alice'], ['bob'], {
          updatedAt: 2000,
          deletedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const b = makeState({
      activeMatches: [makeMatch('m1', ['alice'], ['bob'], { updatedAt: 5000 })],
      lastModified: 5000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.activeMatches.filter((m) => !m.deletedAt).length).toBe(0);
    const tombstone = merged.activeMatches.find(
      (m) => m.matchId === 'm1' && m.deletedAt,
    );
    expect(tombstone).toBeDefined();
    expect(tombstone?.deletedAt).toBe(2000);
    assertInvariants(merged);
  });

  it('live-vs-live same match uses updatedAt LWW (documented limitation)', () => {
    const a = makeState({
      activeMatches: [
        makeMatch('m1', ['alice'], ['bob'], {
          court: 1,
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const b = makeState({
      activeMatches: [
        makeMatch('m1', ['alice'], ['bob'], {
          court: 2,
          updatedAt: 3000,
        }),
      ],
      lastModified: 3000,
    });
    const merged = mergeAppState(a, b);
    const live = merged.activeMatches.find((m) => !m.deletedAt);
    expect(live?.court).toBe(2);
    assertInvariants(merged);
  });
});

describe('mergeAppState — button actions x offline multi-admin', () => {
  it('Clear Matches: tombstones are retained and no stale live match resurrects', () => {
    const cleared = makeState({
      activeMatches: [
        makeMatch('m1', ['alice'], ['bob'], {
          updatedAt: 2000,
          deletedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const stale = makeState({
      activeMatches: [makeMatch('m1', ['alice'], ['bob'], { updatedAt: 1000 })],
      lastModified: 1000,
    });
    const merged = mergeAppState(cleared, stale);
    expect(merged.activeMatches.filter((m) => !m.deletedAt).length).toBe(0);
    const tombstone = merged.activeMatches.find(
      (m) => m.matchId === 'm1' && m.deletedAt,
    );
    expect(tombstone).toBeDefined();
    expect(tombstone?.deletedAt).toBe(2000);
    assertInvariants(merged);
  });

  it('Clear Queue: cleared players do not resurrect from stale admin', () => {
    const cleared = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 1000,
          deletedAt: 2000,
          updatedAt: 2000,
        }),
      ],
      lastModified: 2000,
    });
    const stale = makeState({
      players: { alice: makePlayer(1500, { username: 'alice' }) },
      queues: [makeQueueEntry('alice', { queuedAt: 1000, updatedAt: 1000 })],
      lastModified: 1000,
    });
    const merged = mergeAppState(cleared, stale);
    expect(merged.queues.some((q) => !q.deletedAt)).toBe(false);
    const tombstone = merged.queues.find(
      (q) => q.username === 'alice' && q.deletedAt,
    );
    expect(tombstone).toBeDefined();
    expect(tombstone?.deletedAt).toBe(2000);
    assertInvariants(merged);
  });

  it('Reset Session: checkpoint purge + stat reset propagate over stale offline data', () => {
    const reset = makeState({
      playersResetAt: 0,
      queuesResetAt: 2000,
      matchesResetAt: 2000,
      completedMatchesResetAt: 2000,
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          statsUpdatedAt: 2000,
          updatedAt: 2000,
        }),
      },
      queues: [],
      activeMatches: [],
      completedMatches: [],
      lastModified: 2000,
      settingsUpdatedAt: 2000,
    });
    const stale = makeState({
      queuesResetAt: 0,
      matchesResetAt: 0,
      players: {
        alice: makePlayer(1500, {
          username: 'alice',
          matchesPlayed: 5,
          wins: 3,
          losses: 2,
          statsUpdatedAt: 1000,
          updatedAt: 1000,
        }),
      },
      queues: [makeQueueEntry('alice', { queuedAt: 1000, updatedAt: 1000 })],
      activeMatches: [
        makeMatch('m1', ['alice'], ['bob'], {
          createdAt: 1000,
          updatedAt: 1000,
        }),
      ],
      completedMatches: [
        makeCompletedMatch('old', { completedAt: 1000, updatedAt: 1000 }),
      ],
      lastModified: 1000,
    });
    const merged = mergeAppState(reset, stale);
    expect(merged.queues.filter((q) => !q.deletedAt).length).toBe(0);
    expect(merged.activeMatches.filter((m) => !m.deletedAt).length).toBe(0);
    expect(merged.completedMatches.length).toBe(0);
    // Zeroed stats from reset win because statsUpdatedAt is newer.
    expect(merged.players.alice?.matchesPlayed).toBe(0);
    expect(merged.players.alice?.wins).toBe(0);
    assertInvariants(merged);
  });

  it('Reset Session: post-reset offline add survives while pre-reset entries are purged', () => {
    const reset = makeState({
      queuesResetAt: 2000,
      queues: [makeQueueEntry('alice', { queuedAt: 3000, updatedAt: 3000 })],
      lastModified: 3000,
    });
    const stale = makeState({
      queuesResetAt: 0,
      queues: [makeQueueEntry('alice', { queuedAt: 1000, updatedAt: 1000 })],
      lastModified: 1000,
    });
    const merged = mergeAppState(reset, stale);
    const live = merged.queues.filter((q) => !q.deletedAt);
    expect(live.length).toBe(1);
    expect(live[0]?.queuedAt).toBe(3000);
    assertInvariants(merged);
  });

  it('Reset All: newer empty state overwrites stale admin data', () => {
    const reset = makeState({
      playersResetAt: 3000,
      queuesResetAt: 3000,
      matchesResetAt: 3000,
      completedMatchesResetAt: 3000,
      players: {},
      queues: [],
      activeMatches: [],
      completedMatches: [],
      lastModified: 3000,
      settingsUpdatedAt: 3000,
    });
    const stale = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice', updatedAt: 1000 }),
      },
      queues: [makeQueueEntry('alice', { queuedAt: 1000, updatedAt: 1000 })],
      activeMatches: [makeMatch('m1', ['alice'], ['bob'], { updatedAt: 1000 })],
      completedMatches: [
        makeCompletedMatch('old', { completedAt: 1000, updatedAt: 1000 }),
      ],
      lastModified: 1000,
    });
    const merged = mergeAppState(reset, stale);
    expect(Object.keys(merged.players).length).toBe(0);
    expect(merged.queues.length).toBe(0);
    expect(merged.activeMatches.length).toBe(0);
    expect(merged.completedMatches.length).toBe(0);
    expect(merged.playersResetAt).toBe(3000);
    expect(merged.queuesResetAt).toBe(3000);
    expect(merged.matchesResetAt).toBe(3000);
    expect(merged.completedMatchesResetAt).toBe(3000);
    assertInvariants(merged);
  });

  it('Reset All: re-merging stale admin does not resurrect data after adoption', () => {
    const reset = makeState({
      playersResetAt: 3000,
      queuesResetAt: 3000,
      matchesResetAt: 3000,
      completedMatchesResetAt: 3000,
      players: {},
      queues: [],
      activeMatches: [],
      completedMatches: [],
      lastModified: 3000,
    });
    const stale = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice', updatedAt: 1000 }),
      },
      queues: [makeQueueEntry('alice', { queuedAt: 1000, updatedAt: 1000 })],
      activeMatches: [makeMatch('m1', ['alice'], ['bob'], { updatedAt: 1000 })],
      lastModified: 1000,
    });
    const first = mergeAppState(reset, stale);
    const second = mergeAppState(first, stale);
    expect(Object.keys(second.players).length).toBe(0);
    expect(second.queues.filter((q) => !q.deletedAt).length).toBe(0);
    expect(second.activeMatches.filter((m) => !m.deletedAt).length).toBe(0);
    expect(normalizedEqual(first, second)).toBe(true);
    assertInvariants(second);
  });
});

describe('mergeAppState — lower-value merge gaps', () => {
  it('settings LWW: higher settingsUpdatedAt wins as a block', () => {
    const a = makeState({
      settingsUpdatedAt: 2000,
      availableCourts: 4,
      autoAdvanceMatches: true,
      queuePriorityMode: 'timestamp',
      matchmakingMode: 'variety_first',
      lastModified: 2000,
    });
    const b = makeState({
      settingsUpdatedAt: 3000,
      availableCourts: 2,
      autoAdvanceMatches: false,
      queuePriorityMode: 'gamesPlayed',
      matchmakingMode: 'balance_first',
      lastModified: 3000,
    });
    const merged = mergeAppState(a, b);
    expect(merged.availableCourts).toBe(2);
    expect(merged.autoAdvanceMatches).toBe(false);
    expect(merged.queuePriorityMode).toBe('gamesPlayed');
    expect(merged.matchmakingMode).toBe('balance_first');
  });

  it('queue ordering and priority is preserved after merge', () => {
    const a = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice' }),
        bob: makePlayer(1500, { username: 'bob' }),
      },
      queues: [
        makeQueueEntry('alice', { queuedAt: 1000, enteredAt: 1000 }),
        makeQueueEntry('bob', { queuedAt: 2000, enteredAt: 2000 }),
      ],
      lastModified: 2000,
    });
    const b = makeState({
      players: {
        carol: makePlayer(1500, { username: 'carol' }),
      },
      queues: [
        makeQueueEntry('carol', {
          queuedAt: 1500,
          enteredAt: 0,
          updatedAt: 3000,
        }),
      ],
      lastModified: 3000,
    });
    const merged = mergeAppState(a, b);
    const live = merged.queues.filter((q) => !q.deletedAt);
    expect(live.map((q) => q.username)).toEqual(['alice', 'bob', 'carol']);
    expect(live[0]?.queuedAt).toBe(1000);
    expect(live[1]?.queuedAt).toBe(2000);
    expect(live[2]?.queuedAt).toBe(1500);
    assertInvariants(merged);
  });

  it('reset checkpoint boundary: pre-checkpoint entries purged, post-checkpoint entries survive', () => {
    const a = makeState({
      queuesResetAt: 2000,
      queues: [
        makeQueueEntry('alice', {
          queuedAt: 2000,
          createdAt: 2000,
          updatedAt: 2000,
        }),
      ],
      lastModified: 3000,
    });
    const b = makeState({
      queuesResetAt: 2000,
      queues: [
        makeQueueEntry('pre', {
          queuedAt: 1999,
          createdAt: 1999,
          updatedAt: 1999,
        }),
        makeQueueEntry('post', {
          queuedAt: 2001,
          createdAt: 2001,
          updatedAt: 2001,
        }),
      ],
      lastModified: 3000,
    });
    const merged = mergeAppState(a, b);
    const live = merged.queues.filter((q) => !q.deletedAt);
    const usernames = live.map((q) => q.username).sort();
    expect(usernames).toEqual(['alice', 'post']);
    expect(live.some((q) => q.username === 'pre')).toBe(false);
    assertInvariants(merged);
  });
});

describe('mergeAppState — pure state enforcement helpers', () => {
  it('enforceOneMatchPerCourtOnState keeps newest startedAt and requeues losers', () => {
    const state = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice' }),
        bob: makePlayer(1500, { username: 'bob' }),
        carol: makePlayer(1500, { username: 'carol' }),
        dave: makePlayer(1500, { username: 'dave' }),
      },
      activeMatches: [
        makeMatch('m1', ['alice', 'bob'], ['carol', 'dave'], {
          court: 1,
          status: 'in-progress',
          startedAt: 1000,
          updatedAt: 1000,
        }),
        makeMatch('m2', ['alice', 'carol'], ['bob', 'dave'], {
          court: 1,
          status: 'in-progress',
          startedAt: 2000,
          updatedAt: 2000,
        }),
      ],
    });
    enforceOneMatchPerCourtOnState(state);
    const live = state.activeMatches.filter((m) => !m.deletedAt);
    expect(live.length).toBe(1);
    expect(live[0]?.matchId).toBe('m2');
    // All players from m1 also appear in the kept match m2, so none are requeued.
    ['alice', 'bob', 'carol', 'dave'].forEach((u) => {
      expect(state.queues.some((q) => !q.deletedAt && q.username === u)).toBe(
        false,
      );
    });
    assertInvariants(state);
  });

  it('enforceOneMatchPerCourtOnState requeues players only in the losing match', () => {
    const state = makeState({
      players: {
        alice: makePlayer(1500, { username: 'alice' }),
        bob: makePlayer(1500, { username: 'bob' }),
        carol: makePlayer(1500, { username: 'carol' }),
        dave: makePlayer(1500, { username: 'dave' }),
      },
      activeMatches: [
        makeMatch('m1', ['alice', 'bob'], ['carol', 'dave'], {
          court: 1,
          status: 'in-progress',
          startedAt: 1000,
          updatedAt: 1000,
        }),
        makeMatch('m2', ['alice'], ['carol'], {
          court: 1,
          status: 'in-progress',
          startedAt: 2000,
          updatedAt: 2000,
        }),
      ],
    });
    enforceOneMatchPerCourtOnState(state);
    const live = state.activeMatches.filter((m) => !m.deletedAt);
    expect(live.length).toBe(1);
    expect(live[0]?.matchId).toBe('m2');
    // alice and carol are kept in m2; bob and dave are returned to queue.
    expect(
      state.queues.some((q) => !q.deletedAt && q.username === 'alice'),
    ).toBe(false);
    expect(
      state.queues.some((q) => !q.deletedAt && q.username === 'carol'),
    ).toBe(false);
    expect(state.queues.some((q) => !q.deletedAt && q.username === 'bob')).toBe(
      true,
    );
    expect(
      state.queues.some((q) => !q.deletedAt && q.username === 'dave'),
    ).toBe(true);
    assertInvariants(state);
  });

  it('gcTombstones removes only tombstones older than 7 days', () => {
    const now = 1000000000000;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const state = makeState({
      queues: [
        makeQueueEntry('old', { deletedAt: now - sevenDays - 1 }),
        makeQueueEntry('recent', { deletedAt: now - sevenDays + 1 }),
        makeQueueEntry('live', { deletedAt: undefined }),
      ],
      activeMatches: [
        makeMatch('oldM', ['alice'], ['bob'], {
          deletedAt: now - sevenDays - 1,
        }),
        makeMatch('recentM', ['alice'], ['bob'], {
          deletedAt: now - sevenDays + 1,
        }),
        makeMatch('liveM', ['alice'], ['bob'], { deletedAt: undefined }),
      ],
    });
    gcTombstones(state, now);
    expect(state.queues.map((q) => q.username)).toEqual(['recent', 'live']);
    expect(state.activeMatches.map((m) => m.matchId)).toEqual([
      'recentM',
      'liveM',
    ]);
  });
});
