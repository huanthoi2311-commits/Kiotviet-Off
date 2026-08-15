import { usePurchaseOrderControllerSearch } from '@/generated/purchase-order/purchase-order';

/**
 * T052.05C §12 — the Purchase Order search endpoint genuinely supports `supplierId` as a real
 * backend filter (`PurchaseOrderControllerSearchParams.supplierId`), so this is a real
 * supplier-scoped selector, not a client-side filter of a broader unscoped list. This does NOT
 * assert a backend invariant that a payment's `purchaseOrderId` must belong to the same
 * `supplierId` — T052.01 explicitly found no such invariant exists — it is purely a UX
 * convenience so the picker only ever shows orders relevant to the supplier currently being paid.
 */
export function usePurchaseOrderOptions(supplierId: string) {
  const purchaseOrders = usePurchaseOrderControllerSearch(
    { supplierId, limit: 100 },
    { query: { enabled: Boolean(supplierId) } },
  );
  return {
    purchaseOrderOptions: (purchaseOrders.data?.items ?? []).map((po) => ({
      value: po.id,
      label: po.code,
    })),
    isLoading: purchaseOrders.isLoading,
  };
}
