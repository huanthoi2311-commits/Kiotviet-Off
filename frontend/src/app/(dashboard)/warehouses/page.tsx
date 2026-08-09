import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { PermissionButton } from '@/components/common/permission-button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { WarehouseTable } from '@/features/warehouse/components/warehouse-table';

/** T044 Phase F — Warehouse List + Create entry point + Delete/Restore actions. */
export default function WarehousesPage() {
  return (
    <PermissionGate code="warehouse:view">
      <PageHeader
        title="Kho"
        breadcrumbs={[{ label: 'Kho vận' }, { label: 'Kho' }]}
        action={
          <PermissionButton
            permission="warehouse:create"
            render={<Link href="/warehouses/new">Thêm kho</Link>}
          />
        }
      />
      <WarehouseTable />
    </PermissionGate>
  );
}
