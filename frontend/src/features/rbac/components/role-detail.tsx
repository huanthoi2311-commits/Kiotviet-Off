'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { useRolesControllerDetail, usePermissionsControllerList } from '@/generated/rbac/rbac';
import type {
  PermissionResponseDto,
  RoleWithPermissionsResponseDto,
} from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/use-permission';
import type { NormalizedError } from '@/services/api-client';
import { PermissionMatrix } from './permission-matrix';

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * T052.03C §5/§6 — Role Detail: read-only metadata (code/name/description/isSystem) + the
 * permission matrix. No role name/description edit UI, no delete/archive/restore UI — none of
 * those endpoints exist. `isSystem` is purely informational (§12) — it never disables the matrix;
 * only `role:update` and the backend's own `RBAC_006` invariant do that.
 */
export function RoleDetail({ id }: { id: string }) {
  const canUpdate = usePermission('role:update');

  const {
    data: role,
    isLoading: isRoleLoading,
    isError: isRoleError,
    error: roleError,
    refetch: refetchRole,
  } = useRolesControllerDetail<RoleWithPermissionsResponseDto, NormalizedError>(id);

  const {
    data: permissions,
    isLoading: isPermissionsLoading,
    isError: isPermissionsError,
    error: permissionsError,
    refetch: refetchPermissions,
  } = usePermissionsControllerList<PermissionResponseDto[], NormalizedError>();

  if (isRoleLoading || isPermissionsLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isRoleError && roleError.kind === 'api-error' && roleError.code === 'RBAC_001') {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Không tìm thấy vai trò"
        description="Vai trò này có thể đã bị xóa hoặc không tồn tại."
        action={<Button render={<Link href="/roles">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isRoleError || !role) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <p className="text-destructive text-sm">
          {roleError?.message ?? 'Đã xảy ra lỗi không xác định'}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetchRole()}>
          Thử lại
        </Button>
      </div>
    );
  }

  if (isPermissionsError || !permissions) {
    return (
      <div className="flex flex-col gap-6">
        <RoleMetadata role={role} />
        <div className="flex flex-col items-center gap-2 rounded-lg border p-8 text-center">
          <p className="text-destructive text-sm">
            {permissionsError?.message ?? 'Không thể tải danh mục quyền'}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetchPermissions()}>
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <RoleMetadata role={role} />
      <PermissionMatrix
        roleId={role.id}
        permissions={permissions}
        initialPermissionCodes={role.permissionCodes}
        canEdit={canUpdate}
      />
    </div>
  );
}

function RoleMetadata({ role }: { role: RoleWithPermissionsResponseDto }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{role.name}</h2>
        {role.isSystem && (
          <span className="bg-muted inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium">
            Hệ thống
          </span>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground text-sm">Mã vai trò</dt>
          <dd className="text-sm">{role.code}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Mô tả</dt>
          <dd className="text-sm">{asNullableString(role.description) ?? '—'}</dd>
        </div>
      </dl>
    </div>
  );
}
