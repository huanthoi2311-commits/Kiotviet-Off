import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { RoleCreateForm } from '@/features/rbac/components/role-form';

/** T052.03C — Role Create. */
export default function NewRolePage() {
  return (
    <PermissionGate code="role:create">
      <PageHeader
        title="Thêm vai trò"
        breadcrumbs={[
          { label: 'Tổ chức' },
          { label: 'Vai trò', href: '/roles' },
          { label: 'Thêm mới' },
        ]}
      />
      <RoleCreateForm />
    </PermissionGate>
  );
}
