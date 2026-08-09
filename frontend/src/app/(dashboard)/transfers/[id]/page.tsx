import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { TransferDetail } from '@/features/transfer/components/transfer-detail';

/** T044 Phase L — Transfer Detail. */
export default async function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PermissionGate code="transfer:view">
      <PageHeader
        title="Chi tiết phiếu điều chuyển"
        breadcrumbs={[
          { label: 'Kho vận' },
          { label: 'Điều chuyển kho', href: '/transfers' },
          { label: 'Chi tiết' },
        ]}
      />
      <TransferDetail id={id} />
    </PermissionGate>
  );
}
