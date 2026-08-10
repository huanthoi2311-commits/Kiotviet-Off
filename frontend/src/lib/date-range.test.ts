import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPurchaseReportDateParams,
  formatLocalOffset,
  parseDateInputValue,
  toEndOfLocalDayIso,
  toStartOfLocalDayIso,
} from './date-range';

const ISO_MICROSECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}[+-]\d{2}:\d{2}$/;

describe('date-range (T050 AD-4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('A — dateFrom stays on the same local calendar date', () => {
    const date = new Date(2026, 7, 10, 15, 30);
    expect(toStartOfLocalDayIso(date).startsWith('2026-08-10T00:00:00.000000')).toBe(true);
  });

  it('B — dateTo ends at the final representable microsecond of the local day', () => {
    const date = new Date(2026, 7, 10, 9, 0);
    expect(toEndOfLocalDayIso(date).startsWith('2026-08-10T23:59:59.999999')).toBe(true);
  });

  it('C — formats a positive offset as +HH:MM (offset-formatting helper tested in isolation, per AD-4 §7)', () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-420);
    expect(formatLocalOffset(new Date())).toBe('+07:00');
  });

  it('D — formats a negative offset as -HH:MM (offset-formatting helper tested in isolation, per AD-4 §7)', () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(300);
    expect(formatLocalOffset(new Date())).toBe('-05:00');
  });

  it('E — omitting both dates produces no date params (AD-3)', () => {
    expect(buildPurchaseReportDateParams({})).toEqual({});
  });

  it('F — only dateFrom is forwarded independently', () => {
    const params = buildPurchaseReportDateParams({ dateFrom: new Date(2026, 7, 10) });
    expect(params.dateFrom).toBeDefined();
    expect(params.dateTo).toBeUndefined();
  });

  it('G — only dateTo is forwarded independently', () => {
    const params = buildPurchaseReportDateParams({ dateTo: new Date(2026, 7, 10) });
    expect(params.dateTo).toBeDefined();
    expect(params.dateFrom).toBeUndefined();
  });

  it('H — both dateFrom and dateTo are forwarded together', () => {
    const params = buildPurchaseReportDateParams({
      dateFrom: new Date(2026, 7, 1),
      dateTo: new Date(2026, 7, 31),
    });
    expect(params.dateFrom).toMatch(ISO_MICROSECOND_PATTERN);
    expect(params.dateTo).toMatch(ISO_MICROSECOND_PATTERN);
  });

  it('I — boundary values are well-formed 6-digit microsecond ISO strings accepted by the DTO contract', () => {
    expect(toStartOfLocalDayIso(new Date(2026, 7, 10))).toMatch(ISO_MICROSECOND_PATTERN);
    expect(toEndOfLocalDayIso(new Date(2026, 7, 10))).toMatch(ISO_MICROSECOND_PATTERN);
  });

  it('J — does not shift the calendar day the way naive UTC parsing would', () => {
    const nearLocalMidnight = new Date(2026, 7, 10, 0, 5);
    expect(toStartOfLocalDayIso(nearLocalMidnight)).toContain('2026-08-10');
    expect(toEndOfLocalDayIso(nearLocalMidnight)).toContain('2026-08-10');
  });

  it('parseDateInputValue parses an <input type="date"> value as a local calendar date, not UTC', () => {
    const parsed = parseDateInputValue('2026-08-10');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(7);
    expect(parsed?.getDate()).toBe(10);
    expect(parsed?.getHours()).toBe(0);
  });

  it('parseDateInputValue returns undefined for an empty or malformed value', () => {
    expect(parseDateInputValue('')).toBeUndefined();
    expect(parseDateInputValue('not-a-date')).toBeUndefined();
  });
});
