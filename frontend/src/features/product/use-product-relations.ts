import { useCategoryControllerList } from '@/generated/category/category';
import { useBrandControllerSearch } from '@/generated/brand/brand';
import { useUnitControllerSearch } from '@/generated/unit/unit';
import { useProductControllerSearch } from '@/generated/product/product';

/**
 * Category/Brand/Unit have no dedicated "picker" component anywhere in this codebase yet (no other
 * module references them from outside their own feature folder) — this fetches each existing,
 * already-approved search endpoint directly (limit=100, the project's own max) and exposes plain
 * `{value,label}` option lists, reused by both Product Create/Edit pickers (ACTIVE-only, so a user
 * can't assign a new product to an archived category/brand/unit) and the Product List table's
 * id→name lookup (unfiltered, so a product referencing an archived relation still displays its
 * real name instead of a raw UUID).
 */
export function useProductRelationOptions(statusFilter: 'ACTIVE' | undefined = 'ACTIVE') {
  const categories = useCategoryControllerList({ status: statusFilter, limit: 100 });
  const brands = useBrandControllerSearch({ status: statusFilter, limit: 100 });
  const units = useUnitControllerSearch({ status: statusFilter, limit: 100 });

  return {
    categoryOptions: (categories.data?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
    brandOptions: (brands.data?.items ?? []).map((b) => ({ value: b.id, label: b.name })),
    unitOptions: (units.data?.items ?? []).map((u) => ({ value: u.id, label: u.name })),
    isLoading: categories.isLoading || brands.isLoading || units.isLoading,
  };
}

/** Variant Parent picker for Product Create/Edit when `type=VARIANT_CHILD` (T043 Phase H/E). */
export function useVariantParentOptions(enabled: boolean) {
  const parents = useProductControllerSearch(
    { type: 'VARIANT_PARENT', limit: 100 },
    { query: { enabled } },
  );
  return {
    parentOptions: (parents.data?.items ?? []).map((p) => ({
      value: p.id,
      label: `${p.name} (${p.sku})`,
    })),
    isLoading: parents.isLoading,
  };
}
