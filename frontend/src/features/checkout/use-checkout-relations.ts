import { useCustomerControllerSearch } from '@/generated/customer/customer';

/**
 * T046 §8 (AD-2, mirrors AD-1) — minimal Customer read integration only. Full Customer
 * management is a separate future module. `undefined` (no status filter) resolves any customer
 * id→name, including INACTIVE ones referenced by existing invoices; pass `'ACTIVE'` for the
 * Checkout form's live picker (new sales should only be attributed to a currently-active customer).
 */
export function useCustomerOptions(statusFilter: 'ACTIVE' | undefined = undefined) {
  const customers = useCustomerControllerSearch({ status: statusFilter, limit: 100 });
  return {
    customerOptions: (customers.data?.items ?? []).map((c) => ({ value: c.id, label: c.fullName })),
    isLoading: customers.isLoading,
  };
}
