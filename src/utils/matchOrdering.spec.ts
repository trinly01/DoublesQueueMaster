import { describe, it, expect } from 'vitest';
import { compareWaitingMatches } from './matchOrdering';

describe('compareWaitingMatches', () => {
  it('orders by createdAt ascending (oldest first)', () => {
    const a = { matchId: 'a', createdAt: 300 };
    const b = { matchId: 'b', createdAt: 100 };
    const c = { matchId: 'c', createdAt: 200 };
    const sorted = [a, b, c].sort((x, y) =>
      compareWaitingMatches(x, y, 'timestamp'),
    );
    expect(sorted.map((m) => m.matchId)).toEqual(['b', 'c', 'a']);
  });

  it('accepts Date createdAt (VM shape)', () => {
    const a = { id: 'a', createdAt: new Date(500) };
    const b = { id: 'b', createdAt: new Date(100) };
    expect(compareWaitingMatches(a, b, 'timestamp')).toBeGreaterThan(0);
    expect(compareWaitingMatches(b, a, 'timestamp')).toBeLessThan(0);
  });

  it('treats missing createdAt as 0 (top)', () => {
    const a = { matchId: 'a' };
    const b = { matchId: 'b', createdAt: 100 };
    expect(compareWaitingMatches(a, b, 'timestamp')).toBeLessThan(0);
  });

  it('breaks same-createdAt ties by minGamesPlayed in gamesPlayed mode', () => {
    const high = { matchId: 'high', createdAt: 100, minGamesPlayed: 5 };
    const low = { matchId: 'low', createdAt: 100, minGamesPlayed: 1 };
    const sorted = [high, low].sort((x, y) =>
      compareWaitingMatches(x, y, 'gamesPlayed'),
    );
    expect(sorted.map((m) => m.matchId)).toEqual(['low', 'high']);
  });

  it('breaks same-createdAt ties by oldestQueueEntryAt in timestamp mode', () => {
    const newer = { matchId: 'newer', createdAt: 100, oldestQueueEntryAt: 900 };
    const older = { matchId: 'older', createdAt: 100, oldestQueueEntryAt: 50 };
    const sorted = [newer, older].sort((x, y) =>
      compareWaitingMatches(x, y, 'timestamp'),
    );
    expect(sorted.map((m) => m.matchId)).toEqual(['older', 'newer']);
  });

  it('missing priority fields sink below populated ones within a tie', () => {
    const noFields = { matchId: 'aaa', createdAt: 100 };
    const withFields = { matchId: 'zzz', createdAt: 100, minGamesPlayed: 0 };
    const sorted = [noFields, withFields].sort((x, y) =>
      compareWaitingMatches(x, y, 'gamesPlayed'),
    );
    expect(sorted.map((m) => m.matchId)).toEqual(['zzz', 'aaa']);
  });

  it('falls back to id ordering when all keys tie', () => {
    const a = { matchId: 'beta', createdAt: 100, minGamesPlayed: 2 };
    const b = { matchId: 'alpha', createdAt: 100, minGamesPlayed: 2 };
    const sorted = [a, b].sort((x, y) =>
      compareWaitingMatches(x, y, 'gamesPlayed'),
    );
    expect(sorted.map((m) => m.matchId)).toEqual(['alpha', 'beta']);
  });

  it('is deterministic regardless of input order', () => {
    const a = { matchId: 'a', createdAt: 100 };
    const b = { matchId: 'b', createdAt: 100 };
    const c = { matchId: 'c', createdAt: 50 };
    const fwd = [a, b, c]
      .sort((x, y) => compareWaitingMatches(x, y, 'timestamp'))
      .map((m) => m.matchId);
    const rev = [c, b, a]
      .sort((x, y) => compareWaitingMatches(x, y, 'timestamp'))
      .map((m) => m.matchId);
    expect(fwd).toEqual(rev);
    expect(fwd).toEqual(['c', 'a', 'b']);
  });
});
