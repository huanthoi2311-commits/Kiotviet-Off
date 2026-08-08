import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/page-header';
import { PermissionButton } from '@/components/common/permission-button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { CategoryTable } from '@/features/category/components/category-table';

/** T035.10 read-only list + T036.10 Create entry point + T038.10/T039 Archive/Restore actions + T040 Tree entry point. */
export default function CategoriesPage() {
  return (
    <PermissionGate code="category:view">
      <PageHeader
        title="Danh mục"
        breadcrumbs={[{ label: 'Master Data' }, { label: 'Danh mục' }]}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" render={<Link href="/categories/tree">Xem dạng cây</Link>} />
            <PermissionButton
              permission="category:create"
              render={<Link href="/categories/new">Thêm danh mục</Link>}
            />
          </div>
        }
      />
      <CategoryTable />
    </PermissionGate>
  );
}
