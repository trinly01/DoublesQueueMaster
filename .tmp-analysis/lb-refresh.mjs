// src/utils/ratingReplay.ts
var CLUB_RANKING_CONFIG = {
  /**
   * Games below this = provisional (pulsing dot, no rank number).
   * Aligned with shrinkagePriorWeight: at this many games, the earned rating
   * change is weighted equally with the seed (n/(n+C) = 0.5 when n=C).
   */
  provisionalThreshold: 12
};
function playerIdentityKey(p) {
  if (p.userId) return p.userId;
  if (p.username) return p.username;
  return `guest:${p.firstName || ""}|${p.lastName || ""}|${p.name || ""}`;
}

// src/utils/networkRanking.ts
var LAMBDA = 0.8;
var SHRINKAGE_C = 12;
var MAX_ITERS = 500;
var EPSILON = 1e-10;
var lambdaFor = (games) => LAMBDA * games / (games + SHRINKAGE_C);
var matchPerformance = (ownScore, oppScore) => {
  if (ownScore === oppScore) return { perf: 0.5, outcome: "tie" };
  const total = ownScore + oppScore;
  const mu = total > 0 ? (ownScore - oppScore) / total : 0;
  return ownScore > oppScore ? { perf: 1 + 0.25 * mu, outcome: "win" } : { perf: 0.25 * -mu, outcome: "loss" };
};
var accFor = (accs, key, p) => {
  let acc = accs.get(key);
  if (!acc) {
    acc = {
      key,
      username: "",
      name: "",
      firstName: "",
      lastName: "",
      avatar: "",
      rating: void 0,
      games: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      perfSum: 0,
      credit: /* @__PURE__ */ new Map()
    };
    accs.set(key, acc);
  }
  if (p.username) acc.username = p.username;
  if (p.name) acc.name = p.name;
  if (p.firstName) acc.firstName = p.firstName;
  if (p.lastName) acc.lastName = p.lastName;
  if (p.avatar) acc.avatar = p.avatar;
  if (typeof p.rating === "number") acc.rating = p.rating;
  return acc;
};
var sideKeys = (team) => {
  const out = /* @__PURE__ */ new Map();
  for (const p of team) {
    const key = playerIdentityKey(p);
    if (!out.has(key)) out.set(key, p);
  }
  return out;
};
function computeNetworkScores(matches2) {
  const accs = /* @__PURE__ */ new Map();
  const ordered = [...matches2].sort((a, b) => {
    const ta = a.completedAt || "";
    const tb = b.completedAt || "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    const ka = a.matchKey || "";
    const kb = b.matchKey || "";
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  for (const m of ordered) {
    const mapA = sideKeys(m.teamA);
    const mapB = sideKeys(m.teamB);
    if (mapA.size === 0 || mapB.size === 0) continue;
    let collision = false;
    for (const k of mapB.keys()) {
      if (mapA.has(k)) {
        collision = true;
        break;
      }
    }
    if (collision) continue;
    const sideA = [...mapA.entries()].map(([key, p]) => ({
      key,
      side: "A",
      acc: accFor(accs, key, p)
    }));
    const sideB = [...mapB.entries()].map(([key, p]) => ({
      key,
      side: "B",
      acc: accFor(accs, key, p)
    }));
    const participants = [...sideA, ...sideB];
    const n = participants.length;
    if (n < 2) continue;
    const edgeW = 1 / (n - 1);
    const sideOut = {
      A: matchPerformance(m.teamAScore, m.teamBScore),
      B: matchPerformance(m.teamBScore, m.teamAScore)
    };
    const sides = [
      { tag: "A", members: sideA },
      { tag: "B", members: sideB }
    ];
    for (const { tag, members } of sides) {
      const { perf, outcome } = sideOut[tag];
      for (const { acc } of members) {
        acc.games += 1;
        acc.perfSum += perf;
        if (outcome === "win") acc.wins += 1;
        else if (outcome === "loss") acc.losses += 1;
        else acc.ties += 1;
      }
    }
    const totalScore = m.teamAScore + m.teamBScore;
    const muW = totalScore > 0 && m.teamAScore !== m.teamBScore ? Math.min(1, Math.abs(m.teamAScore - m.teamBScore) / totalScore) : 0;
    const wUp = edgeW * (1 + muW);
    const wDown = edgeW * (1 - muW);
    const oppW = {
      A: sideOut.A.outcome === "loss" ? wUp : sideOut.A.outcome === "win" ? wDown : edgeW,
      B: sideOut.B.outcome === "loss" ? wUp : sideOut.B.outcome === "win" ? wDown : edgeW
    };
    for (const from of participants) {
      for (const to of participants) {
        if (to.key === from.key) continue;
        const w = from.side === to.side ? edgeW : oppW[from.side];
        if (w > 0) {
          from.acc.credit.set(
            to.key,
            (from.acc.credit.get(to.key) || 0) + w
          );
        }
      }
    }
  }
  const players = [...accs.values()];
  if (players.length === 0) return [];
  let perfMeanSum = 0;
  for (const p of players) perfMeanSum += p.perfSum / p.games;
  const priorMean = perfMeanSum / players.length;
  const pTilde = /* @__PURE__ */ new Map();
  for (const p of players) {
    pTilde.set(
      p.key,
      Math.max(0, (p.perfSum + SHRINKAGE_C * priorMean) / (p.games + SHRINKAGE_C))
    );
  }
  const outSums = /* @__PURE__ */ new Map();
  for (const p of players) {
    let s = 0;
    for (const w of p.credit.values()) s += w;
    outSums.set(p.key, s);
  }
  const r = /* @__PURE__ */ new Map();
  for (const p of players) r.set(p.key, pTilde.get(p.key) ?? 0);
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const inflow = /* @__PURE__ */ new Map();
    for (const p of players) {
      const outSum = outSums.get(p.key) ?? 0;
      if (outSum <= 0) continue;
      const factor = (r.get(p.key) ?? 0) / outSum;
      for (const [to, w] of p.credit) {
        inflow.set(to, (inflow.get(to) || 0) + w * factor);
      }
    }
    let maxDelta = 0;
    for (const p of players) {
      const pt = pTilde.get(p.key) ?? 0;
      const lam = lambdaFor(p.games);
      const next = (1 - lam) * pt + lam * (inflow.get(p.key) || 0);
      maxDelta = Math.max(maxDelta, Math.abs(next - (r.get(p.key) ?? 0)));
      r.set(p.key, next);
    }
    if (maxDelta < EPSILON) break;
  }
  let rMax = 0;
  for (const p of players) rMax = Math.max(rMax, r.get(p.key) ?? 0);
  const { provisionalThreshold } = CLUB_RANKING_CONFIG;
  const result = players.map((p) => {
    const raw = r.get(p.key) ?? 0;
    const pt = pTilde.get(p.key) ?? 0;
    const networkFlow = Math.max(
      0,
      raw - (1 - lambdaFor(p.games)) * pt
    );
    return {
      key: p.key,
      username: p.username || p.key,
      name: p.name || p.firstName || p.username || p.key,
      firstName: p.firstName,
      lastName: p.lastName,
      avatar: p.avatar,
      rating: p.rating ?? 1450,
      matchesPlayed: p.games,
      wins: p.wins,
      losses: p.losses,
      ties: p.ties,
      networkScore: rMax > 0 ? Math.round(100 * raw / rMax) : 0,
      rawScore: raw,
      ownPerformance: pt,
      networkFlow,
      reliability: p.games / (p.games + SHRINKAGE_C),
      provisional: p.games < provisionalThreshold,
      gamesToReliable: Math.max(0, provisionalThreshold - p.games)
    };
  });
  result.sort((a, b) => {
    if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
    if (b.matchesPlayed !== a.matchesPlayed)
      return b.matchesPlayed - a.matchesPlayed;
    const na = a.name || a.username;
    const nb = b.name || b.username;
    return na < nb ? -1 : na > nb ? 1 : 0;
  });
  return result;
}

// src/utils/leaderboardCompute.ts
var NON_COMPETITIVE_MODES = /* @__PURE__ */ new Set(["fair_balance", "variety_first"]);
var filterCompetitive = (matches2, includeNonCompetitive) => includeNonCompetitive ? matches2 : matches2.filter(
  (m) => !NON_COMPETITIVE_MODES.has(m.meta?.matchmakingMode || "")
);
var toRankedInputs = (matches2) => matches2.map((m) => ({
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
    linkedTo: p.linkedTo
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
    linkedTo: p.linkedTo
  }))
}));
function computeNetworkRanked(matches2, includeNonCompetitive) {
  const filtered = filterCompetitive(matches2, includeNonCompetitive);
  return computeNetworkScores(toRankedInputs(filtered));
}

// scripts/lb-refresh.mts
var CLUB = "22e52ef0-bf60-4bd1-bea8-ef66193edf35";
var BASE = "https://api.dinkmatch.club";
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
}
var TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) {
  console.error("BOOKING_ADMIN_TOKEN missing");
  process.exit(1);
}
async function api(path) {
  for (const auth of [`Bearer ${TOKEN}`, TOKEN]) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: auth } });
    if (res.status === 401 || res.status === 403) continue;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  }
  throw new Error("auth failed");
}
var filter = {
  _and: [
    { club: { _eq: CLUB } },
    { completed_at: { _gte: "$NOW(-30 days)" } }
  ]
};
var url = `/items/completed_match?filter=${encodeURIComponent(JSON.stringify(filter))}&sort=-completed_at&limit=1000&fields=${encodeURIComponent("*,players.directus_users_id.*")}`;
var fetched = await api(url);
var matches = fetched.data || [];
console.log(`fetched ${matches.length} completed_match rows`);
if (matches.length) {
  console.log(`window: ${matches[matches.length - 1]?.completed_at} -> ${matches[0]?.completed_at}`);
}
if (matches.length === 1e3) console.log("WARNING: limit=1000 hit \u2014 truncation identical to app fetch");
var modeHist = /* @__PURE__ */ new Map();
for (const m of matches) {
  const mode = m.meta?.matchmakingMode || "(none)";
  modeHist.set(mode, (modeHist.get(mode) || 0) + 1);
}
console.log("matchmakingMode histogram:", [...modeHist.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  "));
var registered = /* @__PURE__ */ new Set();
for (const m of matches) {
  for (const jp of m.players || []) {
    const u = jp.directus_users_id?.username;
    if (u) registered.add(u);
  }
}
console.log(`registered usernames (junction): ${registered.size}`);
var comp = computeNetworkRanked(matches, false);
var all = computeNetworkRanked(matches, true);
console.log(`
computeNetworkRanked(false): ${comp.length} players | (true): ${all.length} players`);
var ANCHORS = {
  rands: { g: 105, w: 53, l: 52 },
  mikki: { g: 95, w: 50, l: 45 },
  jowinski: { g: 86, w: 53, l: 33 }
};
var findBy = (list, name) => list.find(
  (p) => `${p.name} ${p.firstName} ${p.lastName} ${p.username} ${p.key}`.toLowerCase().includes(name)
);
function compareSet(label, list) {
  console.log(`
--- ${label} ---`);
  for (const [name, a] of Object.entries(ANCHORS)) {
    const p = findBy(list, name);
    if (!p) {
      console.log(`  ${name}: NOT FOUND`);
      continue;
    }
    const ok = p.matchesPlayed === a.g && p.wins === a.w && p.losses === a.l;
    console.log(
      `  ${name}: g=${p.matchesPlayed} w=${p.wins} l=${p.losses}${p.ties ? ` t=${p.ties}` : ""}  net=${p.networkScore} raw=${p.rawScore.toFixed(4)} | screenshot ${a.g}G ${a.w}W-${a.l}L ${ok ? "<< MATCH" : ""}`
    );
  }
}
compareSet("competitive-only (includeNonCompetitive=false)", comp);
compareSet("all matches (includeNonCompetitive=true)", all);
function anchorScore(list) {
  let s = 0;
  for (const [name, a] of Object.entries(ANCHORS)) {
    const p = findBy(list, name);
    if (p) s += (p.matchesPlayed === a.g ? 1 : 0) + (p.wins === a.w ? 1 : 0) + (p.losses === a.l ? 1 : 0);
  }
  return s;
}
var useAll = anchorScore(all) > anchorScore(comp);
var chosen = useAll ? all : comp;
var chosenLabel = useAll ? "ALL MATCHES (includeNonCompetitive=true)" : "COMPETITIVE-ONLY";
console.log(`
>>> screenshot dataset = ${chosenLabel} (anchor hits: comp=${anchorScore(comp)}/9, all=${anchorScore(all)}/9)`);
var displayed = chosen.filter((p) => registered.has(p.username));
console.log(`display-filtered players: ${displayed.length} (of ${chosen.length} engine players)`);
function ranksBy(items, scoreOf) {
  const order = items.map((t, i2) => ({ t, i: i2, s: scoreOf(t) })).sort((a, b) => b.s - a.s || a.i - b.i);
  const ranks = new Array(items.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].s === order[i].s) j++;
    const avg = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks[order[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}
function pearson(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}
var scoreRanks = ranksBy(displayed, (p) => p.rawScore);
var gameRanks = ranksBy(displayed, (p) => p.matchesPlayed);
var rho = pearson(scoreRanks, gameRanks);
console.log(`
Spearman \u03C1(scoreRank, gamesRank) on display list = ${rho.toFixed(4)}`);
console.log("\n=== TOP 15 (production algorithm, display-filtered) ===");
console.log("rk  name                                   net  raw      g    W-L");
displayed.slice(0, 15).forEach((p, i) => {
  console.log(
    `${String(i + 1).padStart(3)}  ${(p.name || p.username).padEnd(38)} ${String(p.networkScore).padStart(3)}  ${p.rawScore.toFixed(4)}  ${String(p.matchesPlayed).padStart(4)}  ${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ""}`
  );
});
var TRACKED = ["jeo", "shirwin", "atthan", "sandro", "juha", "trin", "marivic", "jowinski", "cara", "mark", "ednalyn"];
console.log("\n=== tracked positions (engine rank / display rank) ===");
var engPos = new Map(chosen.map((p, i) => [p.key, i + 1]));
var dispPos = new Map(displayed.map((p, i) => [p.key, i + 1]));
for (const t of TRACKED) {
  const hits = chosen.filter(
    (p) => `${p.name} ${p.firstName} ${p.lastName} ${p.username} ${p.key}`.toLowerCase().includes(t)
  );
  if (!hits.length) {
    console.log(`  '${t}': NOT FOUND`);
    continue;
  }
  for (const p of hits) {
    const dp = dispPos.get(p.key);
    console.log(
      `  '${t}': ${p.name || p.username} (@${p.username || p.key}) net=${p.networkScore} g=${p.matchesPlayed} ${p.wins}-${p.losses} | engine=#${engPos.get(p.key)} display=#${dp ?? "\u2014(not registered)"}`
    );
  }
}
var NON_COMP = /* @__PURE__ */ new Set(["fair_balance", "variety_first"]);
var chosenRaw = useAll ? matches : matches.filter((m) => !NON_COMP.has(m.meta?.matchmakingMode || ""));
var usableMatches = 0;
var skippedMatches = 0;
{
  const keyOfP = (p) => p.userId || p.username || `guest:${p.firstName || ""}|${p.lastName || ""}|${p.name || ""}`;
  for (const m of chosenRaw) {
    const ka = new Set((m.team_a || []).map(keyOfP));
    const kb = new Set((m.team_b || []).map(keyOfP));
    if (ka.size === 0 || kb.size === 0) {
      skippedMatches++;
      continue;
    }
    let coll = false;
    for (const k of kb) if (ka.has(k)) {
      coll = true;
      break;
    }
    if (coll || ka.size + kb.size < 2) {
      skippedMatches++;
      continue;
    }
    usableMatches++;
  }
}
console.log(`
totals: fetched=${matches.length} chosenSet=${chosenRaw.length} usableMatches=${usableMatches} skipped=${skippedMatches} enginePlayers=${chosen.length} displayPlayers=${displayed.length}`);
var matchSet = useAll ? matches : matches.filter(
  (m) => !(/* @__PURE__ */ new Set(["fair_balance", "variety_first"])).has(m.meta?.matchmakingMode || "")
);
var ratingSamples = /* @__PURE__ */ new Map();
var participantSlots = 0;
var slotsWithRating = 0;
var guestSlots = 0;
var guestWithRating = 0;
var seenInMatch = /* @__PURE__ */ new Set();
for (const m of matchSet) {
  seenInMatch.clear();
  for (const side of [m.team_a, m.team_b]) {
    for (const p of side || []) {
      const key = playerIdentityKey({
        userId: p.userId,
        username: p.username,
        firstName: p.firstName,
        lastName: p.lastName,
        name: p.name,
        rating: p.rating
      });
      if (seenInMatch.has(key)) continue;
      seenInMatch.add(key);
      participantSlots++;
      const has = typeof p.rating === "number" && Number.isFinite(p.rating);
      if (has) slotsWithRating++;
      const isGuest = key.startsWith("guest:") || !p.userId && !p.username;
      if (isGuest) {
        guestSlots++;
        if (has) guestWithRating++;
      }
      let rec = ratingSamples.get(key);
      if (!rec) ratingSamples.set(key, rec = { key, vals: [], isGuest });
      rec.vals.push(has ? p.rating : void 0);
      rec.isGuest = rec.isGuest || isGuest;
    }
  }
}
var allRatings = [...ratingSamples.values()].flatMap(
  (r) => r.vals.filter((v) => typeof v === "number")
);
allRatings.sort((a, b) => a - b);
var q = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : NaN;
console.log("\n=== rating availability (chosen dataset participants) ===");
console.log(`participant slots=${participantSlots}  withRating=${slotsWithRating} (${(100 * slotsWithRating / participantSlots).toFixed(1)}%)`);
console.log(`guest slots=${guestSlots}  guestWithRating=${guestWithRating} (${guestSlots ? (100 * guestWithRating / guestSlots).toFixed(1) : "0.0"}%)`);
console.log(`rating values: n=${allRatings.length} min=${allRatings[0]} p10=${q(allRatings, 0.1)} median=${q(allRatings, 0.5)} p90=${q(allRatings, 0.9)} max=${allRatings[allRatings.length - 1]}`);
console.log("\n=== top-30 display players: rating field behavior ===");
var top30 = displayed.slice(0, 30);
var varyCount = 0;
var constCount = 0;
var noRating = 0;
for (const p of top30) {
  const rec = ratingSamples.get(p.key);
  const vals = rec ? rec.vals.filter((v) => typeof v === "number") : [];
  if (!vals.length) {
    noRating++;
    console.log(`  ${String(displayed.indexOf(p) + 1).padStart(2)} ${p.name || p.username} (@${p.username}) g=${p.matchesPlayed}: NO rating on any appearance`);
    continue;
  }
  const uniq = new Set(vals);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const coverage = `${vals.length}/${rec.vals.length}`;
  if (uniq.size > 1) {
    varyCount++;
    console.log(`  ${String(displayed.indexOf(p) + 1).padStart(2)} ${p.name || p.username} (@${p.username}) g=${p.matchesPlayed}: VARIES n=${uniq.size} range=[${mn},${mx}] cov=${coverage} latest=${p.rating}`);
  } else {
    constCount++;
    console.log(`  ${String(displayed.indexOf(p) + 1).padStart(2)} ${p.name || p.username} (@${p.username}) g=${p.matchesPlayed}: CONSTANT=${mn} cov=${coverage} appearances=${rec.vals.length}`);
  }
}
console.log(`top30 summary: constant=${constCount} varies=${varyCount} noRating=${noRating}`);
var playersWith2plus = 0;
var playersVary = 0;
for (const rec of ratingSamples.values()) {
  const vals = rec.vals.filter((v) => typeof v === "number");
  if (vals.length >= 2) {
    playersWith2plus++;
    if (new Set(vals).size > 1) playersVary++;
  }
}
console.log(`all players: with\u22652 rated appearances=${playersWith2plus}, of which varying=${playersVary} (${playersWith2plus ? (100 * playersVary / playersWith2plus).toFixed(1) : "0"}%)`);
