import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { InvoiceDetail } from '@/features/invoice/components/invoice-detail';

/** T046 §6 — Invoice Detail. */
export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PermissionGate code="invoice:view">
      <PageHeader
        title="Chi tiết hóa đơn"
        breadcrumbs={[
          { label: 'Bán hàng' },
          { label: 'Hóa đơn', href: '/invoices' },
          { label: 'Chi tiết' },
        ]}
      />
      <InvoiceDetail id={id} />
    </PermissionGate>
  );
}
