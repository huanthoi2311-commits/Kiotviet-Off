import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { PurchaseOrderDetail } from '@/features/purchase/components/purchase-order-detail';

/** T045 §5 — Purchase Order Detail. */
export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PermissionGate code="purchase:view">
      <PageHeader
        title="Chi tiết đơn nhập hàng"
        breadcrumbs={[
          { label: 'Mua hàng' },
          { label: 'Đơn nhập hàng', href: '/purchase-orders' },
          { label: 'Chi tiết' },
        ]}
      />
      <PurchaseOrderDetail id={id} />
    </PermissionGate>
  );
}
