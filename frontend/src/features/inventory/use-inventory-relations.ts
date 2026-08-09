import { useProductControllerSearch } from '@/generated/product/product';
import { useWarehouseControllerSearch } from '@/generated/warehouse/warehouse';
import { useBranchControllerSearch } from '@/generated/branch/branch';

/**
 * Same technique as Product's own `useProductRelationOptions` (T043) — Warehouse/Branch/Product
 * have no dedicated picker component; fetch each existing search endpoint directly (limit=100) and
 * expose plain `{value,label}` option lists + id→name lookup maps, reused across every module in
 * the inventory family (Inventory List/History, Transfer, Inventory Adjustment, Stock Count).
 */
export function useWarehouseOptions(statusFilter: 'ACTIVE' | undefined = 'ACTIVE') {
  const warehouses = useWarehouseControllerSearch({ status: statusFilter, limit: 100 });
  return {
    warehouseOptions: (warehouses.data?.items ?? []).map((w) => ({ value: w.id, label: w.name })),
    isLoading: warehouses.isLoading,
  };
}

export function useProductOptions() {
  const products = useProductControllerSearch({ limit: 100, status: 'ACTIVE' });
  return {
    productOptions: (products.data?.items ?? []).map((p) => ({
      value: p.id,
      label: `${p.name} (${p.sku})`,
    })),
    isLoading: products.isLoading,
  };
}

export function useBranchOptions() {
  const branches = useBranchControllerSearch({ status: 'ACTIVE', limit: 100 });
  return {
    branchOptions: (branches.data?.items ?? []).map((b) => ({ value: b.id, label: b.name })),
    isLoading: branches.isLoading,
  };
}
