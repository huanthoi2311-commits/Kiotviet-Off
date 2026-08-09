import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { PurchaseReturnDetail } from '@/features/purchase-return/components/purchase-return-detail';

/** T045 §7 — Purchase Return Detail. */
export default async function PurchaseReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PermissionGate code="purchase_return:view">
      <PageHeader
        title="Chi tiết phiếu trả hàng"
        breadcrumbs={[
          { label: 'Mua hàng' },
          { label: 'Trả hàng nhà cung cấp', href: '/purchase-returns' },
          { label: 'Chi tiết' },
        ]}
      />
      <PurchaseReturnDetail id={id} />
    </PermissionGate>
  );
}
