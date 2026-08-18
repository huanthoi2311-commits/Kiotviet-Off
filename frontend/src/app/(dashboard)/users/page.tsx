import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { PermissionButton } from '@/components/common/permission-button';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { EntitlementGate } from '@/features/entitlement/components/entitlement-gate';
import { UserTable } from '@/features/user/components/user-table';

/** T052.02C — User List + Create entry point. T053.03 — gated by USER_MANAGEMENT entitlement. */
export default function UsersPage() {
  return (
    <EntitlementGate feature="USER_MANAGEMENT">
      <PermissionGate code="user:view">
        <PageHeader
          title="Nhân viên"
          breadcrumbs={[{ label: 'Tổ chức' }, { label: 'Nhân viên' }]}
          action={
            <PermissionButton
              permission="user:create"
              render={<Link href="/users/new">Thêm nhân viên</Link>}
            />
          }
        />
        <UserTable />
      </PermissionGate>
    </EntitlementGate>
  );
}
