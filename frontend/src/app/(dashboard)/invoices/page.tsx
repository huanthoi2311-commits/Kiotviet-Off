import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { InvoiceTable } from '@/features/invoice/components/invoice-table';

/** T046 §6 — Invoice List. */
export default function InvoicesPage() {
  return (
    <PermissionGate code="invoice:view">
      <PageHeader title="Hóa đơn" breadcrumbs={[{ label: 'Bán hàng' }, { label: 'Hóa đơn' }]} />
      <InvoiceTable />
    </PermissionGate>
  );
}
