import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { UserEditForm } from '@/features/user/components/user-edit-form';

/** T052.02C — combined detail/edit page (master-data precedent, `customer-edit-form.tsx`). */
export default async function UserEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PermissionGate code="user:view">
      <PageHeader
        title="Chi tiết nhân viên"
        breadcrumbs={[
          { label: 'Tổ chức' },
          { label: 'Nhân viên', href: '/users' },
          { label: 'Chi tiết' },
        ]}
      />
      <UserEditForm id={id} />
    </PermissionGate>
  );
}
