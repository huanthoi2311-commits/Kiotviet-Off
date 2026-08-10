import { useProductControllerSearch } from '@/generated/product/product';

/** Unfiltered (no status filter) — a product mapping created against a product that's since been
 * archived should still resolve to its real name instead of a raw UUID, matching the reasoning
 * already established for `useProductRelationOptions`'s own List-table id→name lookup. */
export function useProductOptions() {
  const products = useProductControllerSearch({ limit: 100 });
  return {
    productOptions: (products.data?.items ?? []).map((p) => ({ value: p.id, label: p.name })),
    isLoading: products.isLoading,
  };
}
