import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { PurchaseOrderCreateForm } from '@/features/purchase/components/purchase-order-form';

/** T045 §5 — Purchase Order Create. */
export default function NewPurchaseOrderPage() {
  return (
    <PermissionGate code="purchase:create">
      <PageHeader
        title="Tạo đơn nhập hàng"
        breadcrumbs={[
          { label: 'Mua hàng' },
          { label: 'Đơn nhập hàng', href: '/purchase-orders' },
          { label: 'Tạo mới' },
        ]}
      />
      <PurchaseOrderCreateForm />
    </PermissionGate>
  );
}
