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
});
