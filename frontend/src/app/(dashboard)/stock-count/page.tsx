import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { StockCountTable } from '@/features/stock-count/components/stock-count-table';

/** T044 Phase N — Stock Count List. */
export default function StockCountsPage() {
  return (
    <PermissionGate code="stock_count:view">
      <PageHeader
        title="Kiểm kê kho"
        breadcrumbs={[{ label: 'Kho vận' }, { label: 'Kiểm kê kho' }]}
      />
      <StockCountTable />
    </PermissionGate>
  );
}
