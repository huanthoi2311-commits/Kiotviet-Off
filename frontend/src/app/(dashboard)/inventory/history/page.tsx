import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { InventoryHistoryTable } from '@/features/inventory/components/inventory-history-table';

/** T044 Phase J — Inventory History (movement ledger, read-only). */
export default function InventoryHistoryPage() {
  return (
    <PermissionGate code="inventory:view">
      <PageHeader
        title="Lịch sử biến động tồn kho"
        breadcrumbs={[
          { label: 'Kho vận' },
          { label: 'Tồn kho', href: '/inventory' },
          { label: 'Lịch sử biến động' },
        ]}
        action={
          <Button variant="outline" render={<Link href="/inventory">Quay lại tồn kho</Link>} />
        }
      />
      <InventoryHistoryTable />
    </PermissionGate>
  );
}
