import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { CategoryEditForm } from '@/features/category/components/category-edit-form';

/** T037.10 — combined detail/edit page (T033.02 §2). Archive/Restore/Tree land in later packages. */
export default async function CategoryEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PermissionGate code="category:view">
      <PageHeader
        title="Chi tiết danh mục"
        breadcrumbs={[
          { label: 'Master Data' },
          { label: 'Danh mục', href: '/categories' },
          { label: 'Chi tiết' },
        ]}
      />
      <CategoryEditForm id={id} />
    </PermissionGate>
  );
}
