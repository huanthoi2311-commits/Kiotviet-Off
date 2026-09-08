import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SalesReturnRefundFingerprint } from './use-sales-return-refund-idempotency-key';
import { useSalesReturnRefundIdempotencyKey } from './use-sales-return-refund-idempotency-key';

const baseFingerprint: SalesReturnRefundFingerprint = {
  salesReturnId: 'sr-1',
  amount: 100000,
  method: 'CASH',
  externalReference: undefined,
};

describe('useSalesReturnRefundIdempotencyKey (T053.06E §17)', () => {
  it('generates a key once per logical intent — before any submit, prepareSubmit still returns a stable value across renders', () => {
    const { result, rerender } = renderHook(() => useSalesReturnRefundIdempotencyKey());
    rerender();
    const first = result.current.prepareSubmit(baseFingerprint);
    const second = result.current.prepareSubmit(baseFingerprint);
    expect(first).toBe(second);
  });

  it('exact retry (same fingerprint) uses the same key', () => {
    const { result } = renderHook(() => useSalesReturnRefundIdempotencyKey());
    const attempt1 = result.current.prepareSubmit(baseFingerprint);
    const attempt2 = result.current.prepareSubmit({ ...baseFingerprint });
    expect(attempt2).toBe(attempt1);
  });

  it('double-submit (two prepareSubmit calls with unchanged fingerprint, simulating rapid duplicate clicks) uses the same key', () => {
    const { result } = renderHook(() => useSalesReturnRefundIdempotencyKey());
    const clickA = result.current.prepareSubmit(baseFingerprint);
    const clickB = result.current.prepareSubmit(baseFingerprint);
    expect(clickB).toBe(clickA);
  });

  it('timeout/ambiguous-response retry (same fingerprint, called again after a failed attempt) preserves the key', () => {
    const { result } = renderHook(() => useSalesReturnRefundIdempotencyKey());
    const firstAttempt = result.current.prepareSubmit(baseFingerprint);
    // Simulates a network-ambiguous failure: the caller does not retire(), just retries.
    const retryAttempt = result.current.prepareSubmit(baseFingerprint);
    expect(retryAttempt).toBe(firstAttempt);
  });

  it('successful completion retires the key — the next NEW intent gets a different key', () => {
    const { result } = renderHook(() => useSalesReturnRefundIdempotencyKey());
    const firstKey = result.current.prepareSubmit(baseFingerprint);
    result.current.retire();
    const nextIntentKey = result.current.prepareSubmit(baseFingerprint);
    expect(nextIntentKey).not.toBe(firstKey);
  });

  it('changing amount after an attempt mints a new key', () => {
    const { result } = renderHook(() => useSalesReturnRefundIdempotencyKey());
    const firstKey = result.current.prepareSubmit(baseFingerprint);
    const secondKey = result.current.prepareSubmit({ ...baseFingerprint, amount: 200000 });
    expect(secondKey).not.toBe(firstKey);
  });

  it('changing method after an attempt mints a new key', () => {
    const { result } = renderHook(() => useSalesReturnRefundIdempotencyKey());
    const firstKey = result.current.prepareSubmit(baseFingerprint);
    const secondKey = result.current.prepareSubmit({ ...baseFingerprint, method: 'BANK_TRANSFER' });
    expect(secondKey).not.toBe(firstKey);
  });

  it('changing externalReference after an attempt mints a new key', () => {
    const { result } = renderHook(() => useSalesReturnRefundIdempotencyKey());
    const firstKey = result.current.prepareSubmit(baseFingerprint);
    const secondKey = result.current.prepareSubmit({
      ...baseFingerprint,
      externalReference: 'ref-1',
    });
    expect(secondKey).not.toBe(firstKey);
  });

  it('changing salesReturnId after an attempt mints a new key (defensive — not user-editable, but the fingerprint check does not special-case it)', () => {
    const { result } = renderHook(() => useSalesReturnRefundIdempotencyKey());
    const firstKey = result.current.prepareSubmit(baseFingerprint);
    const secondKey = result.current.prepareSubmit({ ...baseFingerprint, salesReturnId: 'sr-2' });
    expect(secondKey).not.toBe(firstKey);
  });

  it('retire() before any submit still leaves prepareSubmit producing a usable, stable key for the first real attempt', () => {
    const { result } = renderHook(() => useSalesReturnRefundIdempotencyKey());
    result.current.retire();
    const key1 = result.current.prepareSubmit(baseFingerprint);
    const key2 = result.current.prepareSubmit(baseFingerprint);
    expect(key1).toBe(key2);
  });

  describe('when crypto.randomUUID is unavailable (Customer #1 LAN HTTP condition)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('still produces a usable, valid, stable key without throwing', () => {
      vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
      const { result } = renderHook(() => useSalesReturnRefundIdempotencyKey());
      const key = result.current.prepareSubmit(baseFingerprint);
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });
});
