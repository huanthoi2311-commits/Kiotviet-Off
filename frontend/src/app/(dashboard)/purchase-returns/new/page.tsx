import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { PurchaseReturnCreateForm } from '@/features/purchase-return/components/purchase-return-form';

/** T045 §7 — Purchase Return Create. Only reachable meaningfully with `?purchaseOrderId=`. */
export default async function NewPurchaseReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ purchaseOrderId?: string }>;
}) {
  const { purchaseOrderId } = await searchParams;

  return (
    <PermissionGate code="purchase_return:create">
      <PageHeader
        title="Tạo phiếu trả hàng"
        breadcrumbs={[
          { label: 'Mua hàng' },
          { label: 'Trả hàng nhà cung cấp', href: '/purchase-returns' },
          { label: 'Tạo mới' },
        ]}
      />
      <PurchaseReturnCreateForm purchaseOrderId={purchaseOrderId} />
    </PermissionGate>
  );
}
