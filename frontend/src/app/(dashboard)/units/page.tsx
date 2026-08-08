import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { PermissionButton } from '@/components/common/permission-button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { UnitTable } from '@/features/unit/components/unit-table';

/** T042 Phase C/D/F — Unit List + Create entry point + Archive/Restore actions. */
export default function UnitsPage() {
  return (
    <PermissionGate code="unit:view">
      <PageHeader
        title="Đơn vị tính"
        breadcrumbs={[{ label: 'Master Data' }, { label: 'Đơn vị tính' }]}
        action={
          <PermissionButton
            permission="unit:create"
            render={<Link href="/units/new">Thêm đơn vị tính</Link>}
          />
        }
      />
      <UnitTable />
    </PermissionGate>
  );
}
