import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { CategoryTree } from '@/features/category/components/category-tree';

/** T040 — read-only hierarchy view (AD-1: no move/reorder in this package). */
export default function CategoryTreePage() {
  return (
    <PermissionGate code="category:view">
      <PageHeader
        title="Cây danh mục"
        breadcrumbs={[
          { label: 'Master Data' },
          { label: 'Danh mục', href: '/categories' },
          { label: 'Cây danh mục' },
        ]}
        action={<Button variant="outline" render={<Link href="/categories">Xem danh sách</Link>} />}
      />
      <CategoryTree />
    </PermissionGate>
  );
}
