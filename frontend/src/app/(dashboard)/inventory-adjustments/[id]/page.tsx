import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { InventoryAdjustmentDetail } from '@/features/inventory-adjustment/components/inventory-adjustment-detail';

/** T044 Phase M — Inventory Adjustment Detail. */
export default async function InventoryAdjustmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PermissionGate code="inventory:view">
      <PageHeader
        title="Chi tiết phiếu điều chỉnh"
        breadcrumbs={[
          { label: 'Kho vận' },
          { label: 'Điều chỉnh tồn kho', href: '/inventory-adjustments' },
          { label: 'Chi tiết' },
        ]}
      />
      <InventoryAdjustmentDetail id={id} />
    </PermissionGate>
  );
}
