import { useCallback, useRef } from 'react';

/**
 * T053.06E — the exact fields that participate in the backend's idempotency fingerprint
 * (`RefundDomainService.createRefund()`: `{ salesReturnId, amount, method, externalReference }`,
 * hashed as-is). Changing ANY of these after an attempted submission must mint a NEW
 * Idempotency-Key — reused verbatim by `useSalesReturnRefundIdempotencyKey` so the two can never
 * silently drift apart.
 */
export interface SalesReturnRefundFingerprint {
  salesReturnId: string;
  amount: number;
  method: string;
  externalReference: string | undefined;
}

/**
 * T053.06E §17 — one stable Idempotency-Key per logical refund intent, mirroring
 * `useSupplierPaymentIdempotencyKey` (T052.05C) exactly — SAME divergence reason from Checkout's
 * strategy applies here: the backend `SalesReturnRefundOperation` treats `requestFingerprint` as
 * IMMUTABLE and REJECTS (409, `SALES_RETURN_016`) a reclaim attempt under a changed fingerprint
 * (mirror Supplier Payment's Architect Decision D5 — financial-record-traceability), so the
 * frontend must not let a changed intent reuse an old key in the first place.
 *
 * - `prepareSubmit(fingerprint)` is called ONCE per submit attempt (never per HTTP retry). The
 *   FIRST call for a given logical intent keeps the already-generated key. Every call after that
 *   compares the new fingerprint against the one captured at the LAST attempt — unchanged (a
 *   genuine retry) reuses the SAME key; changed (any of salesReturnId/amount/method/
 *   externalReference) mints a brand-new key BEFORE the caller submits.
 * - `retire()` mints a fresh key and clears the last-attempt fingerprint — call on confirmed
 *   success (replay counts as success too) and when the form/dialog closes without success.
 */
export function useSalesReturnRefundIdempotencyKey() {
  const keyRef = useRef<string>(crypto.randomUUID());
  const lastFingerprintRef = useRef<string | null>(null);

  const prepareSubmit = useCallback((fingerprint: SalesReturnRefundFingerprint): string => {
    const serialized = JSON.stringify(fingerprint);
    if (lastFingerprintRef.current !== null && lastFingerprintRef.current !== serialized) {
      keyRef.current = crypto.randomUUID();
    }
    lastFingerprintRef.current = serialized;
    return keyRef.current;
  }, []);

  const retire = useCallback(() => {
    keyRef.current = crypto.randomUUID();
    lastFingerprintRef.current = null;
  }, []);

  return { prepareSubmit, retire };
}
