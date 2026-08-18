import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { PermissionButton } from '@/components/common/permission-button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { EntitlementGate } from '@/features/entitlement/components/entitlement-gate';
import { RoleTable } from '@/features/rbac/components/role-table';

/** T052.03C — Role List + Create entry point. T053.03 — gated by RBAC_MANAGEMENT entitlement. */
export default function RolesPage() {
  return (
    <EntitlementGate feature="RBAC_MANAGEMENT">
      <PermissionGate code="role:view">
        <PageHeader
          title="Vai trò"
          breadcrumbs={[{ label: 'Tổ chức' }, { label: 'Vai trò' }]}
          action={
            <PermissionButton
              permission="role:create"
              render={<Link href="/roles/new">Thêm vai trò</Link>}
            />
          }
        />
        <RoleTable />
      </PermissionGate>
    </EntitlementGate>
  );
}
