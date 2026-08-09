import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { TransferTable } from '@/features/transfer/components/transfer-table';

/** T044 Phase L — Transfer List. */
export default function TransfersPage() {
  return (
    <PermissionGate code="transfer:view">
      <PageHeader
        title="Điều chuyển kho"
        breadcrumbs={[{ label: 'Kho vận' }, { label: 'Điều chuyển kho' }]}
      />
      <TransferTable />
    </PermissionGate>
  );
}
