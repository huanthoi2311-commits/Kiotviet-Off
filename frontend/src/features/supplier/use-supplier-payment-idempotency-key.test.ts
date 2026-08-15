import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SupplierPaymentFingerprint } from './payment-schema';
import { useSupplierPaymentIdempotencyKey } from './use-supplier-payment-idempotency-key';

const baseFingerprint: SupplierPaymentFingerprint = {
  branchId: 'branch-1',
  supplierId: 'supplier-1',
  purchaseOrderId: undefined,
  method: 'CASH',
  amount: 100000,
  paidAt: '2026-08-15',
};

describe('useSupplierPaymentIdempotencyKey (T052.05C §6/§7/§9/§15)', () => {
  it('generates a key once per logical intent — before any submit, prepareSubmit still returns a stable value across renders', () => {
    const { result, rerender } = renderHook(() => useSupplierPaymentIdempotencyKey());
    rerender();
    const first = result.current.prepareSubmit(baseFingerprint);
    const second = result.current.prepareSubmit(baseFingerprint);
    expect(first).toBe(second);
  });

  it('exact retry (same fingerprint) uses the same key', () => {
    const { result } = renderHook(() => useSupplierPaymentIdempotencyKey());
    const attempt1 = result.current.prepareSubmit(baseFingerprint);
    const attempt2 = result.current.prepareSubmit({ ...baseFingerprint });
    expect(attempt2).toBe(attempt1);
  });

  it('double-submit (two prepareSubmit calls with unchanged fingerprint, simulating rapid duplicate clicks) uses the same key', () => {
    const { result } = renderHook(() => useSupplierPaymentIdempotencyKey());
    const clickA = result.current.prepareSubmit(baseFingerprint);
    const clickB = result.current.prepareSubmit(baseFingerprint);
    expect(clickB).toBe(clickA);
  });

  it('timeout/ambiguous-response retry (same fingerprint, called again after a failed attempt) preserves the key', () => {
    const { result } = renderHook(() => useSupplierPaymentIdempotencyKey());
    const firstAttempt = result.current.prepareSubmit(baseFingerprint);
    // Simulates a network-ambiguous failure: the caller does not retire(), just retries.
    const retryAttempt = result.current.prepareSubmit(baseFingerprint);
    expect(retryAttempt).toBe(firstAttempt);
  });

  it('successful completion retires the key — the next NEW intent gets a different key', () => {
    const { result } = renderHook(() => useSupplierPaymentIdempotencyKey());
    const firstKey = result.current.prepareSubmit(baseFingerprint);
    result.current.retire();
    const nextIntentKey = result.current.prepareSubmit(baseFingerprint);
    expect(nextIntentKey).not.toBe(firstKey);
  });

  it('changing amount after an attempt mints a new key', () => {
    const { result } = renderHook(() => useSupplierPaymentIdempotencyKey());
    const firstKey = result.current.prepareSubmit(baseFingerprint);
    const secondKey = result.current.prepareSubmit({ ...baseFingerprint, amount: 200000 });
    expect(secondKey).not.toBe(firstKey);
  });

  it('changing branchId after an attempt mints a new key', () => {
    const { result } = renderHook(() => useSupplierPaymentIdempotencyKey());
    const firstKey = result.current.prepareSubmit(baseFingerprint);
    const secondKey = result.current.prepareSubmit({ ...baseFingerprint, branchId: 'branch-2' });
    expect(secondKey).not.toBe(firstKey);
  });

  it('changing purchaseOrderId after an attempt mints a new key', () => {
    const { result } = renderHook(() => useSupplierPaymentIdempotencyKey());
    const firstKey = result.current.prepareSubmit(baseFingerprint);
    const secondKey = result.current.prepareSubmit({ ...baseFingerprint, purchaseOrderId: 'po-1' });
    expect(secondKey).not.toBe(firstKey);
  });

  it('changing method after an attempt mints a new key', () => {
    const { result } = renderHook(() => useSupplierPaymentIdempotencyKey());
    const firstKey = result.current.prepareSubmit(baseFingerprint);
    const secondKey = result.current.prepareSubmit({ ...baseFingerprint, method: 'BANK_TRANSFER' });
    expect(secondKey).not.toBe(firstKey);
  });

  it('changing paidAt after an attempt mints a new key', () => {
    const { result } = renderHook(() => useSupplierPaymentIdempotencyKey());
    const firstKey = result.current.prepareSubmit(baseFingerprint);
    const secondKey = result.current.prepareSubmit({ ...baseFingerprint, paidAt: '2026-08-16' });
    expect(secondKey).not.toBe(firstKey);
  });

  it('changing supplierId after an attempt mints a new key (defensive — supplierId is not user-editable, but the fingerprint check does not special-case it)', () => {
    const { result } = renderHook(() => useSupplierPaymentIdempotencyKey());
    const firstKey = result.current.prepareSubmit(baseFingerprint);
    const secondKey = result.current.prepareSubmit({
      ...baseFingerprint,
      supplierId: 'supplier-2',
    });
    expect(secondKey).not.toBe(firstKey);
  });

  it('retire() before any submit still leaves prepareSubmit producing a usable, stable key for the first real attempt', () => {
    const { result } = renderHook(() => useSupplierPaymentIdempotencyKey());
    result.current.retire();
    const key1 = result.current.prepareSubmit(baseFingerprint);
    const key2 = result.current.prepareSubmit(baseFingerprint);
    expect(key1).toBe(key2);
  });
});
