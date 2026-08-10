import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { PermissionButton } from '@/components/common/permission-button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { SupplierTable } from '@/features/supplier/components/supplier-table';

/** T049 — Supplier List + Create entry point + Excel Export. */
export default function SuppliersPage() {
  return (
    <PermissionGate code="supplier:view">
      <PageHeader
        title="Nhà cung cấp"
        breadcrumbs={[{ label: 'Mua hàng' }, { label: 'Nhà cung cấp' }]}
        action={
          <PermissionButton
            permission="supplier:create"
            render={<Link href="/suppliers/new">Thêm nhà cung cấp</Link>}
          />
        }
      />
      <SupplierTable />
    </PermissionGate>
  );
}
