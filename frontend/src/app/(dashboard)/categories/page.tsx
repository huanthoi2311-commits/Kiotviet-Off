import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { CategoryTable } from '@/features/category/components/category-table';

/** T035.10 — read-only list only; Create/Edit/Archive/Restore land in later T035.x packages. */
export default function CategoriesPage() {
  return (
    <PermissionGate code="category:view">
      <PageHeader
        title="Danh mục"
        breadcrumbs={[{ label: 'Master Data' }, { label: 'Danh mục' }]}
      />
      <CategoryTable />
    </PermissionGate>
  );
}
