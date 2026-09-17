// Canonical ordering for waiting matches — shared by the merge path, the
// Matches-column sort, auto-advance, and next-in-line so every client and
// every role sees the identical FIFO pipeline.
//
// Order:
//   1. createdAt asc — oldest waiting match is next in line; newly created
//      matches always land at the bottom.
//   2. Priority tiebreak — matches created in the same batch/ms order by the
//      queue-priority fields stamped at draft time:
//        'gamesPlayed' → minGamesPlayed asc
//        'timestamp'   → oldestQueueEntryAt asc
//      Missing priority fields sink to MAX_SAFE_INTEGER.
//   3. id lexical — final deterministic tiebreak.

export type QueuePriorityMode = 'timestamp' | 'gamesPlayed' | undefined;

export interface OrderableMatch {
  id?: string;
  matchId?: string;
  createdAt?: number | Date;
  oldestQueueEntryAt?: number;
  minGamesPlayed?: number;
}

const createdMs = (m: OrderableMatch): number => {
  const v = m.createdAt;
  return v instanceof Date ? v.getTime() : (v ?? 0);
};

const priorityKey = (m: OrderableMatch, mode: QueuePriorityMode): number =>
  mode === 'gamesPlayed'
    ? (m.minGamesPlayed ?? Number.MAX_SAFE_INTEGER)
    : (m.oldestQueueEntryAt ?? Number.MAX_SAFE_INTEGER);

export const compareWaitingMatches = (
  a: OrderableMatch,
  b: OrderableMatch,
  mode: QueuePriorityMode,
): number => {
  const diff = createdMs(a) - createdMs(b);
  if (diff !== 0) return diff;
  const pDiff = priorityKey(a, mode) - priorityKey(b, mode);
  if (pDiff !== 0) return pDiff;
  const aId = a.matchId ?? a.id ?? '';
  const bId = b.matchId ?? b.id ?? '';
  return aId < bId ? -1 : aId > bId ? 1 : 0;
};
