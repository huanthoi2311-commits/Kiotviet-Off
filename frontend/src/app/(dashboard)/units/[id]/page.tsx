import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { UnitEditForm } from '@/features/unit/components/unit-edit-form';

/** T042 Phase E — combined detail/edit page (Category T033.02 §2 precedent). */
export default async function UnitEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PermissionGate code="unit:view">
      <PageHeader
        title="Chi tiết đơn vị tính"
        breadcrumbs={[
          { label: 'Master Data' },
          { label: 'Đơn vị tính', href: '/units' },
          { label: 'Chi tiết' },
        ]}
      />
      <UnitEditForm id={id} />
    </PermissionGate>
  );
}
