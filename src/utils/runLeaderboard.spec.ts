import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  runClubRanking,
  runDuoRanking,
  runMatchesReplay,
} from './runLeaderboard';
import type { LeaderboardJob } from 'src/workers/leaderboard.worker';
import type { DirectusCompletedMatch } from 'src/services/playerProfile';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeMatch = (
  key: string,
  completedAt: string,
  teamA: DirectusCompletedMatch['team_a'],
  teamB: DirectusCompletedMatch['team_b'],
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

const reg = (username: string) => ({
  username,
  userId: `uid-${username}`,
  firstName: username,
  lastName: 'Last',
  rating: 1500,
});

// Newest-first, like the Directus -completed_at sort.
const matches: DirectusCompletedMatch[] = [
  makeMatch(
    'm2',
    '2026-01-02T10:00:00Z',
    [reg('alice'), reg('bob')],
    [reg('carol'), reg('dave')],
  ),
  makeMatch(
    'm1',
    '2026-01-01T10:00:00Z',
    [reg('alice'), reg('bob')],
    [reg('carol'), reg('dave')],
  ),
];

// ---------------------------------------------------------------------------
// Mock Worker — captures the job and lets each test drive the response.
// ---------------------------------------------------------------------------

class MockWorker {
  static instances: MockWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    MockWorker.instances.push(this);
  }
}

class ThrowingWorker {
  constructor() {
    throw new Error('Worker unavailable');
  }
}

const g = globalThis as { Worker?: unknown };
const originalWorker = g.Worker;

afterEach(() => {
  g.Worker = originalWorker;
  MockWorker.instances = [];
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Inline path — vitest runs in node where Worker is undefined, so run()
// defers to setTimeout(0) and computes with the same pure functions.
// ---------------------------------------------------------------------------

describe('runLeaderboard — inline path (no Worker)', () => {
  it('runMatchesReplay resolves replayed players keyed by username', async () => {
    const result = await runMatchesReplay(matches);
    expect(Object.keys(result).sort()).toEqual([
      'alice',
      'bob',
      'carol',
      'dave',
    ]);
    expect(result['alice'].wins).toBe(2);
    expect(result['alice'].losses).toBe(0);
    expect(result['carol'].wins).toBe(0);
    expect(result['carol'].losses).toBe(2);
    expect(Number.isInteger(result['alice'].rating)).toBe(true);
  });

  it('runClubRanking resolves the replayed player map', async () => {
    const result = await runClubRanking(matches, false);
    // Ranking path keys by userId (playerIdentityKey), not username.
    expect(result['uid-alice']).toBeDefined();
    expect(result['uid-alice'].ratedMatchesPlayed).toBe(2);
    expect(result['uid-alice'].wins).toBe(2);
  });

  it('runDuoRanking resolves duo entries', async () => {
    const result = await runDuoRanking(matches, false);
    // alice+bob and carol+dave each played 2 games together.
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('duoScore');
  });

  it('defers computation to a later macrotask (non-blocking)', async () => {
    let settled = false;
    const promise = runMatchesReplay(matches).then((r) => {
      settled = true;
      return r;
    });
    expect(settled).toBe(false);
    await promise;
    expect(settled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Worker path — a mock Worker verifies job shape, response routing, and the
// terminate-on-message behavior.
// ---------------------------------------------------------------------------

describe('runLeaderboard — worker path', () => {
  it('posts a matches job and resolves the worker result', async () => {
    g.Worker = MockWorker;
    const canned = { alice: { username: 'alice', rating: 1600 } };
    const promise = runMatchesReplay(matches);

    expect(MockWorker.instances).toHaveLength(1);
    const w = MockWorker.instances[0];
    expect(w.postMessage).toHaveBeenCalledTimes(1);
    const job = w.postMessage.mock.calls[0][0] as LeaderboardJob;
    expect(job.kind).toBe('matches');
    expect(job.matches).toBe(matches);
    expect(job.includeNonCompetitive).toBe(false);

    w.onmessage?.({ data: canned });
    await expect(promise).resolves.toEqual(canned);
    expect(w.terminate).toHaveBeenCalledTimes(1);
  });

  it('posts club and duo jobs with the includeNonCompetitive flag', async () => {
    g.Worker = MockWorker;
    const clubPromise = runClubRanking(matches, true);
    const duoPromise = runDuoRanking(matches, false);

    const [clubJob, duoJob] = MockWorker.instances.map(
      (w) => w.postMessage.mock.calls[0][0] as LeaderboardJob,
    );
    expect(clubJob).toMatchObject({
      kind: 'club',
      includeNonCompetitive: true,
    });
    expect(duoJob).toMatchObject({
      kind: 'duo',
      includeNonCompetitive: false,
    });

    MockWorker.instances[0].onmessage?.({ data: {} });
    MockWorker.instances[1].onmessage?.({ data: [] });
    await expect(clubPromise).resolves.toEqual({});
    await expect(duoPromise).resolves.toEqual([]);
  });

  it('falls back to inline compute when the worker errors', async () => {
    g.Worker = MockWorker;
    const promise = runMatchesReplay(matches);
    const w = MockWorker.instances[0];
    w.onerror?.();
    const result = await promise;
    // Inline fallback ran the real compute — same shape as the inline path.
    expect(result['alice'].wins).toBe(2);
    expect(w.terminate).toHaveBeenCalledTimes(1);
  });

  it('falls back to inline compute when Worker construction throws', async () => {
    g.Worker = ThrowingWorker;
    const result = await runMatchesReplay(matches);
    expect(result['alice'].wins).toBe(2);
  });

  it('rejects (not hangs) when the worker errors and inline compute throws', async () => {
    g.Worker = MockWorker;
    const badMatches = [null] as unknown as DirectusCompletedMatch[];
    const promise = runMatchesReplay(badMatches);
    MockWorker.instances[0].onerror?.();
    await expect(promise).rejects.toThrow();
  });
});
