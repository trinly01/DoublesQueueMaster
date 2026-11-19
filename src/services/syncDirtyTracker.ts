import { LocalStorage } from 'quasar';
import { CLUB_SETTINGS } from './matchmaking-core';
import type { AppState, Player } from './matchmaking-core';

/**
 * Dirty-unit tracking for the push-path merge (stale-sync fix).
 *
 * mergeAppState resolves every conflict on CLIENT wall-clock stamps, so a
 * stale offline admin's untouched carryover can out-stamp newer server
 * content and re-propagate as a fresh commit. The fix: fingerprint each
 * sync unit at the last successful sync/adoption (the baseline); at the
 * pre-push merge only units that genuinely differ from the baseline
 * ("dirty") compete in LWW — clean units are pre-seeded with the server
 * version so they adopt it wholesale.
 *
 * Unit granularity: players per key, settings per field,
 * queues/activeMatches/completedMatches PER ENTITY (username / matchId —
 * the same keys mergeAppState dedups on), completedMatchIds + actionLogs
 * whole. Scalar/meta keys (lastModified, teamSize, clubId, clubUUID,
 * settingsUpdatedAt, settingsFieldTimestamps, *ResetAt) are not units —
 * they keep local values and follow mergeAppState's own logic.
 */

export type DirtyBaseline = Record<string, string>;

// Whole-collection units (V1 — finer granularity for match arrays is a
// documented follow-up).
const COLLECTION_FIELDS = [
  'queues',
  'activeMatches',
  'completedMatches',
  'completedMatchIds',
  'actionLogs',
] as const;

// Collections fingerprinted PER ENTITY: mergeAppState already resolves
// these arrays entity-by-entity (queues by username, matches by matchId),
// so dirty tracking matches that granularity — a clean entity inside an
// otherwise-edited collection still adopts the server version instead of
// competing in LWW with a stale client-clock stamp. completedMatchIds
// (derived companion of completedMatches) and actionLogs (append-only)
// stay whole-unit.
const PER_ENTITY_COLLECTIONS = [
  'queues',
  'activeMatches',
  'completedMatches',
] as const;
type PerEntityCollection = (typeof PER_ENTITY_COLLECTIONS)[number];

const ENTITY_KEY_FIELD: Record<PerEntityCollection, 'username' | 'matchId'> = {
  queues: 'username',
  activeMatches: 'matchId',
  completedMatches: 'matchId',
};

const isPerEntityCollection = (name: string): name is PerEntityCollection =>
  (PER_ENTITY_COLLECTIONS as readonly string[]).includes(name);

// Deterministic per-entity unit keys, derived identically on both sides
// of a merge so local and server entities pair up. The primary key
// (username / matchId) identifies the entity; a missing key falls back
// to its array index and duplicate keys get an occurrence suffix so
// every element maps to a distinct unit. Positional keys are a defensive
// fallback only — well-formed state always carries the primary key, and
// tombstoned entities keep their key so a delete re-fingerprints dirty.
const collectionEntityKeys = (
  name: PerEntityCollection,
  entities: readonly unknown[],
): string[] => {
  const field = ENTITY_KEY_FIELD[name];
  const seen = new Map<string, number>();
  return entities.map((entity, index) => {
    const raw = (entity as Record<string, unknown> | null | undefined)?.[
      field
    ];
    const base =
      typeof raw === 'string' && raw.length > 0 ? raw : `#${index}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return occurrence === 0 ? base : `${base}#${occurrence}`;
  });
};

// Settings units = the scalar fields mergeAppState resolves via per-field
// LWW (it iterates CLUB_SETTINGS), minus the keys classified elsewhere:
// actionLogs is a collection unit; completedMatchesResetAt is a reset
// checkpoint (guarded separately, never force-adopted). Every other
// CLUB_SETTINGS key — including teamSize — is a per-field LWW unit.
const SETTINGS_FIELDS = Object.keys(CLUB_SETTINGS).filter(
  (key) =>
    key !== 'actionLogs' &&
    key !== 'completedMatchesResetAt',
);

// Deterministic serialization: object keys sorted recursively so
// fingerprints are stable regardless of key insertion order. AppState is
// pure JSON data — undefined/functions serialize the way JSON.stringify
// would treat them (dropped object values, null array elements).
const canonicalize = (value: unknown): string => {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined':
    case 'function':
    case 'symbol':
    case 'bigint':
      return 'null';
    case 'number':
    case 'boolean':
    case 'string':
      return JSON.stringify(value) ?? 'null';
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalize(v)).join(',')}]`;
      }
      const rec = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of Object.keys(rec).sort()) {
        const v = rec[key];
        if (
          v === undefined ||
          typeof v === 'function' ||
          typeof v === 'symbol'
        ) {
          continue;
        }
        parts.push(`${JSON.stringify(key)}:${canonicalize(v)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      return 'null';
  }
};

/**
 * Stable fingerprint of one dirty-unit's value — sorted-key JSON.
 * Two values fingerprint equal iff they are structurally identical.
 */
export const unitFingerprint = (value: unknown): string =>
  canonicalize(value);

// unitKey format: 'players:<key>' | 'settings:<field>' |
// 'coll:<name>' (whole-unit collections) | 'coll:<name>:<entityKey>'
// (per-entity collections). Only units PRESENT in the state get an entry —
// absence is expressed by the key missing from the map
// (computeDirtyUnits treats baseline-only keys as dirty, i.e. a local
// deletion; an emptied per-entity collection simply emits no keys, so a
// prior entity key going missing reads as that entity's deletion).
const fingerprintUnits = (state: AppState): DirtyBaseline => {
  const out: DirtyBaseline = {};
  const players = state.players ?? {};
  for (const key of Object.keys(players)) {
    out[`players:${key}`] = unitFingerprint(players[key]);
  }
  const rec = state as unknown as Record<string, unknown>;
  for (const field of SETTINGS_FIELDS) {
    const v = rec[field];
    if (v !== undefined) out[`settings:${field}`] = unitFingerprint(v);
  }
  for (const name of COLLECTION_FIELDS) {
    const v = rec[name];
    if (v === undefined) continue;
    if (isPerEntityCollection(name) && Array.isArray(v)) {
      const keys = collectionEntityKeys(name, v);
      v.forEach((entity, i) => {
        out[`coll:${name}:${keys[i]}`] = unitFingerprint(entity);
      });
    } else {
      // Whole-unit collections — and a defensive fallback for malformed
      // non-array values in the per-entity slots.
      out[`coll:${name}`] = unitFingerprint(v);
    }
  }
  return out;
};

/**
 * Compute the set of dirty unit-keys for the current state vs baseline.
 * A unit is dirty when its fingerprint differs from the baseline entry —
 * including units present on only one side (genuine local add/delete).
 * baseline === null (first run / cleared storage) → every unit dirty,
 * preserving pre-fix behavior until the first successful sync heals it.
 */
export const computeDirtyUnits = (
  state: AppState,
  baseline: DirtyBaseline | null,
): Set<string> => {
  const current = fingerprintUnits(state);
  const dirty = new Set<string>();
  if (!baseline) {
    for (const key of Object.keys(current)) dirty.add(key);
    return dirty;
  }
  for (const key of new Set([
    ...Object.keys(current),
    ...Object.keys(baseline),
  ])) {
    if (current[key] !== baseline[key]) dirty.add(key);
  }
  return dirty;
};

/**
 * Snapshot the current state's unit fingerprints — called on successful
 * push AND whenever server state is adopted locally so adopted content
 * is not later mistaken for local edits.
 */
export const captureBaseline = (state: AppState): DirtyBaseline =>
  fingerprintUnits(state);

const baselineKey = (clubUUID: string) => `sync_dirty_baseline_${clubUUID}`;

/**
 * Load the per-club dirty baseline. Returns null when absent, malformed,
 * or storage is unavailable — callers treat null as "all dirty".
 */
export const loadBaseline = (clubUUID: string): DirtyBaseline | null => {
  if (!clubUUID) return null;
  try {
    const raw = LocalStorage.getItem(baselineKey(clubUUID)) as
      | Record<string, unknown>
      | null;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out: DirtyBaseline = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
};

export const saveBaseline = (
  clubUUID: string,
  baseline: DirtyBaseline,
): void => {
  if (!clubUUID) return;
  try {
    LocalStorage.set(baselineKey(clubUUID), baseline);
  } catch {
    /* quota/blocked storage — baseline self-heals on next successful sync */
  }
};

/**
 * Re-baseline the CLEAN units after a push-path merge has been applied.
 *
 * The merge replaces clean units with server content — that content is
 * synced, not a local edit, so its fingerprint becomes the new baseline
 * (otherwise the next merge would mistake adopted content for dirty and
 * let it compete in LWW again). DIRTY units keep their previous
 * fingerprints: they are still owed to the server until the push lands.
 *
 * Returns the updated baseline (same ref when nothing changed), or null
 * when there was no baseline to preserve (all-dirty first run).
 */
export const refreshBaselineAfterMerge = (
  baseline: DirtyBaseline | null,
  state: AppState,
  dirty: Set<string>,
): DirtyBaseline | null => {
  if (!baseline) return null;
  const current = fingerprintUnits(state);
  const next: DirtyBaseline = { ...baseline };
  let changed = false;
  for (const [key, fingerprint] of Object.entries(current)) {
    if (!dirty.has(key) && next[key] !== fingerprint) {
      next[key] = fingerprint;
      changed = true;
    }
  }
  return changed ? next : baseline;
};

const hasDirtyPrefix = (dirty: Set<string>, prefix: string): boolean => {
  for (const key of dirty) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
};

// A collection counts as dirty when ANY of its units is dirty: the
// whole-unit key (completedMatchIds, actionLogs — and pre-P1 baselines
// still carrying 'coll:<name>') or any per-entity key under the
// 'coll:<name>:' prefix.
const collectionDirty = (dirty: Set<string>, name: string): boolean =>
  dirty.has(`coll:${name}`) || hasDirtyPrefix(dirty, `coll:${name}:`);

// Symmetric reset-checkpoint guard: a local *ResetAt exceeding the
// server's is uncorroborated — when its collection is otherwise clean it
// cannot be a genuine pending local reset (a real reset makes the
// collection dirty), so the checkpoint defers to the server instead of
// smuggling a stale "reset" through mergeAppState's Math.max. Collections
// that ARE dirty keep the local checkpoint so a real pending reset still
// propagates. completedMatches compares effective-vs-effective (field +
// settingsFieldTimestamps stamp) like detectServerResetAdvantage.
const applyResetCheckpointGuard = (
  out: AppState & Record<string, unknown>,
  local: AppState,
  server: AppState,
  dirty: Set<string>,
): void => {
  const playersClean = !hasDirtyPrefix(dirty, 'players:');
  const guards: Array<{ field: string; clean: boolean }> = [
    { field: 'playersResetAt', clean: playersClean },
    { field: 'statsResetAt', clean: playersClean },
    { field: 'queuesResetAt', clean: !collectionDirty(dirty, 'queues') },
    {
      field: 'matchesResetAt',
      clean: !collectionDirty(dirty, 'activeMatches'),
    },
    {
      field: 'actionLogsResetAt',
      clean: !dirty.has('coll:actionLogs'),
    },
  ];
  const localRec = local as unknown as Record<string, unknown>;
  const serverRec = server as unknown as Record<string, unknown>;
  for (const { field, clean } of guards) {
    const localVal = Number(localRec[field] ?? 0);
    const serverVal = Number(serverRec[field] ?? 0);
    if (localVal > serverVal && clean) {
      out[field] = serverRec[field] ?? 0;
    }
  }

  const localCompletedEffective = Math.max(
    Number(local.completedMatchesResetAt ?? 0),
    Number(
      local.settingsFieldTimestamps?.['completedMatchesResetAt'] ?? 0,
    ),
  );
  const serverCompletedEffective = Math.max(
    Number(server.completedMatchesResetAt ?? 0),
    Number(
      server.settingsFieldTimestamps?.['completedMatchesResetAt'] ?? 0,
    ),
  );
  if (
    localCompletedEffective > serverCompletedEffective &&
    !collectionDirty(dirty, 'completedMatches')
  ) {
    out.completedMatchesResetAt = server.completedMatchesResetAt ?? 0;
    // The per-field stamp carries the epoch independently of the field —
    // neutralize it too or the guard is defeated via settingsFieldTimestamps.
    out.settingsFieldTimestamps = {
      ...(local.settingsFieldTimestamps ?? {}),
      completedMatchesResetAt:
        server.settingsFieldTimestamps?.['completedMatchesResetAt'] ?? 0,
    };
  }
};

// Per-entity overlay for the entity collections: the SERVER array is the
// base ORDER; a dirty local entity substitutes its server counterpart, a
// local-only dirty entity appends in local order, and a local-only CLEAN
// entity drops (server wins — a clean local copy can't resurrect a
// server-side delete). mergeAppState then LWWs entity-by-entity: clean
// entities are identical on both sides → server adopted; dirty ones
// genuinely compete on their own stamps. Order is semantic for queues
// (FIFO) — preserve server order, never sort.
const overlayEntityCollection = (
  localValue: unknown,
  serverValue: unknown,
  dirty: Set<string>,
  name: PerEntityCollection,
): unknown[] => {
  const localEntities = Array.isArray(localValue) ? localValue : [];
  const serverEntities = Array.isArray(serverValue) ? serverValue : [];
  const localKeys = collectionEntityKeys(name, localEntities);
  const serverKeys = collectionEntityKeys(name, serverEntities);

  const localByKey = new Map<string, unknown>();
  localEntities.forEach((entity, i) => {
    localByKey.set(localKeys[i], entity);
  });
  const serverKeySet = new Set(serverKeys);

  const out: unknown[] = [];
  serverEntities.forEach((serverEntity, i) => {
    const key = serverKeys[i];
    out.push(
      localByKey.has(key) && dirty.has(`coll:${name}:${key}`)
        ? localByKey.get(key)
        : serverEntity,
    );
  });
  localEntities.forEach((localEntity, i) => {
    const key = localKeys[i];
    if (!serverKeySet.has(key) && dirty.has(`coll:${name}:${key}`)) {
      out.push(localEntity);
    }
  });
  return out;
};

/**
 * Build the local side of the pre-push merge: a shallow clone of the
 * local state where every CLEAN unit is replaced by the server's version.
 * Clean units then compare identical on both merge sides → the server
 * version wins without LWW; only genuinely dirty units compete on
 * client-clock stamps. Scalar/meta keys keep local values (existing
 * merge logic). Also applies the conservative reset-checkpoint guard.
 */
export const buildLocalForMerge = (
  local: AppState,
  server: AppState,
  dirty: Set<string>,
): AppState => {
  const out = { ...local } as AppState & Record<string, unknown>;
  const outRec: Record<string, unknown> = out;
  const localRec = local as unknown as Record<string, unknown>;
  const serverRec = server as unknown as Record<string, unknown>;

  // players: per-key granularity — dirty keys keep the local entity,
  // clean keys adopt the server entity. Local-only clean players drop
  // (server wins — they can't resurrect stale deletes).
  const players: Record<string, Player> = { ...(server.players ?? {}) };
  for (const [key, player] of Object.entries(local.players ?? {})) {
    if (dirty.has(`players:${key}`)) players[key] = player;
  }
  out.players = players;

  for (const field of SETTINGS_FIELDS) {
    if (!dirty.has(`settings:${field}`)) out[field] = serverRec[field];
  }
  for (const name of COLLECTION_FIELDS) {
    if (isPerEntityCollection(name)) {
      // Per-entity overlay — dirty units keep their local entity,
      // clean/absent ones adopt the server entity (see
      // overlayEntityCollection for ordering rules).
      outRec[name] = overlayEntityCollection(
        localRec[name],
        serverRec[name],
        dirty,
        name,
      );
    } else if (!dirty.has(`coll:${name}`)) {
      outRec[name] = serverRec[name];
    }
  }

  applyResetCheckpointGuard(out, local, server, dirty);
  return out as AppState;
};
