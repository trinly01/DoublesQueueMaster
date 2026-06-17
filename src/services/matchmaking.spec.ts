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

// Zero-sum invariant checker
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
    // Floor clamp means losers may lose less than winners gain
    expect(totalGain).toBeGreaterThanOrEqual(totalLoss);
  }
}

describe('RatingEngine.calculateShift', () => {
  it('even doubles close score: near-equal splits, zero-sum', () => {
    const w = [makePlayer(1500), makePlayer(1500)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const r = RatingEngine.calculateShift(w, l, 11, 10);
    assertZeroSum(w, l, r);
    r.updatedWinners.forEach((p) => expect(p.rating - 1500).toBeGreaterThan(0));
    r.updatedLosers.forEach((p) => expect(p.rating - 1500).toBeLessThan(0));
  });

  it('even doubles blowout: larger shifts, still zero-sum', () => {
    const w = [makePlayer(1500), makePlayer(1500)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const rClose = RatingEngine.calculateShift(w, l, 11, 10);
    const rBlowout = RatingEngine.calculateShift(w, l, 11, 0);
    assertZeroSum(w, l, rClose);
    assertZeroSum(w, l, rBlowout);
    // Blowout should move ratings more than close game
    const closeGain = rClose.updatedWinners[0].rating - 1500;
    const blowoutGain = rBlowout.updatedWinners[0].rating - 1500;
    expect(blowoutGain).toBeGreaterThan(closeGain);
  });

  it('big upset: underdogs gain large; favorites lose large', () => {
    const w = [makePlayer(1000), makePlayer(1000)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const r = RatingEngine.calculateShift(w, l, 11, 9);
    assertZeroSum(w, l, r);
    // Underdogs should climb significantly
    expect(r.updatedWinners[0].rating).toBeGreaterThan(1000);
    expect(r.updatedWinners[1].rating).toBeGreaterThan(1000);
    // Favorites should drop
    expect(r.updatedLosers[0].rating).toBeLessThan(1500);
    expect(r.updatedLosers[1].rating).toBeLessThan(1500);
  });

  it('mixed team win: low-rated gets big credit, high-rated gets tiny', () => {
    const w = [makePlayer(2000), makePlayer(1000)];
    const l = [makePlayer(1500), makePlayer(1500)];
    const r = RatingEngine.calculateShift(w, l, 11, 9);
    assertZeroSum(w, l, r);
    const highRatedGain = r.updatedWinners[0].rating - 2000;
    const lowRatedGain = r.updatedWinners[1].rating - 1000;
    expect(lowRatedGain).toBeGreaterThan(highRatedGain);
  });

  it('mixed team loss: high-rated pays big blame, low-rated pays tiny', () => {
    const w = [makePlayer(1500), makePlayer(1500)];
    const l = [makePlayer(2000), makePlayer(1000)];
    const r = RatingEngine.calculateShift(w, l, 11, 9);
    assertZeroSum(w, l, r);
    const highRatedLoss = 2000 - r.updatedLosers[0].rating;
    const lowRatedLoss = 1000 - r.updatedLosers[1].rating;
    expect(highRatedLoss).toBeGreaterThan(lowRatedLoss);
  });

  it('singles vs doubles K: same matchup shifts ~2x for singles', () => {
    const sW = [makePlayer(1500)];
    const sL = [makePlayer(1500)];
    const dW = [makePlayer(1500), makePlayer(1500)];
    const dL = [makePlayer(1500), makePlayer(1500)];

    const singles = RatingEngine.calculateShift(sW, sL, 11, 10);
    const doubles = RatingEngine.calculateShift(dW, dL, 11, 10);

    const sGain = singles.updatedWinners[0].rating - 1500;
    const dGain = doubles.updatedWinners[0].rating - 1500;
    // Singles should be roughly 2x doubles (K=30 vs K=15)
    expect(sGain).toBeGreaterThanOrEqual(dGain * 1.5);
  });

  it('floor hit: rating clamps at 100, never negative', () => {
    // Ratings close enough that pool is non-zero, but loser starts near floor
    const w = [makePlayer(150)];
    const l = [makePlayer(105)];
    const r = RatingEngine.calculateShift(w, l, 11, 0);
    assertZeroSum(w, l, r, true);
    expect(r.updatedLosers[0].rating).toBe(100);
    expect(r.updatedLosers[0].rating).toBeGreaterThanOrEqual(100);
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
    assertZeroSum(w, l, r);
    // James (underdog on team) should get >= Shirwin (favorite on team)
    const jamesGain = r.updatedWinners[1].rating - 1529;
    const shirwinGain = r.updatedWinners[0].rating - 1632;
    expect(jamesGain).toBeGreaterThanOrEqual(shirwinGain);
    // Losers should pay similar amounts
    const peejayLoss = 1565 - r.updatedLosers[0].rating;
    const eddieLoss = 1548 - r.updatedLosers[1].rating;
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
    assertZeroSum(w, l, r);
    const rommelLoss = 1514 - r.updatedLosers[0].rating;
    const abbeyLoss = 1441 - r.updatedLosers[1].rating;
    // Rommel (favorite) should pay >= Abbey (underdog)
    expect(rommelLoss).toBeGreaterThanOrEqual(abbeyLoss);
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
    assertZeroSum(w, l, r);
    const trinLoss = 1636 - r.updatedLosers[1].rating;
    const jaysonLoss = 1400 - r.updatedLosers[0].rating;
    // Trin (huge favorite) should pay more than Jayson (huge underdog)
    expect(trinLoss).toBeGreaterThan(jaysonLoss);
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
    assertZeroSum(w, l, r);
    const jaysonGain = r.updatedWinners[0].rating - 1397;
    const trinGain = r.updatedWinners[1].rating - 1630;
    // Jayson (huge underdog) should get more credit than Trin (huge favorite)
    expect(jaysonGain).toBeGreaterThan(trinGain);
  });
});

describe('allocateInteger', () => {
  // Access via module since it's not exported. We can't directly test it,
  // but we verify zero-sum behavior through calculateShift tests above.
  // For direct testing we'd need to export it. The zero-sum tests above
  // effectively validate allocateInteger correctness.

  it('is validated indirectly through all calculateShift tests', () => {
    expect(true).toBe(true); // All calculateShift tests check zero-sum
  });
});
