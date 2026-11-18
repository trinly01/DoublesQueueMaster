// Shared leaderboard computation pipeline — pure functions only.
// Safe to run inside a Web Worker (no DOM, no Quasar, no Vue).
// DirectusCompletedMatch is imported as a type only, so playerProfile.ts
// (which imports Vue/Quasar) is never pulled into the worker bundle.

import type { DirectusCompletedMatch } from 'src/services/playerProfile';
import {
  replayMatches,
  replayMatchesForRanking,
  type RankedMatchInput,
  type RankedPlayer,
  type ReplayMatchInput,
  type ReplayPlayer,
} from 'src/utils/ratingReplay';
import {
  buildDuoEntries,
  duoPlayerKey,
  type DuoEntry,
} from 'src/utils/duoStats';
import {
  computeNetworkScores,
} from 'src/utils/networkRanking';

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
      linkedTo: p.linkedTo,
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
      linkedTo: p.linkedTo,
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

// Member-network bonus scale for the club duo tab: mean member centrality
// as a fraction of the top player, mapped to ~10% of the ~1450 rating scale.
// Small enough that pair record (duoScore) stays dominant; large enough to
// break ties toward better-networked pairs — and to fill the flat-rating
// gap for fixed duos whose paired matches never enter the rating replay.
const DUO_NETWORK_WEIGHT = 150;

/**
 * Club-tab duo ranking — duoScore composite PLUS a member network-centrality
 * bonus. Kept separate from computeDuoEntries: PlayerPage's Global Best
 * Duos tab shares that path and stays rating-only (network scores are
 * club-scoped by design).
 *
 * The bonus uses each member's rawScore (pre-display-normalization) joined
 * on the shared identity keyspace (duoPlayerKey ≡ playerIdentityKey). The
 * mutual A↔B echo inside member scores is accepted at this weight — the
 * rigorous fix (external-inflow subtraction) is a documented follow-up.
 */
export function computeDuoNetworkEntries(
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
  const entries = buildDuoEntries(inputs, ratingMap);

  const networked = computeNetworkScores(inputs, ratingMap);
  if (networked.length === 0) return entries;
  let rMax = 0;
  const rawByKey = new Map<string, number>();
  for (const p of networked) {
    rawByKey.set(p.key, p.rawScore);
    if (p.rawScore > rMax) rMax = p.rawScore;
  }
  if (rMax <= 0) return entries;

  const boosted = entries.map((e) => {
    const memberScores = [e.player1, e.player2]
      .map((p) => rawByKey.get(duoPlayerKey(p)))
      .filter((s): s is number => s !== undefined);
    if (memberScores.length === 0) return e;
    const mean = memberScores.reduce((a, b) => a + b, 0) / memberScores.length;
    const bonus = DUO_NETWORK_WEIGHT * (mean / rMax);
    return { ...e, duoScore: e.duoScore + bonus, networkBonus: bonus };
  });
  boosted.sort((a, b) => b.duoScore - a.duoScore);
  return boosted;
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

// Legacy "My Matches" replay input — replicates the exact field set the
// ClubPage/PlayerPage call sites used to build inline. Deliberately omits
// userId/level/matchKey/matchmakingMode: the legacy engine keys players by
// username||name and runs duo detection (duoPlayerKey) in that same
// keyspace, so feeding it the toRankedInputs superset would change which
// pairs count as fixed duos when a guest and a registered user share a
// username.
const toLegacyReplayInputs = (
  matches: DirectusCompletedMatch[],
): ReplayMatchInput[] =>
  matches.map((m) => ({
    teamAScore: m.team_a_score,
    teamBScore: m.team_b_score,
    completedAt: m.completed_at,
    teamA: (m.team_a || []).map((p) => ({
      username: p.username,
      name: p.firstName,
      firstName: p.firstName,
      lastName: p.lastName,
      rating: p.rating,
      avatar: p.avatar,
      linkedTo: p.linkedTo,
    })),
    teamB: (m.team_b || []).map((p) => ({
      username: p.username,
      name: p.firstName,
      firstName: p.firstName,
      lastName: p.lastName,
      rating: p.rating,
      avatar: p.avatar,
      linkedTo: p.linkedTo,
    })),
  }));

/**
 * "My Matches" leaderboard compute — the legacy single-pass replay shared
 * with PlayerPage's matches tab. Non-competitive modes are always excluded:
 * this tab never had an include-non-competitive toggle. Matches arrive
 * newest-first (Directus sort -completed_at); replayMatches walks the array
 * in order, so they are reversed to chronological here — identical to the
 * old [...matches].reverse() at the call sites.
 */
export function computeMatchesReplay(
  matches: DirectusCompletedMatch[],
): Record<string, ReplayPlayer> {
  const inputs = toLegacyReplayInputs(filterCompetitive(matches, false));
  inputs.reverse();
  return replayMatches(inputs);
}

// Cheap fingerprint over the fetched match list — O(matches), used to skip
// the replay entirely when the underlying data hasn't changed since the
// last computation was cached.
export function matchesFingerprint(matches: DirectusCompletedMatch[]): string {
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
