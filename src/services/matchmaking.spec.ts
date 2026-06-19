import { describe, it, expect } from 'vitest';
import { RatingEngine } from './matchmaking';
import type { Player } from './matchmaking';

// Helper to build a minimal player for tests
const makePlayer = (rating: number, extra: Partial<Player> = {}): Player => ({
  username: `p${rating}`,
  level: 2,
  rating,
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  ...extra,
});

// Zero-sum invariant: total winner gain == total loser loss (unless floor clamps).
function assertZeroSum(
  winners: Player[],
  losers: Player[],
  result: { updatedWinners: Player[]; updatedLosers: Player[] },
  floorExpected = false,
) {
  const totalGain = result.updatedWinners.reduce(
    (s, p, i) => s + (p.rating - winners[i].rating),
    0,
  );
  const totalLoss = result.updatedLosers.reduce(
    (s, p, i) => s + (losers[i].rating - p.rating),
    0,
  );
  if (!floorExpected) {
    expect(totalGain).toBe(totalLoss);
  } else {
    expect(totalGain).toBeGreaterThanOrEqual(totalLoss);
  }
}

describe('RatingEngine.calculateShift', () => {
  it('winners gain and losers lose (zero-sum)', () => {
    const w = [makePlayer(1500), makePlayer(1500)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const r = RatingEngine.calculateShift(w, l, 11, 10);
    assertZeroSum(w, l, r);
    r.updatedWinners.forEach((p) => expect(p.rating).toBeGreaterThan(1500));
    r.updatedLosers.forEach((p) => expect(p.rating).toBeLessThan(1500));
  });

  it('blowout moves ratings more than a close game', () => {
    const w = [makePlayer(1500), makePlayer(1500)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const rClose = RatingEngine.calculateShift(w, l, 11, 10);
    const rBlowout = RatingEngine.calculateShift(w, l, 11, 0);
    const closeGain = rClose.updatedWinners[0].rating - 1500;
    const blowoutGain = rBlowout.updatedWinners[0].rating - 1500;
    expect(blowoutGain).toBeGreaterThan(closeGain);
  });

  it('big upset: underdogs gain large; favorites lose large (zero-sum)', () => {
    const w = [makePlayer(1000), makePlayer(1000)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const r = RatingEngine.calculateShift(w, l, 11, 9);
    assertZeroSum(w, l, r);
    expect(r.updatedWinners[0].rating).toBeGreaterThan(1000);
    expect(r.updatedWinners[1].rating).toBeGreaterThan(1000);
    expect(r.updatedLosers[0].rating).toBeLessThan(1500);
    expect(r.updatedLosers[1].rating).toBeLessThan(1500);
  });

  it('mixed team win: low-rated partner gets more credit than high-rated partner', () => {
    const w = [makePlayer(2000), makePlayer(1000)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const r = RatingEngine.calculateShift(w, l, 11, 9);
    assertZeroSum(w, l, r);
    const highRatedGain = r.updatedWinners[0].rating - 2000;
    const lowRatedGain = r.updatedWinners[1].rating - 1000;
    expect(lowRatedGain).toBeGreaterThan(highRatedGain);
  });

  it('mixed team loss: soft underdog means higher-rated partner pays more, but not much more', () => {
    const w = [makePlayer(1500), makePlayer(1500)];
    const l = [makePlayer(2000), makePlayer(1000)];
    const r = RatingEngine.calculateShift(w, l, 11, 9);
    assertZeroSum(w, l, r);
    const highRatedLoss = 2000 - r.updatedLosers[0].rating;
    const lowRatedLoss = 1000 - r.updatedLosers[1].rating;
    expect(highRatedLoss).toBeGreaterThan(lowRatedLoss);
    expect(Math.abs(highRatedLoss - lowRatedLoss)).toBeLessThanOrEqual(15);
    expect(highRatedLoss).toBeGreaterThan(0);
  });

  it('per-player swing: singles (K=32) >= doubles per-player (K=48 split by 2)', () => {
    const sW = [makePlayer(1500)];
    const sL = [makePlayer(1500)];
    const dW = [makePlayer(1500), makePlayer(1500)];
    const dL = [makePlayer(1500), makePlayer(1500)];

    const singles = RatingEngine.calculateShift(sW, sL, 11, 10);
    const doubles = RatingEngine.calculateShift(dW, dL, 11, 10);

    const sGain = singles.updatedWinners[0].rating - 1500;
    const dGain = doubles.updatedWinners[0].rating - 1500;
    // Singles puts the full pool on one player; doubles splits a larger pool
    // across two, so per-player singles change is still the larger one.
    expect(sGain).toBeGreaterThanOrEqual(dGain);
  });

  it('floor hit: rating clamps at 100, never negative', () => {
    const w = [makePlayer(150)];
    const l = [makePlayer(105)];
    const r = RatingEngine.calculateShift(w, l, 11, 0);
    assertZeroSum(w, l, r, true);
    expect(r.updatedLosers[0].rating).toBe(100);
    expect(r.updatedWinners[0].rating).toBeGreaterThan(150);
  });

  // --- Real-CSV regression cases ---

  it('CSV Match 6: Shirwin+James vs Peejay+Eddie 11-4', () => {
    const w = [
      makePlayer(1632, { username: 'Shirwin' }),
      makePlayer(1529, { username: 'James' }),
    ];
    const l = [
      makePlayer(1565, { username: 'Peejay' }),
      makePlayer(1548, { username: 'Eddie' }),
    ];
    const r = RatingEngine.calculateShift(w, l, 11, 4);
    // Underdog James gets more credit than favorite Shirwin.
    const jamesGain = r.updatedWinners[1].rating - 1529;
    const shirwinGain = r.updatedWinners[0].rating - 1632;
    expect(jamesGain).toBeGreaterThan(shirwinGain);
    expect(jamesGain).toBeGreaterThan(0);
    expect(shirwinGain).toBeGreaterThan(0);
    // Soft underdog losses: higher-rated Peejay pays slightly more.
    const peejayLoss = 1565 - r.updatedLosers[0].rating;
    const eddieLoss = 1548 - r.updatedLosers[1].rating;
    expect(peejayLoss).toBeGreaterThan(eddieLoss);
    expect(Math.abs(peejayLoss - eddieLoss)).toBeLessThanOrEqual(2);
  });

  it('CSV Match 18: Dimple+Luv vs Rommel+Abbey 11-1 upset', () => {
    const w = [
      makePlayer(1469, { username: 'Dimple' }),
      makePlayer(1486, { username: 'Luv' }),
    ];
    const l = [
      makePlayer(1514, { username: 'Rommel' }),
      makePlayer(1441, { username: 'Abbey' }),
    ];
    const r = RatingEngine.calculateShift(w, l, 11, 1);
    const rommelLoss = 1514 - r.updatedLosers[0].rating;
    const abbeyLoss = 1441 - r.updatedLosers[1].rating;
    // Soft underdog losses: higher-rated Rommel pays slightly more.
    expect(rommelLoss).toBeGreaterThan(abbeyLoss);
    expect(Math.abs(rommelLoss - abbeyLoss)).toBeLessThanOrEqual(2);
    expect(rommelLoss).toBeGreaterThan(0);
  });

  it('CSV Match 28: Peejay+Shirwin vs Jayson+Trin 11-2 upset', () => {
    const w = [
      makePlayer(1542, { username: 'Peejay' }),
      makePlayer(1567, { username: 'Shirwin' }),
    ];
    const l = [
      makePlayer(1400, { username: 'Jayson' }),
      makePlayer(1636, { username: 'Trin' }),
    ];
    const r = RatingEngine.calculateShift(w, l, 11, 2);
    const trinLoss = 1636 - r.updatedLosers[1].rating;
    const jaysonLoss = 1400 - r.updatedLosers[0].rating;
    // Soft underdog losses: higher-rated Trin pays more than Jayson.
    expect(trinLoss).toBeGreaterThan(jaysonLoss);
    expect(Math.abs(trinLoss - jaysonLoss)).toBeLessThanOrEqual(8);
    expect(trinLoss).toBeGreaterThan(0);
  });

  it('CSV Match 10: Jayson+Trin vs Henri+Celine 11-2', () => {
    const w = [
      makePlayer(1397, { username: 'Jayson' }),
      makePlayer(1630, { username: 'Trin' }),
    ];
    const l = [
      makePlayer(1421, { username: 'Henri' }),
      makePlayer(1555, { username: 'Celine' }),
    ];
    const r = RatingEngine.calculateShift(w, l, 11, 2);
    const jaysonGain = r.updatedWinners[0].rating - 1397;
    const trinGain = r.updatedWinners[1].rating - 1630;
    // Underdog Jayson gets more credit than favorite Trin.
    expect(jaysonGain).toBeGreaterThan(trinGain);
    expect(jaysonGain).toBeGreaterThan(10);
    expect(trinGain).toBeGreaterThan(0);
  });

  it('anti-carry: weak partner in huge gap pair gets less credit than before, but still more than strong partner', () => {
    const w = [makePlayer(2000), makePlayer(1000)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const r = RatingEngine.calculateShift(w, l, 11, 9);
    assertZeroSum(w, l, r);
    const strongGain = r.updatedWinners[0].rating - 2000;
    const weakGain = r.updatedWinners[1].rating - 1000;
    // Even with the gap penalty, the weak partner (who overperformed vs the
    // 1500 opponents) still earns more than the strong partner.
    expect(weakGain).toBeGreaterThan(strongGain);
    // Anti-carry: the gap penalty keeps the difference reasonable. With the
    // old pure underdog model the weak partner would have taken most of the pool.
    expect(weakGain - strongGain).toBeLessThan(10);
  });
});
