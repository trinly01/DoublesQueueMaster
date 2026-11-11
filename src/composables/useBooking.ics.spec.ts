import { describe, it, expect, vi } from 'vitest';

vi.mock('src/services/likhaClient', () => ({
  likhaClient: { request: vi.fn() },
  LIKHA_URL: 'http://localhost',
}));
vi.mock('@likha-erp/likha-sdk', () => ({
  readItems: vi.fn(), createItem: vi.fn(), updateItem: vi.fn(),
  uploadFiles: vi.fn(), readMe: vi.fn(),
}));
vi.mock('quasar', () => ({ LocalStorage: { getItem: vi.fn(), set: vi.fn() } }));
vi.mock('src/composables/useNotify', () => ({ useNotify: () => ({ notify: vi.fn() }) }));

import { bookingIcs, bookingGoogleUrl, type BookBookingDetail } from './useBooking';

const NAMES = new Map([['c1', 'Arena Court 1']]);

function mkBooking(slots: Partial<BookBookingDetail['slots'] extends (infer T)[] | undefined ? T : never>[]): BookBookingDetail {
  return {
    id: 'bk-1', ref: 'BK-TEST-1',
    tenant: { id: 't1', name: 'Test Arena', timezone: 'Asia/Manila', address: '123 Main St' },
    slots: slots.map((s, i) => ({
      id: `s${i}`, booking: 'bk-1', court: 'c1', date: '2026-11-23',
      start_time: '18:00:00', end_time: '19:00:00', duration_minutes: 60,
      price: 500, status: 'confirmed', held_until: null, ...s,
    })) as BookBookingDetail['slots'],
  } as BookBookingDetail;
}

describe('bookingIcs', () => {
  it('merges contiguous slots into one event and splits on gaps', () => {
    const ics = bookingIcs(mkBooking([
      { start_time: '18:00:00', end_time: '19:00:00' },
      { start_time: '19:00:00', end_time: '20:00:00' },
      { start_time: '21:00:00', end_time: '22:00:00', status: 'held' },
    ]), NAMES)!;
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('STATUS:TENTATIVE');
    // 18:00–20:00 Manila = 10:00–12:00 UTC
    expect(ics).toContain('DTSTART:20261123T100000Z');
    expect(ics).toContain('DTEND:20261123T120000Z');
    // held slot 21:00–22:00 Manila = 13:00–14:00 UTC
    expect(ics).toContain('DTSTART:20261123T130000Z');
  });

  it('skips cancelled slots; returns null when nothing bookable', () => {
    expect(bookingIcs(mkBooking([{ status: 'cancelled' }]), NAMES)).toBeNull();
    const ics = bookingIcs(mkBooking([
      { status: 'cancelled' },
      { start_time: '09:00:00', end_time: '10:00:00' },
    ]), NAMES)!;
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
  });

  it('includes venue, ref, alarms and booking URL', () => {
    const ics = bookingIcs(mkBooking([{ start_time: '18:00:00', end_time: '19:00:00' }]), NAMES)!;
    expect(ics).toContain('Court booking — Arena Court 1 · Test Arena');
    expect(ics).toContain('Ref: BK-TEST-1');
    expect(ics).toContain('LOCATION:123 Main St');
    expect(ics).toContain('TRIGGER:-PT1H');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('dinkmatch.club/#/book/booking/bk-1');
  });
});

describe('bookingGoogleUrl', () => {
  it('builds a template URL with UTC dates', () => {
    const url = bookingGoogleUrl(mkBooking([{ start_time: '18:00:00', end_time: '19:00:00' }]), NAMES)!;
    expect(url).toContain('calendar.google.com/calendar/render');
    expect(url).toContain('dates=20261123T100000Z%2F20261123T110000Z');
  });
});
