/**
 * Canonical identity spec for the 10-player tournament roster.
 *
 * Players have multiple accounts and play as guests — every known
 * userId / username / approved guest tag is mapped to one roster id so
 * match history merges correctly (e.g. Jaria's two accounts, guest
 * entries like @Jeo / @B Aira).
 *
 * Confirmed via scripts/scan-roster-accounts.mts + user review:
 *  - Jel Manganaan, Aira Jane Perez, Shaira Agaceta etc. are DIFFERENT
 *    people — deliberately excluded.
 */

export interface RosterPlayer {
  id: string;
  gender: 'M' | 'F';
  label: string;
  /** registered account userIds (all merged) */
  uids: string[];
  /** normalized usernames — matches registered AND guest rows carrying it */
  usernames: string[];
  /** normalized guest-only usernames (no userId on the row) */
  guestUsernames: string[];
  /** guest fallback: first-name tokens + required surname fragments */
  guestFirst: string[];
  guestLast: string[];
}

const norm = (s: unknown) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9#@ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const ROSTER_PLAYERS: RosterPlayer[] = [
  {
    id: 'jeovanni', gender: 'M', label: 'Jeovanni Zabala',
    uids: ['e80aacf4-e09a-4e64-996b-f1019c6a4e04'],
    usernames: ['jeovannizabala#05d'],
    guestUsernames: ['jeo', 'b jeo'],
    guestFirst: ['jeo', 'jeovanni'], guestLast: ['zabala'],
  },
  {
    id: 'franco', gender: 'M', label: 'Franco Lorenzo Gachallan',
    uids: ['574b1ea8-9afc-4244-bdc3-e2d8f2f4c737'],
    usernames: ['gachallanf#mpr'],
    guestUsernames: ['lenz'],
    guestFirst: ['lenz', 'franco'], guestLast: ['gachall', 'gatchall'],
  },
  {
    id: 'james', gender: 'M', label: 'James Manganaan',
    uids: ['15ff5edd-242d-4ac7-bc48-988a62c3e749'],
    usernames: ['jamesmanganaan1808#1xb'],
    guestUsernames: ['james'],
    guestFirst: ['james'], guestLast: ['manganaan'],
  },
  {
    id: 'timothy', gender: 'M', label: 'Timothy Eslabra',
    uids: ['c9c6b84d-bd6f-4e08-97b4-e523132e77e2'],
    usernames: ['timdev0421#tru'],
    guestUsernames: ['timot'],
    guestFirst: ['timot', 'timothy', 'tj'], guestLast: ['eslab', 'eslaba'],
  },
  {
    id: 'michael', gender: 'M', label: 'Michael Braganza',
    uids: ['729d6aa7-8f29-48fc-aaf0-8d97248999fb'],
    usernames: ['michaelbraganza09#oas'],
    guestUsernames: ['b michael'],
    guestFirst: ['michael', 'mj'], guestLast: ['braganza', 'disu'],
  },
  {
    id: 'hazel', gender: 'F', label: 'Hazel Eslabra',
    uids: ['8733041e-da3c-44e7-9dc1-21fdf92619ee'],
    usernames: ['hazelhiquiana22#890'],
    guestUsernames: ['hazel'],
    guestFirst: ['hazel'], guestLast: ['eslab', 'eslaba'],
  },
  {
    id: 'grace', gender: 'F', label: 'Grace Estayo',
    uids: ['50808ce8-a7da-4fc0-a93d-9f3766059fd0'],
    usernames: ['gracebackupmail#2t9'],
    guestUsernames: [],
    guestFirst: ['grace'], guestLast: ['estayo'],
  },
  {
    id: 'nairetta', gender: 'F', label: 'Nairetta Pastoral',
    uids: ['a2a86ed4-fc9f-4165-9eb8-e5cc4945d5cb'],
    usernames: ['nairettap#yh3'],
    guestUsernames: ['aira', 'b aira', 'aira p', 'aira pastoral'],
    guestFirst: ['aira', 'nairetta'], guestLast: ['pastoral'],
  },
  {
    id: 'jaria', gender: 'F', label: 'Jaria Querimit',
    uids: [
      '682e1258-6483-442f-911f-87cb6610ff0e', // jquerimit24#rky (Jul 28–Sep 1)
      '75fc4a06-fd56-45b6-86d7-0ade30179ca3', // jaijaipq431#3ka "Jaira pq" (Sep 2–Nov 4)
      '7bb32d8c-baf9-44f8-bdf3-d0eaffbc3c4b', // jquerimit0711#cyf (5 games)
    ],
    usernames: ['jquerimit24#rky', 'jaijaipq431#3ka', 'jquerimit0711#cyf'],
    guestUsernames: ['jaira', 'jairaaa'],
    guestFirst: ['jaria', 'jaira'], guestLast: ['querimit', 'pq'],
  },
  {
    id: 'sheree', gender: 'F', label: 'Sheree Villegas',
    uids: ['b36bc80b-ba87-42d7-8d24-08a9dcadfe98'],
    usernames: ['shereevillegas28#v55'],
    guestUsernames: ['she', 'b sheree'],
    guestFirst: ['she', 'sheree'], guestLast: ['villegas'],
  },
];

export type RosterId = (typeof ROSTER_PLAYERS)[number]['id'];

/** Match a team_a/team_b snapshot player to a roster id, or null.
 *  Handles raw snapshots AND canonicalized `roster:<id>` identities. */
export function rosterOf(p: any): RosterId | null {
  const uid = p?.userId ? String(p.userId) : '';
  const un = norm(p?.username);
  const fn = norm(p?.firstName);
  const ln = norm(p?.lastName);
  for (const r of ROSTER_PLAYERS) {
    if (uid === `roster:${r.id}` || un === `roster:${r.id}`) return r.id as RosterId;
    if (uid && r.uids.includes(uid)) return r.id as RosterId;
    if (un && r.usernames.includes(un)) return r.id as RosterId;
    if (!uid) {
      if (un && r.guestUsernames.includes(un)) return r.id as RosterId;
      // guest name fallback: first token matches AND surname fragment present
      const fnTok = fn.split(' ')[0] || '';
      if (r.guestFirst.includes(fnTok) && ln && r.guestLast.some((g) => ln.includes(g))) {
        return r.id as RosterId;
      }
    }
  }
  return null;
}

/** Rewrite a roster player's identity fields to a canonical key so replay
 *  and duo stats merge all their accounts/guest entries into one player. */
export function canonicalize(p: any, rid: RosterId) {
  const r = ROSTER_PLAYERS.find((x) => x.id === rid)!;
  return {
    ...p,
    userId: `roster:${rid}`,
    username: `roster:${rid}`,
    firstName: r.label.split(' ')[0],
    lastName: r.label.split(' ').slice(1).join(' '),
    name: r.label,
  };
}
