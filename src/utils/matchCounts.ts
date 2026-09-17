import type { AppState } from '../services/matchmaking';

/**
 * Pure helper: computes the per-status counts shown in the Matches filter
 * dropdown — WITHOUT building the cancelled/completed view models.
 *
 * Previously `matchesFilterOptionsWithCounts` read `.length` on the
 * `cancelledMatches` and `completedMatchViewModels` computeds, which forced
 * both to rebuild (team objects + computeWinProbability per match) on every
 * state mutation and every sync merge — even when the dropdown was never
 * opened. Counting the raw state collections produces identical numbers at a
 * fraction of the cost, and lets the VM computeds stay lazy (they only
 * evaluate when their filter is actually selected).
 *
 * Predicates mirror ClubPage.vue exactly:
 * - cancelled: activeMatches with deletedAt, excluding matchIds that reached
 *   completedMatches (a completed match keeps its deletedAt tombstone).
 * - edited: active VMs with isEdited + completedMatches with meta.isEdited.
 */
export function computeMatchFilterCounts(
  state: Pick<AppState, 'activeMatches' | 'completedMatches'>,
  activeVMs: ReadonlyArray<{ status: string; isEdited?: boolean }>,
): Record<string, number> {
  const completedIds = new Set(state.completedMatches.map((m) => m.matchId));
  return {
    all: activeVMs.length,
    'in-progress': activeVMs.filter((m) => m.status === 'in-progress').length,
    waiting: activeVMs.filter((m) => m.status === 'waiting').length,
    cancelled: state.activeMatches.filter(
      (m) => m.deletedAt && !completedIds.has(m.matchId),
    ).length,
    completed: state.completedMatches.length,
    edited:
      activeVMs.filter((m) => m.isEdited).length +
      state.completedMatches.filter((m) => m.meta?.isEdited).length,
  };
}
