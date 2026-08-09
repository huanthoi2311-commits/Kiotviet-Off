import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { WarehouseEditForm } from '@/features/warehouse/components/warehouse-edit-form';

/** T044 Phase K — combined detail/edit page (Category T033.02 §2 precedent). */
export default async function WarehouseEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PermissionGate code="warehouse:view">
      <PageHeader
        title="Chi tiết kho"
        breadcrumbs={[
          { label: 'Kho vận' },
          { label: 'Kho', href: '/warehouses' },
          { label: 'Chi tiết' },
        ]}
      />
      <WarehouseEditForm id={id} />
    </PermissionGate>
  );
}
