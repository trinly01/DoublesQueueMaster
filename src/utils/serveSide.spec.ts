import { describe, it, expect } from 'vitest';
import { serveCourtSign, isRightCourt } from './serveSide';

describe('serveCourtSign', () => {
  it('near half (z>0): even score → +x (right), odd → -x (left)', () => {
    expect(serveCourtSign(0, true)).toBe(1);
    expect(serveCourtSign(4, true)).toBe(1);
    expect(serveCourtSign(1, true)).toBe(-1);
    expect(serveCourtSign(3, true)).toBe(-1);
  });

  it('far half (z<0): even score → -x (right for that side), odd → +x', () => {
    expect(serveCourtSign(0, false)).toBe(-1);
    expect(serveCourtSign(4, false)).toBe(-1);
    expect(serveCourtSign(1, false)).toBe(1);
    expect(serveCourtSign(3, false)).toBe(1);
  });

  it('server and receiver are always diagonal (opposite X)', () => {
    for (const score of [0, 1, 2, 7]) {
      // receiver stands on the far half's same-parity court = opposite X
      // of the server — verified as: receiverX = -serverX in resetBall
      const serverX = 1.5 * serveCourtSign(score, true);
      expect(serverX * -1).toBeCloseTo(1.5 * serveCourtSign(score, false));
    }
  });
});

describe('isRightCourt', () => {
  it('z>0 half: +x is right', () => {
    expect(isRightCourt(1.5, true)).toBe(true);
    expect(isRightCourt(-1.5, true)).toBe(false);
  });

  it('z<0 half: -x is right', () => {
    expect(isRightCourt(-1.5, false)).toBe(true);
    expect(isRightCourt(1.5, false)).toBe(false);
  });

  it('dead-center (x=0) counts as left on either half', () => {
    expect(isRightCourt(0, true)).toBe(false);
    expect(isRightCourt(0, false)).toBe(false);
  });
});
