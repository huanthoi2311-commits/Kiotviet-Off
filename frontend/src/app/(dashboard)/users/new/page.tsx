import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { UserCreateForm } from '@/features/user/components/user-form';

/** T052.02C — Create only. */
export default function NewUserPage() {
  return (
    <PermissionGate code="user:create">
      <PageHeader
        title="Thêm nhân viên"
        breadcrumbs={[
          { label: 'Tổ chức' },
          { label: 'Nhân viên', href: '/users' },
          { label: 'Thêm mới' },
        ]}
      />
      <UserCreateForm />
    </PermissionGate>
  );
}
