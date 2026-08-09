import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { InventoryAdjustmentCreateForm } from '@/features/inventory-adjustment/components/inventory-adjustment-form';

/** T044 Phase M — Inventory Adjustment Create. */
export default function NewInventoryAdjustmentPage() {
  return (
    <PermissionGate code="inventory:adjust">
      <PageHeader
        title="Tạo phiếu điều chỉnh tồn kho"
        breadcrumbs={[
          { label: 'Kho vận' },
          { label: 'Điều chỉnh tồn kho', href: '/inventory-adjustments' },
          { label: 'Tạo mới' },
        ]}
      />
      <InventoryAdjustmentCreateForm />
    </PermissionGate>
  );
}
