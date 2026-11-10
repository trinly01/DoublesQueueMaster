/**
 * Build the roster match fixture from the FULL completed_match dump.
 *
 * Reads test/fixtures/completed_matches_full_all.json (all 5,073 matches),
 * keeps matches involving any roster identity (all accounts + approved
 * guest entries via roster-identities.mts), rewrites roster players to
 * canonical `roster:<id>` identities so replay/duo stats merge them,
 * and writes test/fixtures/completed_matches_team_all.json.
 *
 * Usage: npx tsx scripts/prep-team-matches.mts
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { ROSTER_PLAYERS, rosterOf, canonicalize } from './roster-identities.mjs';

const DIR = resolve(process.cwd(), 'test', 'fixtures');
const FULL = resolve(DIR, 'completed_matches_full_all.json');
const OUT = resolve(DIR, 'completed_matches_team_all.json');

const all: any[] = JSON.parse(readFileSync(FULL, 'utf8'));
const kept: any[] = [];
const stats = new Map<string, { g: number; w: number; l: number; identities: Map<string, number> }>();
for (const r of ROSTER_PLAYERS) stats.set(r.id, { g: 0, w: 0, l: 0, identities: new Map() });

for (const m of all) {
  const ta = m.team_a || [], tb = m.team_b || [];
  const aWon = (m.team_a_score ?? 0) > (m.team_b_score ?? 0);
  const mapSide = (side: any[], won: boolean) =>
    side.map((p: any) => {
      const rid = rosterOf(p);
      if (!rid) return p;
      const s = stats.get(rid)!;
      s.g++; won ? s.w++ : s.l++;
      const idKey = p.userId || `guest:${p.username || p.firstName || '?'}`;
      s.identities.set(idKey, (s.identities.get(idKey) || 0) + 1);
      return canonicalize(p, rid);
    });
  const nTa = mapSide(ta, aWon);
  const nTb = mapSide(tb, !aWon);
  if (nTa.some((p: any, i: number) => p !== ta[i]) || nTb.some((p: any, i: number) => p !== tb[i])) {
    kept.push({ ...m, team_a: nTa, team_b: nTb });
  }
}

console.log(`Full dump: ${all.length} matches → roster matches: ${kept.length}`);
for (const r of ROSTER_PLAYERS) {
  const s = stats.get(r.id)!;
  const ids = [...s.identities.entries()].sort((a, b) => b[1] - a[1]);
  console.log(
    `  ${r.label.padEnd(30)} ${String(s.g).padStart(4)}g ${String(s.w).padStart(3)}-${String(s.l).padStart(3)}  ` +
    `identities: ${ids.map(([k, n]) => `${k.slice(0, 20)}×${n}`).join(', ')}`,
  );
}
writeFileSync(OUT, JSON.stringify(kept, null, 2));
console.log(`\nSaved → ${OUT}`);
