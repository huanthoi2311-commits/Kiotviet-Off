import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { TransferCreateForm } from '@/features/transfer/components/transfer-form';

/** T044 Phase L — Transfer Create. */
export default function NewTransferPage() {
  return (
    <PermissionGate code="transfer:create">
      <PageHeader
        title="Tạo phiếu điều chuyển"
        breadcrumbs={[
          { label: 'Kho vận' },
          { label: 'Điều chuyển kho', href: '/transfers' },
          { label: 'Tạo mới' },
        ]}
      />
      <TransferCreateForm />
    </PermissionGate>
  );
}
