import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('quasar', () => ({
  LocalStorage: {
    getItem: vi.fn(() => null),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('src/services/likhaClient', () => ({
  likhaClient: { request: vi.fn() },
}));

vi.mock('@likha-erp/likha-sdk', () => ({
  readItems: vi.fn(),
  readSingleton: vi.fn(),
}));

import { DuprServiceInstance } from './useDupr';
import { displayRatingColor, getRatingColor } from '../utils/playerHelpers';

describe('hide_internal_rating (DUPR compliance)', () => {
  beforeEach(() => {
    DuprServiceInstance.state.settings = null;
  });

  it('is false when unset, null, or false', () => {
    expect(DuprServiceInstance.hideInternalRating).toBe(false);
    DuprServiceInstance.state.settings = { hide_internal_rating: null } as never;
    expect(DuprServiceInstance.hideInternalRating).toBe(false);
    DuprServiceInstance.state.settings = {
      hide_internal_rating: false,
    } as never;
    expect(DuprServiceInstance.hideInternalRating).toBe(false);
  });

  it('is true when the workspace flag is set', () => {
    DuprServiceInstance.state.settings = { hide_internal_rating: true } as never;
    expect(DuprServiceInstance.hideInternalRating).toBe(true);
  });

  it('displayRatingColor neutralizes tier colors only when hidden', () => {
    DuprServiceInstance.state.settings = { hide_internal_rating: true } as never;
    expect(displayRatingColor(2100)).toBe('grey-6');
    DuprServiceInstance.state.settings = {
      hide_internal_rating: false,
    } as never;
    expect(displayRatingColor(2100)).toBe(getRatingColor(2100));
  });

  it('duprAppUrl follows the configured environment', () => {
    DuprServiceInstance.state.settings = { environment: 'production' } as never;
    expect(DuprServiceInstance.duprAppUrl).toBe('https://dashboard.dupr.com');
    DuprServiceInstance.state.settings = { environment: 'uat' } as never;
    expect(DuprServiceInstance.duprAppUrl).toBe('https://uat.dupr.gg');
  });

  it('seedRatings fills the display map without clobbering fresher data', () => {
    const svc = DuprServiceInstance;
    svc.state.ratingsMap = {};
    svc.seedRatings([{ duprId: 'ABC123', singles: 4.5, doubles: 3.8 }]);
    expect(svc.duprDoublesOf('ABC123')).toBe(3.8);
    expect(svc.duprSinglesOf('ABC123')).toBe(4.5);
    // Existing entries (e.g. from a batch fetch) win over later seeds
    svc.state.ratingsMap['XYZ789'] = { singles: null, doubles: 2.5 };
    svc.seedRatings([{ duprId: 'XYZ789', singles: 1.0, doubles: 1.0 }]);
    expect(svc.duprDoublesOf('XYZ789')).toBe(2.5);
    // Unknown / missing ids resolve to null, never to an internal rating
    expect(svc.duprDoublesOf('NOBODY')).toBeNull();
    expect(svc.duprDoublesOf(undefined)).toBeNull();
    expect(svc.duprDoublesOf('')).toBeNull();
  });
});
