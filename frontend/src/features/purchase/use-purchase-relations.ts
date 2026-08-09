import { useSupplierControllerSearch } from '@/generated/supplier/supplier';

/**
 * T045 §4 — minimal Supplier read integration (AD-1: no full Supplier module in T045).
 * `undefined` (no status filter) resolves any supplier id→name, including INACTIVE ones
 * referenced by existing records; pass `'ACTIVE'` for the Purchase Order Create picker.
 */
export function useSupplierOptions(statusFilter: 'ACTIVE' | undefined = undefined) {
  const suppliers = useSupplierControllerSearch({ status: statusFilter, limit: 100 });
  return {
    supplierOptions: (suppliers.data?.items ?? []).map((s) => ({
      value: s.id,
      label: s.companyName,
    })),
    isLoading: suppliers.isLoading,
  };
}
