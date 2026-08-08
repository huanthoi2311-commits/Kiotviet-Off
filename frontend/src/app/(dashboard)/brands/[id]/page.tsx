import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { BrandEditForm } from '@/features/brand/components/brand-edit-form';

/** T041 Phase E — combined detail/edit page (Category T033.02 §2 precedent). */
export default async function BrandEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PermissionGate code="brand:view">
      <PageHeader
        title="Chi tiết thương hiệu"
        breadcrumbs={[
          { label: 'Master Data' },
          { label: 'Thương hiệu', href: '/brands' },
          { label: 'Chi tiết' },
        ]}
      />
      <BrandEditForm id={id} />
    </PermissionGate>
  );
}
