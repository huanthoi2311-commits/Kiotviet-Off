import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { PermissionButton } from '@/components/common/permission-button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { RoleTable } from '@/features/rbac/components/role-table';

/** T052.03C — Role List + Create entry point. */
export default function RolesPage() {
  return (
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
  );
}
