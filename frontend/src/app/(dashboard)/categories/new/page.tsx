import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { CategoryCreateForm } from '@/features/category/components/category-form';

/** T036.10 — Create only; Edit/Archive/Restore/Tree land in later packages. */
export default function NewCategoryPage() {
  return (
    <PermissionGate code="category:create">
      <PageHeader
        title="Thêm danh mục"
        breadcrumbs={[
          { label: 'Master Data' },
          { label: 'Danh mục', href: '/categories' },
          { label: 'Thêm mới' },
        ]}
      />
      <CategoryCreateForm />
    </PermissionGate>
  );
}
