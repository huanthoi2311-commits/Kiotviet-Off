import { useCallback, useRef } from 'react';
import type { SupplierPaymentFingerprint } from './payment-schema';

/**
 * T052.05C §6/§7/§9/§15 — one stable Idempotency-Key per logical payment intent.
 *
 * - `prepareSubmit(fingerprint)` is called ONCE per submit attempt (never per HTTP retry). The
 *   FIRST call for a given logical intent keeps the already-generated key. Every call after that
 *   compares the new fingerprint against the one captured at the LAST attempt — unchanged
 *   (a genuine retry: double-click, timeout/network-ambiguous retry, or a deliberate resubmit of
 *   the exact same failed attempt) reuses the SAME key; changed (any of branchId/supplierId/
 *   purchaseOrderId/method/amount/paidAt) mints a brand-new key BEFORE the caller submits, so a
 *   changed intent can never reach the backend under a key that used to mean something else
 *   (backend would reject it as `SUPPLIER_DEBT_004` anyway — this keeps the UI from ever sending
 *   that combination on purpose).
 * - `retire()` mints a fresh key and clears the last-attempt fingerprint — call on confirmed
 *   success (replay counts as success too) and when the dialog closes without success (a
 *   cancelled/abandoned intent; the next open is a genuinely new one).
 *
 * Deliberately NOT the same strategy as Checkout's `useCheckoutMutation` (which reuses one key
 * until success with no per-field fingerprint check) — Checkout's backend silently overwrites a
 * mismatched fingerprint on FAILED/stale-PROCESSING reclaim (T013), so a changed retry there is
 * harmless; Supplier Payment's backend REJECTS a mismatched fingerprint (T052.05A.1 §9, Architect
 * Decision D5) as a deliberate financial-record-traceability rule, so the frontend must not let a
 * changed intent reuse an old key in the first place.
 */
export function useSupplierPaymentIdempotencyKey() {
  const keyRef = useRef<string>(crypto.randomUUID());
  const lastFingerprintRef = useRef<string | null>(null);

  const prepareSubmit = useCallback((fingerprint: SupplierPaymentFingerprint): string => {
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
