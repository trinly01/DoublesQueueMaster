/**
 * Scan ALL completed matches for roster players' alternate accounts.
 *
 * Builds an identity index (userId / username / name) across the full
 * dataset, then fuzzy-matches the 10 roster names — including nicknames —
 * to surface second accounts, guest entries, and spelling variants that
 * the primary roster matcher may have missed.
 *
 * Usage: npx tsx scripts/scan-roster-accounts.mts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FILE = resolve(process.cwd(), 'test', 'fixtures', 'completed_matches_full_all.json');
const matches: any[] = JSON.parse(readFileSync(FILE, 'utf8'));

const norm = (s: unknown) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9#@ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Roster: canonical name + every known alias/username stem.
const ROSTER = [
  { name: 'Jeovanni Zabala', aliases: ['jeovanni', 'jeo', 'zabala'], gender: 'M' },
  { name: 'Franco Gachallan', aliases: ['franco', 'lenz', 'gachallan', 'gatchallan', 'gatchalian'], gender: 'M' },
  { name: 'James Manganaan', aliases: ['james', 'manganaan'], gender: 'M' },
  { name: 'Timothy Eslabra', aliases: ['timothy', 'timot', 'eslabra', 'eslaba'], gender: 'M' },
  { name: 'Hazel Eslabra', aliases: ['hazel', 'eslabra', 'eslaba'], gender: 'F' },
  { name: 'Grace Estayo', aliases: ['grace', 'estayo'], gender: 'F' },
  { name: 'Nairetta Pastoral', aliases: ['nairetta', 'aira', 'pastoral'], gender: 'F' },
  { name: 'Jaria Querimit', aliases: ['jaria', 'jaira', 'querimit'], gender: 'F' },
  { name: 'Michael Braganza', aliases: ['michael', 'mj', 'braganza', 'disu'], gender: 'M' },
  { name: 'Sheree Villegas', aliases: ['sheree', 'she', 'villegas'], gender: 'F' },
];

// ---- Build identity index -------------------------------------------------
// key = userId if present else `guest:${normalized name}`
interface Ident {
  userId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  games: number;
  wins: number;
  losses: number;
  firstSeen: string;
  lastSeen: string;
  clubs: Set<string>;
}
const idents = new Map<string, Ident>();

for (const m of matches) {
  const team = [...(m.team_a || []), ...(m.team_b || [])];
  const aWon = (m.team_a_score ?? 0) > (m.team_b_score ?? 0);
  team.forEach((p: any, idx: number) => {
    const inA = idx < (m.team_a || []).length;
    const won = inA === aWon;
    const fn = p?.firstName, ln = p?.lastName, un = p?.username, uid = p?.userId;
    const display = p?.name || [fn, ln].filter(Boolean).join(' ') || un || '?';
    const key = uid || `guest:${norm(display)}`;
    let e = idents.get(key);
    if (!e) {
      e = { userId: uid, username: un, firstName: fn, lastName: ln, name: display, games: 0, wins: 0, losses: 0, firstSeen: m.completed_at, lastSeen: m.completed_at, clubs: new Set() };
      idents.set(key, e);
    }
    e.games++;
    if (won) e.wins++; else e.losses++;
    if (m.completed_at < e.firstSeen) e.firstSeen = m.completed_at;
    if (m.completed_at > e.lastSeen) e.lastSeen = m.completed_at;
    if (m.club) e.clubs.add(String(m.club).slice(0, 8));
  });
}
console.log(`Total matches: ${matches.length} | distinct identities: ${idents.size}`);

// ---- Score each identity vs roster ---------------------------------------
function scoreIdent(e: Ident): { roster: string; score: number; why: string } | null {
  const fn = norm(e.firstName), ln = norm(e.lastName), un = norm(e.username), nm = norm(e.name);
  const hay = `${fn} ${ln} ${un} ${nm}`;
  let best: { roster: string; score: number; why: string } | null = null;
  for (const r of ROSTER) {
    let score = 0;
    const whys: string[] = [];
    // surname match is the anchor
    const lastHit = r.aliases.filter((a) => a.length > 3 && (ln === a || ln.endsWith(` ${a}`) || nm.includes(a)));
    // first-name / alias hit
    const firstHit = r.aliases.filter((a) => {
      if (a.length <= 2) return false; // skip 'mj','she' as bare first-name tokens? keep 'she' though — handle below
      return fn.startsWith(a) || nm.split(' ').includes(a) || un.startsWith(a);
    });
    const shortAlias = r.aliases.filter((a) => a.length <= 3 && (nm.split(' ').includes(a) || un === a || un.startsWith(`${a}`)));
    if (lastHit.length) { score += 3; whys.push(`last~${lastHit[0]}`); }
    if (firstHit.length) { score += 3; whys.push(`first~${firstHit[0]}`); }
    if (shortAlias.length) { score += 1; whys.push(`alias~${shortAlias[0]}`); }
    // username composite like nairettap / timdev0421#tru
    if (r.aliases.some((a) => a.length > 3 && un.includes(a))) { score += 1; whys.push('user~alias'); }
    if (score >= 4 && (!best || score > best.score)) best = { roster: r.name, score, why: whys.join(',') };
    // exact full-name match
    const full = norm(`${r.name.split(' ')[0]} ${r.name.split(' ')[1]}`);
    if (hay.includes(full)) { score += 2; whys.push('fullname'); }
  }
  return best;
}

// ---- Report ----------------------------------------------------------------
const byRoster = new Map<string, { e: Ident; score: number; why: string }[]>();
for (const e of idents.values()) {
  const s = scoreIdent(e);
  if (!s) continue;
  if (!byRoster.has(s.roster)) byRoster.set(s.roster, []);
  byRoster.get(s.roster)!.push({ e, score: s.score, why: s.why });
}

for (const r of ROSTER) {
  const list = (byRoster.get(r.name) || []).sort((a, b) => b.e.games - a.e.games);
  console.log(`\n=== ${r.name} (${r.gender}) — ${list.length} candidate identities ===`);
  for (const { e, score, why } of list.slice(0, 12)) {
    console.log(
      `  ${String(e.games).padStart(4)}g ${String(e.wins).padStart(3)}-${String(e.losses).padStart(3)}  ` +
      `${e.firstName || ''} ${e.lastName || ''} | @${e.username || '-'} | uid:${(e.userId || 'guest').slice(0, 8)} | ` +
      `${e.firstSeen.slice(0, 10)}→${e.lastSeen.slice(0, 10)} | score ${score} (${why})`,
    );
  }
}
