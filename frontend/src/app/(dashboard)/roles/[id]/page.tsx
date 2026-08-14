import { PageHeader } from '@/components/common/page-header';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { RoleDetail } from '@/features/rbac/components/role-detail';

/** T052.03C — Role Detail + Permission Matrix. */
export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PermissionGate code="role:view">
      <PageHeader
        title="Chi tiết vai trò"
        breadcrumbs={[
          { label: 'Tổ chức' },
          { label: 'Vai trò', href: '/roles' },
          { label: 'Chi tiết' },
        ]}
      />
      <RoleDetail id={id} />
    </PermissionGate>
  );
}
