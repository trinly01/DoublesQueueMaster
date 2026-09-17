// Shared leaderboard computation pipeline — pure functions only.
// Safe to run inside a Web Worker (no DOM, no Quasar, no Vue).
// DirectusCompletedMatch is imported as a type only, so playerProfile.ts
// (which imports Vue/Quasar) is never pulled into the worker bundle.

import type { DirectusCompletedMatch } from 'src/services/playerProfile';
import {
  replayMatchesForRanking,
  type RankedMatchInput,
  type RankedPlayer,
} from 'src/utils/ratingReplay';
import { buildDuoEntries, type DuoEntry } from 'src/utils/duoStats';

// Modes excluded unless the user toggles "Include non-competitive".
// Mirrors the NON_COMPETITIVE_MODES set in ratingReplay.ts.
const NON_COMPETITIVE_MODES = new Set(['fair_balance', 'variety_first']);

export const filterCompetitive = (
  matches: DirectusCompletedMatch[],
  includeNonCompetitive: boolean,
): DirectusCompletedMatch[] =>
  includeNonCompetitive
    ? matches
    : matches.filter(
        (m) => !NON_COMPETITIVE_MODES.has(m.meta?.matchmakingMode || ''),
      );

export const toRankedInputs = (
  matches: DirectusCompletedMatch[],
): RankedMatchInput[] =>
  matches.map((m) => ({
    teamAScore: m.team_a_score,
    teamBScore: m.team_b_score,
    matchKey: m.match_key,
    completedAt: m.completed_at,
    matchmakingMode: m.meta?.matchmakingMode,
    teamA: (m.team_a || []).map((p) => ({
      userId: p.userId,
      username: p.username,
      name: p.firstName,
      firstName: p.firstName,
      lastName: p.lastName,
      level: p.level,
      rating: p.rating,
      avatar: p.avatar,
    })),
    teamB: (m.team_b || []).map((p) => ({
      userId: p.userId,
      username: p.username,
      name: p.firstName,
      firstName: p.firstName,
      lastName: p.lastName,
      level: p.level,
      rating: p.rating,
      avatar: p.avatar,
    })),
  }));

export function computeClubRanked(
  matches: DirectusCompletedMatch[],
  includeNonCompetitive: boolean,
): Record<string, RankedPlayer> {
  const filtered = filterCompetitive(matches, includeNonCompetitive);
  return replayMatchesForRanking(
    toRankedInputs(filtered),
    includeNonCompetitive,
  );
}

export function computeDuoEntries(
  matches: DirectusCompletedMatch[],
  includeNonCompetitive: boolean,
): DuoEntry[] {
  const filtered = filterCompetitive(matches, includeNonCompetitive);
  const inputs = toRankedInputs(filtered);
  const replayed = replayMatchesForRanking(inputs, includeNonCompetitive);
  const ratingMap = new Map<string, number>();
  for (const [key, player] of Object.entries(replayed)) {
    ratingMap.set(key, player.rating);
  }
  return buildDuoEntries(inputs, ratingMap);
}

// Cheap fingerprint over the fetched match list — O(matches), used to skip
// the replay entirely when the underlying data hasn't changed since the
// last computation was cached.
export function matchesFingerprint(
  matches: DirectusCompletedMatch[],
): string {
  let h = 5381;
  let maxTs = 0;
  for (const m of matches) {
    const s = `${m.match_key}:${m.team_a_score}:${m.team_b_score}`;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    const t = m.completed_at ? Date.parse(m.completed_at) : 0;
    if (t > maxTs) maxTs = t;
  }
  return `${h}:${matches.length}:${maxTs}`;
}
