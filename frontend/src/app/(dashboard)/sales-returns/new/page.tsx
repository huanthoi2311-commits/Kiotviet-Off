import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { SalesReturnCreateForm } from '@/features/sales-return/components/sales-return-form';

/** T047 §6 — Sales Return Create. Only reachable meaningfully with `?invoiceId=`. */
export default async function NewSalesReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string }>;
}) {
  const { invoiceId } = await searchParams;

  return (
    <PermissionGate code="sales_return:create">
      <PageHeader
        title="Tạo phiếu trả hàng"
        breadcrumbs={[
          { label: 'Bán hàng' },
          { label: 'Trả hàng', href: '/sales-returns' },
          { label: 'Tạo mới' },
        ]}
      />
      <SalesReturnCreateForm invoiceId={invoiceId} />
    </PermissionGate>
  );
}
