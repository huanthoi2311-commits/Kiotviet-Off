import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { StockCountCreateForm } from '@/features/stock-count/components/stock-count-form';

/** T044 Phase N — Stock Count Create. */
export default function NewStockCountPage() {
  return (
    <PermissionGate code="stock_count:create">
      <PageHeader
        title="Tạo phiếu kiểm kê"
        breadcrumbs={[
          { label: 'Kho vận' },
          { label: 'Kiểm kê kho', href: '/stock-count' },
          { label: 'Tạo mới' },
        ]}
      />
      <StockCountCreateForm />
    </PermissionGate>
  );
}
