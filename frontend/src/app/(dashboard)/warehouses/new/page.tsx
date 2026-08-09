import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { WarehouseCreateForm } from '@/features/warehouse/components/warehouse-form';

/** T044 Phase K — Warehouse Create. */
export default function NewWarehousePage() {
  return (
    <PermissionGate code="warehouse:create">
      <PageHeader
        title="Thêm kho"
        breadcrumbs={[
          { label: 'Kho vận' },
          { label: 'Kho', href: '/warehouses' },
          { label: 'Thêm mới' },
        ]}
      />
      <WarehouseCreateForm />
    </PermissionGate>
  );
}
