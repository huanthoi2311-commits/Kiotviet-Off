import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { SalesReturnTable } from '@/features/sales-return/components/sales-return-table';

/** T047 §4 — Sales Return List. */
export default function SalesReturnsPage() {
  return (
    <PermissionGate code="sales_return:view">
      <PageHeader title="Trả hàng" breadcrumbs={[{ label: 'Bán hàng' }, { label: 'Trả hàng' }]} />
      <SalesReturnTable />
    </PermissionGate>
  );
}
