import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { PurchaseOrderTable } from '@/features/purchase/components/purchase-order-table';

/** T045 §5 — Purchase Order List. */
export default function PurchaseOrdersPage() {
  return (
    <PermissionGate code="purchase:view">
      <PageHeader
        title="Đơn nhập hàng"
        breadcrumbs={[{ label: 'Mua hàng' }, { label: 'Đơn nhập hàng' }]}
      />
      <PurchaseOrderTable />
    </PermissionGate>
  );
}
