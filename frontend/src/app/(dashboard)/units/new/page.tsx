import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { UnitCreateForm } from '@/features/unit/components/unit-form';

/** T042 Phase D — Unit Create. */
export default function NewUnitPage() {
  return (
    <PermissionGate code="unit:create">
      <PageHeader
        title="Thêm đơn vị tính"
        breadcrumbs={[
          { label: 'Master Data' },
          { label: 'Đơn vị tính', href: '/units' },
          { label: 'Thêm mới' },
        ]}
      />
      <UnitCreateForm />
    </PermissionGate>
  );
}
