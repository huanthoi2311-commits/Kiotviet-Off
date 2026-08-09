import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { InventoryAdjustmentTable } from '@/features/inventory-adjustment/components/inventory-adjustment-table';

/** T044 Phase M — Inventory Adjustment List. */
export default function InventoryAdjustmentsPage() {
  return (
    <PermissionGate code="inventory:view">
      <PageHeader
        title="Điều chỉnh tồn kho"
        breadcrumbs={[{ label: 'Kho vận' }, { label: 'Điều chỉnh tồn kho' }]}
      />
      <InventoryAdjustmentTable />
    </PermissionGate>
  );
}
