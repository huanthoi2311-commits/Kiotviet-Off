import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { PermissionButton } from '@/components/common/permission-button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { EntitlementGate } from '@/features/entitlement/components/entitlement-gate';
import { SupplierTable } from '@/features/supplier/components/supplier-table';

/** T049 — Supplier List + Create entry point + Excel Export. T053.03 — gated by SUPPLIER entitlement. */
export default function SuppliersPage() {
  return (
    <EntitlementGate feature="SUPPLIER">
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
    </EntitlementGate>
  );
}
