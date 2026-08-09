import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { SalesReturnDetail } from '@/features/sales-return/components/sales-return-detail';

/** T047 §4 — Sales Return Detail. */
export default async function SalesReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PermissionGate code="sales_return:view">
      <PageHeader
        title="Chi tiết phiếu trả hàng"
        breadcrumbs={[
          { label: 'Bán hàng' },
          { label: 'Trả hàng', href: '/sales-returns' },
          { label: 'Chi tiết' },
        ]}
      />
      <SalesReturnDetail id={id} />
    </PermissionGate>
  );
}
