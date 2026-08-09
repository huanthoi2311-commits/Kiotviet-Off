import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { StockCountDetail } from '@/features/stock-count/components/stock-count-detail';

/** T044 Phase N — Stock Count Detail. */
export default async function StockCountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PermissionGate code="stock_count:view">
      <PageHeader
        title="Chi tiết phiếu kiểm kê"
        breadcrumbs={[
          { label: 'Kho vận' },
          { label: 'Kiểm kê kho', href: '/stock-count' },
          { label: 'Chi tiết' },
        ]}
      />
      <StockCountDetail id={id} />
    </PermissionGate>
  );
}
