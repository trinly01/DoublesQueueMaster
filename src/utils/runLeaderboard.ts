// Runs leaderboard computation in a Web Worker when available, falling back
// to inline execution (deferred one macrotask so the UI can paint first).
// Vitest runs in a node environment without Worker — tests exercise the
// inline path, which is the same pure compute functions.

import {
  computeClubRanked,
  computeDuoEntries,
} from 'src/utils/leaderboardCompute';
import type { LeaderboardJob } from 'src/workers/leaderboard.worker';
import type { DirectusCompletedMatch } from 'src/services/playerProfile';
import type { RankedPlayer } from 'src/utils/ratingReplay';
import type { DuoEntry } from 'src/utils/duoStats';

function run<T>(job: LeaderboardJob, inline: () => T): Promise<T> {
  if (typeof Worker === 'undefined') {
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(inline());
        } catch (err) {
          reject(err);
        }
      }, 0),
    );
  }
  return new Promise((resolve) => {
    let w: Worker;
    try {
      w = new Worker(
        new URL('../workers/leaderboard.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      // Worker construction failed (odd webview) — compute inline.
      resolve(inline());
      return;
    }
    w.onmessage = (e: MessageEvent<T>) => {
      w.terminate();
      resolve(e.data);
    };
    w.onerror = () => {
      w.terminate();
      resolve(inline());
    };
    w.postMessage(job);
  });
}

export function runClubRanking(
  matches: DirectusCompletedMatch[],
  includeNonCompetitive: boolean,
): Promise<Record<string, RankedPlayer>> {
  return run({ kind: 'club', matches, includeNonCompetitive }, () =>
    computeClubRanked(matches, includeNonCompetitive),
  );
}

export function runDuoRanking(
  matches: DirectusCompletedMatch[],
  includeNonCompetitive: boolean,
): Promise<DuoEntry[]> {
  return run({ kind: 'duo', matches, includeNonCompetitive }, () =>
    computeDuoEntries(matches, includeNonCompetitive),
  );
}
