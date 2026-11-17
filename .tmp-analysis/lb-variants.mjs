// src/utils/duoStats.ts
var duoPlayerKey = (p) => {
  if (p.userId) return p.userId;
  if (p.username) return p.username;
  return `guest:${p.firstName || ""}|${p.lastName || ""}|${p.name || ""}`;
};
var DUO_DETECT = {
  minPairGames: 4,
  strongShare: 0.5,
  weakShare: 0.4,
  minDays: 2,
  carryGap: 200,
  carryWinDiff: 0.15,
  monoOppShare: 0.6
};
function detectFixedDuos(matches) {
  const playerGames = /* @__PURE__ */ new Map();
  const playerWins = /* @__PURE__ */ new Map();
  const playerRating = /* @__PURE__ */ new Map();
  const partnerCounts = /* @__PURE__ */ new Map();
  const pairStats = /* @__PURE__ */ new Map();
  for (const m of matches) {
    const ta = m.teamA || [];
    const tb = m.teamB || [];
    if (ta.length !== 2 || tb.length !== 2) continue;
    const aWon = m.teamAScore > m.teamBScore;
    const day = m.completedAt ? m.completedAt.slice(0, 10) : "";
    const oppKey = (team) => team.map(duoPlayerKey).sort().join("|");
    for (const p of [...ta, ...tb]) {
      const k = duoPlayerKey(p);
      playerGames.set(k, (playerGames.get(k) || 0) + 1);
      if (p.rating !== void 0) playerRating.set(k, p.rating);
    }
    for (const p of aWon ? ta : tb) {
      const k = duoPlayerKey(p);
      playerWins.set(k, (playerWins.get(k) || 0) + 1);
    }
    const sides = [
      { team: ta, won: aWon, opp: tb },
      { team: tb, won: !aWon, opp: ta }
    ];
    for (const side of sides) {
      const k1 = duoPlayerKey(side.team[0]);
      const k2 = duoPlayerKey(side.team[1]);
      for (const [a, b] of [
        [k1, k2],
        [k2, k1]
      ]) {
        let pc = partnerCounts.get(a);
        if (!pc) partnerCounts.set(a, pc = /* @__PURE__ */ new Map());
        pc.set(b, (pc.get(b) || 0) + 1);
      }
      const key = [k1, k2].sort().join("|");
      let st = pairStats.get(key);
      if (!st) {
        pairStats.set(
          key,
          st = { games: 0, wins: 0, days: /* @__PURE__ */ new Set(), oppCounts: /* @__PURE__ */ new Map() }
        );
      }
      st.games++;
      if (side.won) st.wins++;
      if (day) st.days.add(day);
      const ok = oppKey(side.opp);
      st.oppCounts.set(ok, (st.oppCounts.get(ok) || 0) + 1);
    }
  }
  const topPartner = (k) => {
    const pc = partnerCounts.get(k);
    if (!pc) return void 0;
    let best;
    let bestN = -1;
    for (const [pk, n] of pc) {
      if (n > bestN || n === bestN && pk < (best ?? "")) {
        best = pk;
        bestN = n;
      }
    }
    return best;
  };
  const out = /* @__PURE__ */ new Map();
  for (const [key, st] of pairStats) {
    if (st.games < DUO_DETECT.minPairGames) continue;
    const [k1, k2] = key.split("|");
    const g1 = playerGames.get(k1) || 0;
    const g2 = playerGames.get(k2) || 0;
    if (!g1 || !g2) continue;
    const share1 = st.games / g1;
    const share2 = st.games / g2;
    const mutual = topPartner(k1) === k2 && topPartner(k2) === k1;
    const days = st.days.size;
    let reason;
    if (mutual && share1 >= DUO_DETECT.strongShare && share2 >= DUO_DETECT.strongShare) {
      reason = "concentration";
    } else if (Math.max(share1, share2) >= DUO_DETECT.weakShare) {
      if (days >= DUO_DETECT.minDays) {
        reason = "persistence";
      } else {
        const r1 = playerRating.get(k1);
        const r2 = playerRating.get(k2);
        if (r1 !== void 0 && r2 !== void 0 && Math.abs(r1 - r2) >= DUO_DETECT.carryGap) {
          const weak = r1 < r2 ? k1 : k2;
          const soloGames = (playerGames.get(weak) || 0) - st.games;
          if (soloGames > 0) {
            const duoWR = st.wins / st.games;
            const soloWR = ((playerWins.get(weak) || 0) - st.wins) / soloGames;
            if (duoWR >= soloWR + DUO_DETECT.carryWinDiff) reason = "carry";
          }
        }
        if (!reason) {
          let topOpp = 0;
          for (const n of st.oppCounts.values()) if (n > topOpp) topOpp = n;
          if (topOpp / st.games >= DUO_DETECT.monoOppShare) {
            reason = "monoculture";
          }
        }
      }
    }
    if (reason) {
      out.set(key, { key, games: st.games, days, share1, share2, mutual, reason });
    }
  }
  return out;
}

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
function computeNetworkScores(matches) {
  const accs = /* @__PURE__ */ new Map();
  const ordered = [...matches].sort((a, b) => {
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
      acc: accFor(accs, key, p)
    }));
    const sideB = [...mapB.entries()].map(([key, p]) => ({
      key,
      acc: accFor(accs, key, p)
    }));
    const participants = [...sideA, ...sideB];
    const n = participants.length;
    if (n < 2) continue;
    const edgeW = 1 / (n - 1);
    for (const side of [sideA, sideB]) {
      const own = side === sideA ? m.teamAScore : m.teamBScore;
      const opp = side === sideA ? m.teamBScore : m.teamAScore;
      const { perf, outcome } = matchPerformance(own, opp);
      for (const { acc } of side) {
        acc.games += 1;
        acc.perfSum += perf;
        if (outcome === "win") acc.wins += 1;
        else if (outcome === "loss") acc.losses += 1;
        else acc.ties += 1;
      }
    }
    for (const { acc: from } of participants) {
      for (const { key: to } of participants) {
        if (to === from.key) continue;
        from.credit.set(to, (from.credit.get(to) || 0) + edgeW);
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
      const next = (1 - LAMBDA) * pt + LAMBDA * (inflow.get(p.key) || 0);
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
    const networkFlow = Math.max(0, raw - (1 - LAMBDA) * pt);
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

// scripts/leaderboard-variants.mts
var CLUB = "22e52ef0-bf60-4bd1-bea8-ef66193edf35";
var BASE = "https://api.dinkmatch.club";
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
}
var TOKEN = process.env.BOOKING_ADMIN_TOKEN;
if (!TOKEN) {
  console.error("BOOKING_ADMIN_TOKEN missing from .env");
  process.exit(1);
}
async function api(path2) {
  for (const auth of [`Bearer ${TOKEN}`, TOKEN]) {
    const res = await fetch(`${BASE}${path2}`, {
      headers: { Authorization: auth }
    });
    if (res.status === 401 || res.status === 403) continue;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  }
  throw new Error("auth failed");
}
var since = new Date(Date.now() - 30 * 24 * 3600 * 1e3).toISOString();
var path = `/items/completed_match?filter%5Bclub%5D%5B_eq%5D=${CLUB}&filter%5Bcompleted_at%5D%5B_gte%5D=${encodeURIComponent(since)}&fields=*&sort=-completed_at&limit=1000`;
var fetched = await api(path);
var rawMatches = fetched.data || [];
console.log(`fetched ${rawMatches.length} completed_match rows (30d window, limit 1000)`);
if (rawMatches.length === 1e3) console.log("WARNING: hit limit=1000 \u2014 app fetch would truncate identically");
var NON_COMPETITIVE = /* @__PURE__ */ new Set(["fair_balance", "variety_first"]);
var competitive = rawMatches.filter(
  (m) => !NON_COMPETITIVE.has(m.meta?.matchmakingMode || "")
);
console.log(`competitive matches after filterCompetitive(false): ${competitive.length}`);
var mapSide = (arr = []) => arr.map((p) => ({
  userId: p.userId,
  username: p.username,
  name: p.firstName,
  firstName: p.firstName,
  lastName: p.lastName,
  level: p.level,
  rating: p.rating,
  avatar: p.avatar,
  linkedTo: p.linkedTo
}));
var inputs = competitive.map((m) => ({
  teamAScore: m.team_a_score,
  teamBScore: m.team_b_score,
  matchKey: m.match_key,
  completedAt: m.completed_at,
  matchmakingMode: m.meta?.matchmakingMode,
  teamA: mapSide(m.team_a),
  teamB: mapSide(m.team_b)
}));
var SHRINKAGE_C2 = 12;
var MAX_ITERS2 = 500;
var EPSILON2 = 1e-10;
var matchPerformance2 = (ownScore, oppScore) => {
  if (ownScore === oppScore) return { perf: 0.5, outcome: "tie" };
  const total = ownScore + oppScore;
  const mu = total > 0 ? (ownScore - oppScore) / total : 0;
  return ownScore > oppScore ? { perf: 1 + 0.25 * mu, outcome: "win" } : { perf: 0.25 * -mu, outcome: "loss" };
};
var sideKeys2 = (team) => {
  const out = /* @__PURE__ */ new Map();
  for (const p of team) {
    const key = playerIdentityKey(p);
    if (!out.has(key)) out.set(key, p);
  }
  return out;
};
var accFor2 = (accs, key, p) => {
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
function runVariant(matches, edgeMode, iterMode) {
  const accs = /* @__PURE__ */ new Map();
  const margin = { ties: 0, nonPositive: 0, bad: 0, samples: [] };
  const teammatePairs = /* @__PURE__ */ new Map();
  let matchesUsed = 0;
  const ordered = [...matches].sort((a, b) => {
    const ta = a.completedAt || "";
    const tb = b.completedAt || "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    const ka = a.matchKey || "";
    const kb = b.matchKey || "";
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  for (const m of ordered) {
    const mapA = sideKeys2(m.teamA);
    const mapB = sideKeys2(m.teamB);
    if (mapA.size === 0 || mapB.size === 0) continue;
    let collision = false;
    for (const k of mapB.keys()) {
      if (mapA.has(k)) {
        collision = true;
        break;
      }
    }
    if (collision) continue;
    const sideA = [...mapA.entries()].map(([key, p]) => ({ key, acc: accFor2(accs, key, p) }));
    const sideB = [...mapB.entries()].map(([key, p]) => ({ key, acc: accFor2(accs, key, p) }));
    const participants = [...sideA, ...sideB];
    const n = participants.length;
    if (n < 2) continue;
    matchesUsed += 1;
    const edgeW = 1 / (n - 1);
    const sA = m.teamAScore;
    const sB = m.teamBScore;
    const T = sA + sB;
    if (!Number.isFinite(T)) margin.bad++;
    else if (T <= 0) margin.nonPositive++;
    else if (sA === sB) margin.ties++;
    else margin.samples.push(Math.abs(sA - sB) / T);
    for (const side of [sideA, sideB]) {
      for (let i = 0; i < side.length; i++) {
        for (let j = i + 1; j < side.length; j++) {
          const ka = side[i].key < side[j].key ? side[i].key : side[j].key;
          const kb = side[i].key < side[j].key ? side[j].key : side[i].key;
          const pk = `${ka}|${kb}`;
          const rec = teammatePairs.get(pk);
          if (rec) rec.games++;
          else teammatePairs.set(pk, { games: 1, k1: ka, k2: kb });
        }
      }
    }
    const outcomes = /* @__PURE__ */ new Map();
    for (const side of [sideA, sideB]) {
      const own = side === sideA ? m.teamAScore : m.teamBScore;
      const opp = side === sideA ? m.teamBScore : m.teamAScore;
      const { perf, outcome } = matchPerformance2(own, opp);
      for (const { key, acc } of side) {
        acc.games += 1;
        acc.perfSum += perf;
        if (outcome === "win") acc.wins += 1;
        else if (outcome === "loss") acc.losses += 1;
        else acc.ties += 1;
        outcomes.set(key, outcome);
      }
    }
    if (edgeMode === "base") {
      for (const { acc: from } of participants) {
        for (const { key: to } of participants) {
          if (to === from.key) continue;
          from.credit.set(to, (from.credit.get(to) || 0) + edgeW);
        }
      }
    } else {
      const isTie = m.teamAScore === m.teamBScore;
      const aOutcome = outcomes.get(sideA[0].key);
      const winners = isTie ? [] : aOutcome === "win" ? sideA : sideB;
      const losers = isTie ? [] : aOutcome === "win" ? sideB : sideA;
      for (const side of [sideA, sideB]) {
        for (const { acc: from } of side) {
          for (const { key: to } of side) {
            if (to === from.key) continue;
            from.credit.set(to, (from.credit.get(to) || 0) + edgeW);
          }
        }
      }
      if (edgeMode === "v4") {
        if (isTie) {
          for (const { acc: from } of participants) {
            const inA = sideA.some((s) => s.acc === from);
            const opp = inA ? sideB : sideA;
            for (const { key: to } of opp) {
              from.credit.set(to, (from.credit.get(to) || 0) + edgeW);
            }
          }
        } else {
          for (const { acc: from } of losers) {
            for (const { key: to } of winners) {
              from.credit.set(to, (from.credit.get(to) || 0) + edgeW);
            }
          }
        }
      } else {
        const sAv = m.teamAScore;
        const sBv = m.teamBScore;
        const Tv = sAv + sBv;
        const symmetric = Tv <= 0 || isTie;
        const muw = symmetric ? 0 : Math.min(1, Math.abs(sAv - sBv) / Tv);
        if (symmetric) {
          for (const { acc: from } of participants) {
            const inA = sideA.some((s) => s.acc === from);
            const opp = inA ? sideB : sideA;
            for (const { key: to } of opp) {
              from.credit.set(to, (from.credit.get(to) || 0) + edgeW);
            }
          }
        } else {
          const aLost = sBv > sAv;
          for (const [fromSide, toSide] of [
            [sideA, sideB],
            [sideB, sideA]
          ]) {
            const fromLost = fromSide === sideA ? aLost : !aLost;
            const w = edgeW * (fromLost ? 1 + muw : 1 - muw);
            for (const { acc: from } of fromSide) {
              for (const { key: to } of toSide) {
                from.credit.set(to, (from.credit.get(to) || 0) + w);
              }
            }
          }
        }
      }
    }
  }
  const players = [...accs.values()];
  if (players.length === 0)
    return { players: [], matchesUsed, iters: 0, meanGames: 0, outSumStats: { min: 0, max: 0, zero: 0 }, margin, teammatePairs };
  let perfMeanSum = 0;
  for (const p of players) perfMeanSum += p.perfSum / p.games;
  const priorMean = perfMeanSum / players.length;
  const pTilde = /* @__PURE__ */ new Map();
  for (const p of players) {
    pTilde.set(p.key, Math.max(0, (p.perfSum + SHRINKAGE_C2 * priorMean) / (p.games + SHRINKAGE_C2)));
  }
  const outSums = /* @__PURE__ */ new Map();
  for (const p of players) {
    let s = 0;
    for (const w of p.credit.values()) s += w;
    outSums.set(p.key, s);
  }
  const totalGames = players.reduce((s, p) => s + p.games, 0);
  const meanGames = totalGames / players.length;
  const lambda = iterMode === "v3" ? 0.45 : 0.8;
  const useGameNorm = iterMode === "v2";
  const r = /* @__PURE__ */ new Map();
  for (const p of players) r.set(p.key, pTilde.get(p.key) ?? 0);
  let iters = 0;
  for (let iter = 0; iter < MAX_ITERS2; iter++) {
    iters = iter + 1;
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
      const raw = inflow.get(p.key) || 0;
      const normed = useGameNorm ? raw / p.games * meanGames : raw;
      const next = (1 - lambda) * pt + lambda * normed;
      maxDelta = Math.max(maxDelta, Math.abs(next - (r.get(p.key) ?? 0)));
      r.set(p.key, next);
    }
    if (maxDelta < EPSILON2) break;
  }
  let rMax = 0;
  for (const p of players) rMax = Math.max(rMax, r.get(p.key) ?? 0);
  const result = players.map((p) => {
    const raw = r.get(p.key) ?? 0;
    const pt = pTilde.get(p.key) ?? 0;
    return {
      key: p.key,
      display: p.name || p.firstName || p.username || p.key,
      username: p.username,
      firstName: p.firstName,
      lastName: p.lastName,
      matchesPlayed: p.games,
      wins: p.wins,
      losses: p.losses,
      ties: p.ties,
      networkScore: rMax > 0 ? Math.round(100 * raw / rMax) : 0,
      rawScore: raw,
      ownPerformance: pt
    };
  });
  result.sort((a, b) => {
    if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
    if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
    return a.display < b.display ? -1 : a.display > b.display ? 1 : 0;
  });
  const outVals = players.map((p) => outSums.get(p.key) ?? 0);
  const outSumStats = {
    min: Math.min(...outVals),
    max: Math.max(...outVals),
    zero: outVals.filter((v) => v <= 0).length
  };
  return { players: result, matchesUsed, iters, meanGames, outSumStats, margin, teammatePairs };
}
function ranksBy(items, scoreOf, desc) {
  const order = items.map((t, i2) => ({ t, i: i2, s: scoreOf(t) })).sort((a, b) => desc ? b.s - a.s || a.i - b.i : a.s - b.s || a.i - b.i);
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
function spearmanRankVsGames(players) {
  const scoreRanks = ranksBy(players, (p) => p.rawScore, true);
  const gameRanks = ranksBy(players, (p) => p.matchesPlayed, false);
  return pearson(scoreRanks, gameRanks);
}
var TRACKED = ["marivic", "jowinski", "jeo", "rands", "cara"];
function report(name, res) {
  console.log(`
================ ${name} ================`);
  console.log(`players=${res.players.length} matchesUsed=${res.matchesUsed} iters=${res.iters} meanGames=${res.meanGames.toFixed(2)} outSum[min=${res.outSumStats.min.toFixed(3)},max=${res.outSumStats.max.toFixed(3)},zero=${res.outSumStats.zero}]`);
  console.log("rank  name                                   net  rawScore   games  W-L(-T)");
  res.players.slice(0, 20).forEach((p, i) => {
    const wl = `${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ""}`;
    console.log(
      `${String(i + 1).padStart(3)}  ${p.display.padEnd(38)} ${String(p.networkScore).padStart(3)}  ${p.rawScore.toFixed(5)}  ${String(p.matchesPlayed).padStart(5)}  ${wl}`
    );
  });
  for (const t of TRACKED) {
    const hits = res.players.map((p, idx) => ({ p, idx })).filter(
      ({ p }) => `${p.display} ${p.firstName} ${p.lastName} ${p.username}`.toLowerCase().includes(t)
    );
    if (hits.length === 0) {
      console.log(`  tracked '${t}': NOT FOUND`);
    } else {
      for (const { p, idx } of hits) {
        const wl = `${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ""}`;
        console.log(
          `  tracked '${t}': #${idx + 1} ${p.display} (@${p.username || "?"}) net=${p.networkScore} raw=${p.rawScore.toFixed(5)} g=${p.matchesPlayed} ${wl}`
        );
      }
    }
  }
  const rho = spearmanRankVsGames(res.players);
  const top20games = res.players.slice(0, 20).reduce((s, p) => s + p.matchesPlayed, 0) / Math.min(20, res.players.length);
  const allGames = res.players.reduce((s, p) => s + p.matchesPlayed, 0) / res.players.length;
  console.log(`  Spearman \u03C1(scoreRank, gamesRank) = ${rho.toFixed(4)}   top20 meanGames=${top20games.toFixed(1)} vs all=${allGames.toFixed(1)}`);
}
var ref = computeNetworkScores(inputs);
var refByKey = new Map(ref.map((p) => [p.key, p.rawScore]));
var base = runVariant(inputs, "base", "base");
var maxDiff = 0;
for (const p of base.players) {
  const rv = refByKey.get(p.key);
  if (rv !== void 0) maxDiff = Math.max(maxDiff, Math.abs(rv - p.rawScore));
}
console.log(`
BASE engine vs computeNetworkScores: players=${base.players.length} ref=${ref.length} max|\u0394rawScore|=${maxDiff.toExponential(3)}`);
report("BASE (\u03BB=0.8, symmetric edges) \u2014 reference", base);
report("V2 (in-degree normalization, \u03BB=0.8)", runVariant(inputs, "base", "v2"));
report("V3 (\u03BB=0.45 only)", runVariant(inputs, "base", "v3"));
report("V4 (directed loser\u2192winner edges, \u03BB=0.8)", runVariant(inputs, "v4", "base"));
var v5 = runVariant(inputs, "v5", "base");
report("V5 (complementary margin-weighted opponent edges, \u03BB=0.8)", v5);
{
  const mg = base.margin;
  const samp = mg.samples.filter(Number.isFinite).sort((a, b) => a - b);
  const n = samp.length;
  const q = (p) => n ? samp[Math.min(n - 1, Math.floor(p * n))] : NaN;
  const mean = n ? samp.reduce((a, b) => a + b, 0) / n : NaN;
  const frac = (f) => n ? samp.filter(f).length / n * 100 : NaN;
  console.log(`
================ \u03BCw = |sA\u2212sB|/(sA+sB) distribution ================`);
  console.log(
    `usable matches=${base.matchesUsed}  decisive(T>0,sA\u2260sB)=${n}  ties=${mg.ties}  nonPositiveT=${mg.nonPositive}  bad=${mg.bad}`
  );
  console.log(
    `mean=${mean.toFixed(3)}  median=${q(0.5).toFixed(3)}  p10=${q(0.1).toFixed(3)}  p25=${q(0.25).toFixed(3)}  p75=${q(0.75).toFixed(3)}  p90=${q(0.9).toFixed(3)}`
  );
  console.log(
    `share \u03BCw<0.3: ${frac((x) => x < 0.3).toFixed(1)}%   0.3\u20130.6: ${frac((x) => x >= 0.3 && x < 0.6).toFixed(1)}%   \u22650.6: ${frac((x) => x >= 0.6).toFixed(1)}%`
  );
}
{
  const v5rank = new Map(v5.players.map((p, i) => [p.key, i + 1]));
  const baseRank = new Map(base.players.map((p, i) => [p.key, i + 1]));
  const ptSorted = [...v5.players].sort(
    (a, b) => b.ownPerformance - a.ownPerformance || (a.key < b.key ? -1 : 1)
  );
  const ptRank = new Map(ptSorted.map((p, i) => [p.key, i + 1]));
  const v5ByKey = new Map(v5.players.map((p) => [p.key, p]));
  const userOf = /* @__PURE__ */ new Map();
  for (const p of v5.players) if (p.username) userOf.set(p.key, p.username);
  const linkedTargets = /* @__PURE__ */ new Map();
  for (const m of inputs) {
    for (const p of [...m.teamA, ...m.teamB]) {
      if (p.username && p.linkedTo) {
        let s = linkedTargets.get(p.username);
        if (!s) linkedTargets.set(p.username, s = /* @__PURE__ */ new Set());
        s.add(p.linkedTo);
      }
    }
  }
  const detectedDuos = detectFixedDuos(inputs);
  const pairRows = [...base.teammatePairs.entries()].map(([pk, rec]) => ({ pk, ...rec })).sort((a, b) => b.games - a.games || (a.pk < b.pk ? -1 : 1));
  console.log(`
================ fixed-duo check (top teammate pairs) ================`);
  console.log(`teammate pairs seen=${pairRows.length}; showing top ${Math.min(12, pairRows.length)}`);
  const wl = (p) => p ? `${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ""}` : "?";
  for (const rec of pairRows.slice(0, 12)) {
    const p1 = v5ByKey.get(rec.k1);
    const p2 = v5ByKey.get(rec.k2);
    const u1 = userOf.get(rec.k1);
    const u2 = userOf.get(rec.k2);
    const declared = !!(u1 && u2 && linkedTargets.get(u1)?.has(u2) && linkedTargets.get(u2)?.has(u1));
    const det = detectedDuos.get(rec.pk);
    const status = declared ? "DECLARED" : det ? `detected:${det.reason}` : "\u2014";
    const mem = (k) => {
      const p = v5ByKey.get(k);
      if (!p) return `${k}:?`;
      const d = (ptRank.get(k) ?? 0) - (v5rank.get(k) ?? 0);
      return `${p.display} g${p.matchesPlayed} ${wl(p)} v5=#${v5rank.get(k)} pt=#${ptRank.get(k)} base=#${baseRank.get(k)} dPT=${d >= 0 ? "+" : ""}${d}`;
    };
    const maxD = Math.max(
      (ptRank.get(rec.k1) ?? 0) - (v5rank.get(rec.k1) ?? 0),
      (ptRank.get(rec.k2) ?? 0) - (v5rank.get(rec.k2) ?? 0)
    );
    const flag = maxD >= 15 ? "  <== rank >> performance rank" : "";
    console.log(
      `  ${rec.games}x ${p1?.display ?? rec.k1} + ${p2?.display ?? rec.k2}  [${status}${rec.games >= 8 ? " \u22658" : ""}]${flag}`
    );
    console.log(`      ${mem(rec.k1)}`);
    console.log(`      ${mem(rec.k2)}`);
  }
}
