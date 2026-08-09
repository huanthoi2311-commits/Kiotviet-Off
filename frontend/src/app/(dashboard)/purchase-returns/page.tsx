import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { PurchaseReturnTable } from '@/features/purchase-return/components/purchase-return-table';

/** T045 §7 — Purchase Return List. */
export default function PurchaseReturnsPage() {
  return (
    <PermissionGate code="purchase_return:view">
      <PageHeader
        title="Trả hàng nhà cung cấp"
        breadcrumbs={[{ label: 'Mua hàng' }, { label: 'Trả hàng nhà cung cấp' }]}
      />
      <PurchaseReturnTable />
    </PermissionGate>
  );
}
