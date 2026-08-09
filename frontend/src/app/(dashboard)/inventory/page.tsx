import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { InventoryTable } from '@/features/inventory/components/inventory-table';

/** T044 Phase J — Inventory List (read-only). */
export default function InventoryPage() {
  return (
    <PermissionGate code="inventory:view">
      <PageHeader
        title="Tồn kho"
        breadcrumbs={[{ label: 'Kho vận' }, { label: 'Tồn kho' }]}
        action={
          <Button
            variant="outline"
            render={<Link href="/inventory/history">Lịch sử biến động</Link>}
          />
        }
      />
      <InventoryTable />
    </PermissionGate>
  );
}
