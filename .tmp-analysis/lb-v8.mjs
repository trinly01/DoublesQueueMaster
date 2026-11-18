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
function hasDetectedDuo(m, detected) {
  for (const team of [m.teamA, m.teamB]) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        const key = [duoPlayerKey(team[i]), duoPlayerKey(team[j])].sort().join("|");
        if (detected.has(key)) return true;
      }
    }
  }
  return false;
}

// src/utils/ratingReplay.ts
var NON_COMPETITIVE_MODES = /* @__PURE__ */ new Set(["variety_first", "fair_balance"]);
var hasLinkedPartner = (m) => m.teamA.concat(m.teamB).some((p) => !!p.linkedTo);
var CONFIG = {
  kSingles: 36,
  // Retuned under flat-1450 seeds via scripts/exp-07-unknowns.mjs: with no
  // stored-rating warm start, K=32 converges too slowly; CV logLoss improves
  // monotonically to K≈64–96 and degrades at 128. 64 is the conservative end
  // of that plateau.
  kDoubles: 64,
  // Log margin-of-victory. Rejected under stored-rating seeds but helps under
  // flat seeds — score margin carries signal while ratings are still forming.
  // 0.15 is the conservative end of the helpful range (0.15–0.6, exp-07).
  marginWeight: 0.15,
  partnerGapFactor: 0.5,
  lossUnderdogBlend: 1,
  maxPartnerRatio: 2,
  ratingFloor: 100,
  // 538-style autocorrelation correction scale. Near-neutral under flat seeds
  // (exp-07: ±0.0002 logLoss across 0–2200) but kept — it guards against
  // favourite-streak inflation at zero cost.
  autocorrScale: 1e3,
  // Iterated convergence: number of forward passes for the ranking replay.
  // Retuned under flat seeds via scripts/exp-07-unknowns.mjs holdout test
  // (train 80% / predict frozen last 20%): 3→0.6866, 5→0.6850, 8→0.6836,
  // 12→0.6826. Iteration generalizes — it's not just fitting history.
  // 8 captures most of the gain without the 12+ spread-inflation risk.
  rankingPasses: 8,
  // Bayesian shrinkage: pulls low-game players' ratings toward their seed.
  // shrunk = initialRating + (rating - initialRating) * n / (n + C)
  // C=12 means a player needs ~12 games before their earned rating change is
  // weighted equally with the seed. Prevents 3-game players from outranking
  // 80-game veterans. Tuned via scripts/exp-02-seeding.mjs.
  shrinkagePriorWeight: 12
};
function expected(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}
function teamRating(players) {
  if (players.length === 0) return 1500;
  return players.reduce((s, p) => s + (p.rating || 1500), 0) / players.length;
}
function allocateInteger(total, weights) {
  const sum = weights.reduce((s, w) => s + w, 0);
  const norm = sum > 0 ? weights.map((w) => w / sum) : weights.map(() => 1 / weights.length);
  const raw = norm.map((n) => n * total);
  const floors = raw.map((r) => Math.floor(r));
  const remainder = total - floors.reduce((s, f) => s + f, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder; k++) result[order[k % order.length].i] += 1;
  return result;
}
function capWeights(weights) {
  const maxRatio = CONFIG.maxPartnerRatio;
  if (weights.length < 2 || maxRatio <= 0) return weights;
  const max = Math.max(...weights);
  if (max <= 0) return weights;
  const minAllowed = max / maxRatio;
  return weights.map((w) => Math.max(w, minAllowed));
}
function calculateShift(winners, losers, scoreW, scoreL) {
  const ratingW = teamRating(winners);
  const ratingL = teamRating(losers);
  const margin = Math.abs(scoreW - scoreL);
  const multiplier = 1 + CONFIG.marginWeight * Math.log(1 + margin);
  const K = winners.length === 1 ? CONFIG.kSingles : CONFIG.kDoubles;
  const expectedW = expected(ratingW, ratingL);
  const ratingDiff = ratingW - ratingL;
  const autoCorrDenom = 1 + ratingDiff / CONFIG.autocorrScale;
  const autoCorr = autoCorrDenom > 0.1 ? 1 / autoCorrDenom : 10;
  const pool = Math.round(K * multiplier * autoCorr * (1 - expectedW));
  if (pool <= 0) {
    return {
      winnerGains: winners.map(() => 0),
      loserLosses: losers.map(() => 0)
    };
  }
  const wWeights = winners.map((p, i) => {
    const base = 1 - expected(p.rating, ratingL);
    const partner = winners[(i + 1) % winners.length];
    const gap = Math.abs(partner.rating - p.rating);
    const weaker = p.rating < partner.rating;
    const penalty = weaker ? Math.max(0.1, 1 - CONFIG.partnerGapFactor * gap / 400) : 1;
    return base * penalty;
  });
  const lWeights = losers.map((p) => {
    const e = expected(p.rating, ratingW);
    return 1 - CONFIG.lossUnderdogBlend + CONFIG.lossUnderdogBlend * e;
  });
  const winnerGains = allocateInteger(pool, capWeights(wWeights));
  const loserLosses = allocateInteger(pool, capWeights(lWeights));
  return { winnerGains, loserLosses };
}
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
function seedRatingFromPlayer() {
  return 1450;
}
function computeReliability(ratedGames) {
  const { provisionalThreshold } = CLUB_RANKING_CONFIG;
  const C = CONFIG.shrinkagePriorWeight;
  const reliability = Math.min(1, ratedGames / (ratedGames + C));
  const provisional = ratedGames < provisionalThreshold;
  const gamesToReliable = Math.max(0, provisionalThreshold - ratedGames);
  return { reliability, provisional, gamesToReliable };
}
function replayRankingPass(matches, seedOverrides, includeNonCompetitive = false, detectedDuos = /* @__PURE__ */ new Map()) {
  const players = {};
  const hydrate = (arr) => arr.map((p) => {
    const key = playerIdentityKey(p);
    if (!players[key]) {
      const seed = seedOverrides?.get(key) ?? seedRatingFromPlayer();
      const initialRating = seedRatingFromPlayer();
      const { reliability, provisional, gamesToReliable } = computeReliability(0);
      players[key] = {
        username: p.username || key,
        name: p.name || p.firstName || p.username || "",
        firstName: p.firstName || "",
        lastName: p.lastName || "",
        rating: seed,
        initialRating,
        matchesPlayed: 0,
        ratedMatchesPlayed: 0,
        wins: 0,
        losses: 0,
        avatar: p.avatar || "",
        reliability,
        provisional,
        gamesToReliable
      };
    }
    return players[key];
  });
  for (const m of matches) {
    const tA = hydrate(m.teamA).filter(Boolean);
    const tB = hydrate(m.teamB).filter(Boolean);
    if (tA.length === 0 || tB.length === 0) continue;
    if (m.teamAScore === m.teamBScore) continue;
    if (hasLinkedPartner(m) || hasDetectedDuo(m, detectedDuos)) continue;
    const aWon = m.teamAScore > m.teamBScore;
    const winners = aWon ? tA : tB;
    const losers = aWon ? tB : tA;
    const sW = aWon ? m.teamAScore : m.teamBScore;
    const sL = aWon ? m.teamBScore : m.teamAScore;
    const isNonCompetitive = !includeNonCompetitive && NON_COMPETITIVE_MODES.has(m.matchmakingMode || "");
    if (isNonCompetitive) {
      winners.forEach((p) => {
        p.matchesPlayed += 1;
        p.wins += 1;
        const r = computeReliability(p.ratedMatchesPlayed);
        p.reliability = r.reliability;
        p.provisional = r.provisional;
        p.gamesToReliable = r.gamesToReliable;
      });
      losers.forEach((p) => {
        p.matchesPlayed += 1;
        p.losses += 1;
        const r = computeReliability(p.ratedMatchesPlayed);
        p.reliability = r.reliability;
        p.provisional = r.provisional;
        p.gamesToReliable = r.gamesToReliable;
      });
      continue;
    }
    const { winnerGains, loserLosses } = calculateShift(
      winners,
      losers,
      sW,
      sL
    );
    winners.forEach((p, i) => {
      p.rating = Math.max(CONFIG.ratingFloor, p.rating + winnerGains[i]);
      p.matchesPlayed += 1;
      p.ratedMatchesPlayed += 1;
      p.wins += 1;
      const r = computeReliability(p.ratedMatchesPlayed);
      p.reliability = r.reliability;
      p.provisional = r.provisional;
      p.gamesToReliable = r.gamesToReliable;
    });
    losers.forEach((p, i) => {
      p.rating = Math.max(CONFIG.ratingFloor, p.rating - loserLosses[i]);
      p.matchesPlayed += 1;
      p.ratedMatchesPlayed += 1;
      p.losses += 1;
      const r = computeReliability(p.ratedMatchesPlayed);
      p.reliability = r.reliability;
      p.provisional = r.provisional;
      p.gamesToReliable = r.gamesToReliable;
    });
  }
  return players;
}
function replayMatchesForRanking(matches, includeNonCompetitive = false) {
  const sorted = [...matches].sort((a, b) => {
    const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    if (ta !== tb) return ta - tb;
    const ka = a.matchKey || "";
    const kb = b.matchKey || "";
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const detectedDuos = detectFixedDuos(sorted);
  let result = replayRankingPass(
    sorted,
    void 0,
    includeNonCompetitive,
    detectedDuos
  );
  for (let pass = 1; pass < CONFIG.rankingPasses; pass++) {
    const seedOverrides = /* @__PURE__ */ new Map();
    for (const [key, p] of Object.entries(result)) {
      seedOverrides.set(key, p.rating);
    }
    result = replayRankingPass(
      sorted,
      seedOverrides,
      includeNonCompetitive,
      detectedDuos
    );
  }
  const C = CONFIG.shrinkagePriorWeight;
  for (const p of Object.values(result)) {
    const n = p.ratedMatchesPlayed;
    if (n > 0 && C > 0) {
      const shrunk = p.initialRating + (p.rating - p.initialRating) * (n / (n + C));
      p.rating = Math.round(shrunk);
    }
  }
  return result;
}

// scripts/lb-v8.mts
var CLUB = "22e52ef0-bf60-4bd1-bea8-ef66193edf35";
var BASE = "https://api.dinkmatch.club";
var SHRINKAGE_C = 12;
var MAX_ITERS = 500;
var EPSILON = 1e-10;
var KAPPA = 0.4;
var S_SCALE = 1;
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
var rawMatches = fetched.data || [];
console.log(`fetched ${rawMatches.length} completed_match rows (all modes \u2014 includeNonCompetitive=true dataset)`);
var mapSide = (arr = []) => (arr || []).map((p) => ({
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
var inputs = rawMatches.map((m) => ({
  teamAScore: m.team_a_score,
  teamBScore: m.team_b_score,
  matchKey: m.match_key,
  completedAt: m.completed_at,
  matchmakingMode: m.meta?.matchmakingMode,
  teamA: mapSide(m.team_a),
  teamB: mapSide(m.team_b)
}));
var orderedForRatings = [...inputs].sort((a, b) => {
  const ta = a.completedAt || "";
  const tb = b.completedAt || "";
  if (ta !== tb) return ta < tb ? -1 : 1;
  const ka = a.matchKey || "";
  const kb = b.matchKey || "";
  return ka < kb ? -1 : ka > kb ? 1 : 0;
});
var ratingAgg = /* @__PURE__ */ new Map();
for (const m of orderedForRatings) {
  const seen = /* @__PURE__ */ new Set();
  for (const p of [...m.teamA, ...m.teamB]) {
    const key = playerIdentityKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    let rec = ratingAgg.get(key);
    if (!rec) ratingAgg.set(key, rec = { vals: [] });
    if (typeof p.rating === "number" && Number.isFinite(p.rating)) {
      rec.vals.push(p.rating);
      rec.latest = p.rating;
    }
  }
}
var replayed = {};
var replayOk = true;
try {
  replayed = replayMatchesForRanking(inputs, true);
  console.log(`replayMatchesForRanking: ${Object.keys(replayed).length} players`);
} catch (e) {
  replayOk = false;
  console.log(`replayMatchesForRanking FAILED: ${e.message} \u2014 proceeding with sources (a)/(b) only`);
}
var matchPerformance = (own, opp) => {
  if (own === opp) return { perf: 0.5, outcome: "tie" };
  const total = own + opp;
  const mu = total > 0 ? (own - opp) / total : 0;
  return own > opp ? { perf: 1 + 0.25 * mu, outcome: "win" } : { perf: 0.25 * -mu, outcome: "loss" };
};
var sideKeys = (team) => {
  const out = /* @__PURE__ */ new Map();
  for (const p of team) {
    const k = playerIdentityKey(p);
    if (!out.has(k)) out.set(k, p);
  }
  return out;
};
function runVariant(matches, opts) {
  const accs = /* @__PURE__ */ new Map();
  const accFor = (key, p) => {
    let a = accs.get(key);
    if (!a) {
      a = {
        key,
        username: "",
        name: "",
        firstName: "",
        lastName: "",
        games: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        perfSum: 0,
        credit: /* @__PURE__ */ new Map()
      };
      accs.set(key, a);
    }
    if (p.username) a.username = p.username;
    if (p.name) a.name = p.name;
    if (p.firstName) a.firstName = p.firstName;
    if (p.lastName) a.lastName = p.lastName;
    return a;
  };
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
    const mapA = sideKeys(m.teamA);
    const mapB = sideKeys(m.teamB);
    if (mapA.size === 0 || mapB.size === 0) continue;
    let collision = false;
    for (const k of mapB.keys()) if (mapA.has(k)) {
      collision = true;
      break;
    }
    if (collision) continue;
    const sideA = [...mapA.entries()].map(([key, p]) => ({
      key,
      acc: accFor(key, p),
      rating: typeof p.rating === "number" ? p.rating : void 0
    }));
    const sideB = [...mapB.entries()].map(([key, p]) => ({
      key,
      acc: accFor(key, p),
      rating: typeof p.rating === "number" ? p.rating : void 0
    }));
    const participants = [...sideA, ...sideB];
    const n = participants.length;
    if (n < 2) continue;
    matchesUsed++;
    const edgeW = 1 / (n - 1);
    const sideOut = {
      A: matchPerformance(m.teamAScore, m.teamBScore),
      B: matchPerformance(m.teamBScore, m.teamAScore)
    };
    for (const [tag, members] of [["A", sideA], ["B", sideB]]) {
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
        let w = from === sideA[0] || sideA.includes(from) ? sideB.includes(to) ? oppW.A : edgeW : sideA.includes(to) ? oppW.B : edgeW;
        if (opts.surpriseEdges && w > 0) {
          const rs = from.rating;
          const rt = to.rating;
          const u = typeof rs === "number" && typeof rt === "number" ? Math.max(-1, Math.min(1, (rs - rt) / 800)) : 0;
          w = w * (1 + KAPPA * u);
        }
        if (w > 0) from.acc.credit.set(to.key, (from.acc.credit.get(to.key) || 0) + w);
      }
    }
  }
  const players = [...accs.values()];
  if (players.length === 0) return { players: [], matchesUsed, iters: 0, priorMean: 0 };
  let perfMeanSum = 0;
  for (const p of players) perfMeanSum += p.perfSum / p.games;
  const priorMean = perfMeanSum / players.length;
  const pTilde = /* @__PURE__ */ new Map();
  const prior = /* @__PURE__ */ new Map();
  for (const p of players) {
    const pt = Math.max(0, (p.perfSum + SHRINKAGE_C * priorMean) / (p.games + SHRINKAGE_C));
    pTilde.set(p.key, pt);
    const q = opts.priorQ?.get(p.key) ?? priorMean;
    prior.set(p.key, (p.perfSum + SHRINKAGE_C * q) / (p.games + SHRINKAGE_C));
  }
  const outSums = /* @__PURE__ */ new Map();
  for (const p of players) {
    let s = 0;
    for (const w of p.credit.values()) s += w;
    outSums.set(p.key, s);
  }
  const r = /* @__PURE__ */ new Map();
  for (const p of players) r.set(p.key, prior.get(p.key) ?? 0);
  const meanG = players.reduce((sm, pp) => sm + pp.games, 0) / players.length;
  const lastRelSoS = /* @__PURE__ */ new Map();
  let iters = 0, converged = false;
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    iters = iter + 1;
    const inflow = /* @__PURE__ */ new Map();
    for (const p of players) {
      const os = outSums.get(p.key) ?? 0;
      if (os <= 0) continue;
      const f = (r.get(p.key) ?? 0) / os;
      for (const [to, w] of p.credit) inflow.set(to, (inflow.get(to) || 0) + w * f);
    }
    let maxDelta = 0;
    if (opts.relSoSOmega !== void 0) {
      let sumInfl = 0, sumG = 0;
      for (const p of players) {
        sumInfl += inflow.get(p.key) || 0;
        sumG += p.games;
      }
      const phiBar = sumG > 0 ? sumInfl / sumG : 0;
      const CF = opts.relSoSCF ?? 12;
      for (const p of players) {
        const infl = inflow.get(p.key) || 0;
        const phiHat = (infl + CF * phiBar) / (p.games + CF);
        const relSoS = phiBar > 1e-12 ? phiHat / phiBar : 1;
        lastRelSoS.set(p.key, relSoS);
        const next = (prior.get(p.key) ?? 0) * Math.pow(Math.max(0.05, relSoS), opts.relSoSOmega);
        maxDelta = Math.max(maxDelta, Math.abs(next - (r.get(p.key) ?? 0)));
        r.set(p.key, next);
      }
    } else {
      const lamCap = opts.lambdaCap ?? 0.8;
      for (const p of players) {
        const lam = lamCap * p.games / (p.games + SHRINKAGE_C);
        let infl = inflow.get(p.key) || 0;
        if (opts.flowPerGameK) infl = infl / Math.max(1, p.games) * opts.flowPerGameK;
        else if (opts.flowGamesNorm) infl = infl * (meanG / Math.max(1, p.games));
        const next = (1 - lam) * (prior.get(p.key) ?? 0) + lam * infl;
        maxDelta = Math.max(maxDelta, Math.abs(next - (r.get(p.key) ?? 0)));
        r.set(p.key, next);
      }
    }
    if (maxDelta < EPSILON) {
      converged = true;
      break;
    }
  }
  let rMax = 0;
  for (const p of players) rMax = Math.max(rMax, r.get(p.key) ?? 0);
  const result = players.map((p) => {
    const raw = r.get(p.key) ?? 0;
    const pt = pTilde.get(p.key) ?? 0;
    const lam = (opts.lambdaCap ?? 0.8) * p.games / (p.games + SHRINKAGE_C);
    return {
      key: p.key,
      display: p.name || p.firstName || p.username || p.key,
      username: p.username,
      matchesPlayed: p.games,
      wins: p.wins,
      losses: p.losses,
      ties: p.ties,
      networkScore: rMax > 0 ? Math.round(100 * raw / rMax) : 0,
      rawScore: raw,
      ownPerformance: pt,
      priorScore: prior.get(p.key) ?? 0,
      relSoS: lastRelSoS.get(p.key),
      networkFlow: opts.relSoSOmega !== void 0 ? Math.max(0, raw - (prior.get(p.key) ?? 0)) : Math.max(0, raw - (1 - lam) * pt)
    };
  });
  result.sort((a, b) => {
    if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
    if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
    return a.display < b.display ? -1 : a.display > b.display ? 1 : 0;
  });
  const nanCount = result.filter((p) => !Number.isFinite(p.rawScore)).length;
  const uniqScores = new Set(result.map((p) => p.networkScore)).size;
  return { players: result, matchesUsed, iters, converged, priorMean, nanCount, uniqScores };
}
function buildQ(source, playerKeys, priorMeanForQ, replayOverride, aggOverride) {
  const ratingOf = /* @__PURE__ */ new Map();
  const replaySrc = replayOverride ?? replayed;
  const aggSrc = aggOverride ?? ratingAgg;
  for (const key of playerKeys) {
    if (source === "replay") {
      const rv = replaySrc[key]?.rating;
      if (typeof rv === "number" && Number.isFinite(rv)) ratingOf.set(key, rv);
    } else {
      const agg = aggSrc.get(key);
      if (agg && agg.vals.length) {
        if (source === "latest") ratingOf.set(key, agg.latest ?? agg.vals[agg.vals.length - 1]);
        else ratingOf.set(key, agg.vals.reduce((a, b) => a + b, 0) / agg.vals.length);
      }
    }
  }
  const rated = [...ratingOf.values()];
  const rBar = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
  const q = /* @__PURE__ */ new Map();
  let missing = 0;
  for (const key of playerKeys) {
    const ri = ratingOf.get(key);
    if (ri === void 0) {
      q.set(key, priorMeanForQ);
      missing++;
      continue;
    }
    const E = 1 / (1 + Math.pow(10, (rBar - ri) / 400));
    const qv = Math.max(0, Math.min(1.3, priorMeanForQ + S_SCALE * (E - 0.5)));
    q.set(key, qv);
  }
  return { q, ratingOf, rBar, missing, ratedCount: rated.length };
}
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
var spearman = (players) => pearson(ranksBy(players, (p) => p.rawScore), ranksBy(players, (p) => p.matchesPlayed));
var TRACKED = ["jeo", "shirwin", "atthan", "sandro", "juha", "trin", "marivic", "jowinski", "cara", "ednalyn"];
function report(name, res, v6rank2) {
  const players = res.players;
  console.log(`
================ ${name} ================`);
  console.log(
    `players=${players.length} matchesUsed=${res.matchesUsed} iters=${res.iters} converged=${res.converged} priorMean=${res.priorMean.toFixed(4)} NaN=${res.nanCount} uniqNetScores=${res.uniqScores}`
  );
  console.log("rank  name                                   net  rawScore   games  W-L");
  players.slice(0, 15).forEach((p, i) => {
    console.log(
      `${String(i + 1).padStart(3)}  ${p.display.padEnd(38)} ${String(p.networkScore).padStart(3)}  ${p.rawScore.toFixed(5)}  ${String(p.matchesPlayed).padStart(5)}  ${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ""}`
    );
  });
  console.log(`  Spearman \u03C1(scoreRank, gamesRank) = ${spearman(players).toFixed(4)}`);
  for (const t of TRACKED) {
    const hits = players.filter(
      (p) => `${p.display} ${p.username} ${p.key}`.toLowerCase().includes(t)
    );
    for (const p of hits) {
      const idx = players.findIndex((q) => q.key === p.key) + 1;
      console.log(
        `  tracked '${t}': #${idx} ${p.display} (@${p.username || "?"}) net=${p.networkScore} g=${p.matchesPlayed} ${p.wins}-${p.losses}`
      );
    }
  }
  let moved = 0;
  const moverRows = [];
  players.forEach((p, i) => {
    const v62 = v6rank2.get(p.key);
    if (v62 === void 0) return;
    const d = Math.abs(i + 1 - v62);
    if (d > 10) {
      moved++;
      moverRows.push({ d, name: p.display, v6: v62, v8: i + 1 });
    }
  });
  moverRows.sort((a, b) => b.d - a.d);
  console.log(`  players with |\u0394rank|>10 vs V6: ${moved}`);
  for (const m of moverRows.slice(0, 10)) {
    console.log(`    ${m.name}: v6=#${m.v6} -> #${m.v8} (\u0394${m.d})`);
  }
}
var v6 = runVariant(inputs, { surpriseEdges: false, priorQ: null });
console.log(`
V6 baseline: players=${v6.players.length} matchesUsed=${v6.matchesUsed} priorMean=${v6.priorMean.toFixed(4)}`);
var allKeys = new Set(v6.players.map((p) => p.key));
var v6rank = new Map(v6.players.map((p, i) => [p.key, i + 1]));
var qSources = {};
for (const src of ["latest", "mean", "replay"]) {
  if (src === "replay" && !replayOk) {
    qSources[src] = { q: /* @__PURE__ */ new Map(), ratingOf: /* @__PURE__ */ new Map(), rBar: 0, missing: allKeys.size, ratedCount: 0 };
    continue;
  }
  const b = buildQ(src, allKeys, v6.priorMean);
  qSources[src] = b;
  const rv = [...b.ratingOf.values()].sort((a, c) => a - c);
  const qv = [...b.q.values()].sort((a, c) => a - c);
  console.log(
    `
[source ${src}] rating_i: n=${b.ratingOf.size}/${allKeys.size} rated, missing\u2192neutral=${b.missing}, r\u0304=${b.rBar.toFixed(1)} rating[min=${rv[0] ?? "\u2014"}, med=${rv[Math.floor(rv.length / 2)] ?? "\u2014"}, max=${rv[rv.length - 1] ?? "\u2014"}] q[min=${qv[0]?.toFixed(3) ?? "\u2014"}, med=${qv[Math.floor(qv.length / 2)]?.toFixed(3) ?? "\u2014"}, max=${qv[qv.length - 1]?.toFixed(3) ?? "\u2014"}]`
  );
}
if (replayOk) {
  const covKeys = new Set(Object.keys(replayed));
  const graphOnly = [...allKeys].filter((k) => !covKeys.has(k));
  console.log(`replay coverage: ${covKeys.size} replayed players; graph keys missing from replay (\u2192neutral q): ${graphOnly.length}`);
  if (graphOnly.length) console.log(`  e.g. ${graphOnly.slice(0, 8).map((k) => k.slice(0, 40)).join(" | ")}`);
}
report("V6 BASELINE (V5 edges + adaptive \u03BB, p\u0303 teleport)", v6, v6rank);
report("V8a (teleport=latest + surprise edges)", runVariant(inputs, { surpriseEdges: true, priorQ: qSources.latest.q }), v6rank);
report("V8b (teleport=mean + surprise edges)", runVariant(inputs, { surpriseEdges: true, priorQ: qSources.mean.q }), v6rank);
if (replayOk) report("V8c (teleport=replayed + surprise edges)", runVariant(inputs, { surpriseEdges: true, priorQ: qSources.replay.q }), v6rank);
report("V8d (surprise edges only, p\u0303 teleport)", runVariant(inputs, { surpriseEdges: true, priorQ: null }), v6rank);
var NON_COMP = /* @__PURE__ */ new Set(["fair_balance", "variety_first"]);
var compInputs = inputs.filter((m) => !NON_COMP.has(m.matchmakingMode || ""));
console.log(`
##### COMPETITIVE-ONLY: ${compInputs.length} matches #####`);
var compV6 = runVariant(compInputs, { surpriseEdges: false, priorQ: null });
var compKeys = new Set(compV6.players.map((p) => p.key));
console.log(`compV6: players=${compV6.players.length} priorMean=${compV6.priorMean.toFixed(4)}`);
var compReplayed = {};
try {
  compReplayed = replayMatchesForRanking(compInputs, false);
  console.log(`comp replay: ${Object.keys(compReplayed).length} players`);
} catch (e) {
  console.log(`comp replay FAILED: ${e.message}`);
}
var compQ = buildQ("replay", compKeys, compV6.priorMean, compReplayed);
var compQLatest = buildQ("latest", compKeys, compV6.priorMean);
var COMP_TRACKED = ["jeo", "trin", "angelo", "obal", "shirwin", "atthan", "sandro", "juha", "marivic", "jowinski", "cara", "ednalyn", "mark", "rands", "aira", "jaymar", "cyyy"];
function compReport(name, res) {
  const players = res.players;
  console.log(`
================ ${name} ================`);
  console.log(`players=${players.length} iters=${res.iters} converged=${res.converged} NaN=${res.nanCount} uniqNet=${res.uniqScores} rho=${spearman(players).toFixed(4)}`);
  players.slice(0, 15).forEach((p, i) => {
    const wl = `${p.wins}-${p.losses}${p.ties ? `-${p.ties}t` : ""}`;
    console.log(` ${String(i + 1).padStart(3)}  ${p.display.padEnd(36)} net=${String(p.networkScore).padStart(3)} raw=${p.rawScore.toFixed(3)} g=${String(p.matchesPlayed).padStart(3)} ${wl} prior=${p.priorScore.toFixed(3)}${p.relSoS !== void 0 ? ` relSoS=${p.relSoS.toFixed(2)}` : ""}`);
  });
  for (const t of COMP_TRACKED) {
    const hits = players.filter((p) => `${p.display} ${p.username} ${p.key}`.toLowerCase().includes(t));
    for (const p of hits) {
      const idx = players.findIndex((q) => q.key === p.key) + 1;
      console.log(`  tracked '${t}': #${idx} ${p.display} g=${p.matchesPlayed} ${p.wins}-${p.losses} net=${p.networkScore} prior=${p.priorScore.toFixed(3)} flow=${p.networkFlow.toFixed(3)}${p.relSoS !== void 0 ? ` relSoS=${p.relSoS.toFixed(2)}` : ""}`);
    }
  }
}
var prodV8c = runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q });
compReport("PROD-V8c competitive (current live algo)", prodV8c);
compReport("V8a-competitive (latest-rating prior + surprise edges)", runVariant(compInputs, { surpriseEdges: true, priorQ: compQLatest.q }));
compReport("V9a lambda-cap=0.6 + rating", runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, lambdaCap: 0.6 }));
compReport("V9b flow/games (meanG norm) + rating", runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, flowGamesNorm: true }));
compReport("V9d lambda0.6 + flow/games + rating", runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, lambdaCap: 0.6, flowGamesNorm: true }));
for (const K of [8, 12, 16, 20]) {
  compReport(`V10 flowPerGame K=${K} + rating`, runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, flowPerGameK: K }));
}
for (const cap of [0.25, 0.3, 0.35, 0.4, 0.5]) {
  compReport(`V11 lambdaCap=${cap} + rating`, runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, lambdaCap: cap }));
}
for (const w of [0.3, 0.5, 0.7]) {
  compReport(`V12 relSoS omega=${w} + rating`, runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, relSoSOmega: w }));
}
for (const cf of [30, 50]) {
  compReport(`V12b relSoS w=0.3 CF=${cf} + rating`, runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, relSoSOmega: 0.3, relSoSCF: cf }));
}
compReport("V13 relSoS w=0.3 CF=30 + LATEST-rating prior (career)", runVariant(compInputs, { surpriseEdges: true, priorQ: compQLatest.q, relSoSOmega: 0.3, relSoSCF: 30 }));
compReport("V13b relSoS w=0.3 CF=30 + REPLAY prior (control)", runVariant(compInputs, { surpriseEdges: true, priorQ: compQ.q, relSoSOmega: 0.3, relSoSCF: 30 }));
{
  const rated = Object.values(compReplayed);
  const sorted = [...rated].sort((a, b) => b.rating - a.rating || b.ratedMatchesPlayed - a.ratedMatchesPlayed || (b.matchesPlayed > 0 ? b.wins / b.matchesPlayed : 0) - (a.matchesPlayed > 0 ? a.wins / a.matchesPlayed : 0) || a.username.localeCompare(b.username));
  console.log(`
================ RATING-BOARD (rankClubPlayers / DUPR-style) ================`);
  console.log("rank  name                                   rating  games  W-L   prov");
  sorted.slice(0, 20).forEach((p, i) => {
    console.log(` ${String(i + 1).padStart(3)}  ${(p.name || p.firstName || p.username).padEnd(38)} ${String(Math.round(p.rating)).padStart(5)}  ${String(p.matchesPlayed).padStart(3)}  ${p.wins}-${p.losses}  ${p.provisional ? "PROV" : ""}`);
  });
  for (const t of COMP_TRACKED) {
    const p = sorted.find((q) => `${q.name} ${q.username}`.toLowerCase().includes(t));
    if (p) {
      const idx = sorted.indexOf(p) + 1;
      console.log(`  rating-board '${t}': #${idx} ${p.name || p.username} rating=${Math.round(p.rating)} g=${p.matchesPlayed} ${p.wins}-${p.losses}${p.provisional ? " PROV" : ""}`);
    }
  }
}
{
  const byPrior = [...prodV8c.players].sort((a, b) => b.priorScore - a.priorScore || b.matchesPlayed - a.matchesPlayed);
  console.log("\n================ DIAG prior-only (perf+rating, no network) ================");
  byPrior.slice(0, 15).forEach((p, i) => {
    console.log(` ${String(i + 1).padStart(3)}  ${p.display.padEnd(36)} prior=${p.priorScore.toFixed(3)} g=${String(p.matchesPlayed).padStart(3)} ${p.wins}-${p.losses}`);
  });
  for (const t of COMP_TRACKED) {
    const p = byPrior.find((q) => `${q.display} ${q.username} ${q.key}`.toLowerCase().includes(t));
    if (p) {
      const idx = byPrior.indexOf(p) + 1;
      console.log(`  prior-only '${t}': #${idx} ${p.display} prior=${p.priorScore.toFixed(3)}`);
    }
  }
}
var pairCount = 0;
var ratedPairs = 0;
var sumAbsU = 0;
{
  const ordered = [...inputs].sort((a, b) => (a.completedAt || "") < (b.completedAt || "") ? -1 : 1);
  for (const m of ordered) {
    for (const pa of m.teamA) for (const pb of m.teamB) {
      pairCount++;
      if (typeof pa.rating === "number" && typeof pb.rating === "number") {
        ratedPairs++;
        sumAbsU += Math.abs(Math.max(-1, Math.min(1, (pa.rating - pb.rating) / 800)));
      }
    }
  }
}
console.log(`
\xFB stats: cross-side ordered pairs=${pairCount} bothRated=${ratedPairs} mean|\xFB|=${ratedPairs ? (sumAbsU / ratedPairs).toFixed(3) : "\u2014"}`);
console.log("(\u03BA=0.4 \u2192 mean edge multiplier deviation \u2248 " + (ratedPairs ? (sumAbsU / ratedPairs * KAPPA).toFixed(3) : "\u2014") + ")");
console.log("DONE");
