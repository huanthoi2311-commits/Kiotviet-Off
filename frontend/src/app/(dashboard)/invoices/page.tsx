import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { InvoiceTable } from '@/features/invoice/components/invoice-table';

/** T046 §6 — Invoice List. `customerId` (T048 §9) pre-filters when linked from Customer Detail. */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { customerId } = await searchParams;

  return (
    <PermissionGate code="invoice:view">
      <PageHeader title="Hóa đơn" breadcrumbs={[{ label: 'Bán hàng' }, { label: 'Hóa đơn' }]} />
      <InvoiceTable initialCustomerId={customerId} />
    </PermissionGate>
  );
}
