import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { PermissionButton } from '@/components/common/permission-button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { CategoryTable } from '@/features/category/components/category-table';

/** T035.10 read-only list + T036.10 Create entry point; Edit/Archive/Restore/Tree land in later packages. */
export default function CategoriesPage() {
  return (
    <PermissionGate code="category:view">
      <PageHeader
        title="Danh mục"
        breadcrumbs={[{ label: 'Master Data' }, { label: 'Danh mục' }]}
        action={
          <PermissionButton
            permission="category:create"
            render={<Link href="/categories/new">Thêm danh mục</Link>}
          />
        }
      />
      <CategoryTable />
    </PermissionGate>
  );
}
