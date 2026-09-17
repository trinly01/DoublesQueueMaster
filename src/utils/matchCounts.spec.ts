import { describe, it, expect } from 'vitest';
import { computeMatchFilterCounts } from './matchCounts';
import type {
  ActiveMatch,
  CompletedMatch,
} from '../services/matchmaking';

const activeMatch = (over: Partial<ActiveMatch> = {}): ActiveMatch => ({
  matchId: 'm1',
  queueSource: 'GENERAL',
  teamA: ['a', 'b'],
  teamB: ['c', 'd'],
  expectedDifference: 0,
  status: 'waiting',
  createdAt: 1000,
  ...over,
});

const completedMatch = (over: Partial<CompletedMatch> = {}): CompletedMatch => ({
  matchId: 'c1',
  matchType: 'doubles',
  teamA: [],
  teamB: [],
  teamAScore: 11,
  teamBScore: 9,
  completedAt: 2000,
  updatedAt: 2000,
  club: 'club-uuid',
  ...over,
});

describe('computeMatchFilterCounts', () => {
  it('counts all/in-progress/waiting from the active view models', () => {
    const counts = computeMatchFilterCounts(
      { activeMatches: [], completedMatches: [] },
      [
        { status: 'in-progress' },
        { status: 'in-progress' },
        { status: 'waiting' },
      ],
    );
    expect(counts).toEqual({
      all: 3,
      'in-progress': 2,
      waiting: 1,
      cancelled: 0,
      completed: 0,
      edited: 0,
    });
  });

  it('counts cancelled = tombstoned active matches not yet completed', () => {
    const state = {
      activeMatches: [
        activeMatch({ matchId: 'gone', deletedAt: 3000 }),
        activeMatch({ matchId: 'gone-completed', deletedAt: 3000 }),
        activeMatch({ matchId: 'alive' }),
      ],
      completedMatches: [completedMatch({ matchId: 'gone-completed' })],
    };
    // 'gone-completed' has a tombstone AND a completed record → not cancelled
    expect(computeMatchFilterCounts(state, []).cancelled).toBe(1);
  });

  it('counts completed from raw state and edited across active + completed', () => {
    const state = {
      activeMatches: [],
      completedMatches: [
        completedMatch({ matchId: 'c1', meta: { isEdited: true } }),
        completedMatch({ matchId: 'c2' }),
        completedMatch({ matchId: 'c3', meta: { isEdited: true } }),
      ],
    };
    const counts = computeMatchFilterCounts(state, [
      { status: 'in-progress', isEdited: true },
      { status: 'waiting' },
    ]);
    expect(counts.completed).toBe(3);
    expect(counts.edited).toBe(3); // 1 active + 2 completed
  });

  it('returns all zeros for empty state', () => {
    const counts = computeMatchFilterCounts(
      { activeMatches: [], completedMatches: [] },
      [],
    );
    expect(counts).toEqual({
      all: 0,
      'in-progress': 0,
      waiting: 0,
      cancelled: 0,
      completed: 0,
      edited: 0,
    });
  });
});
