'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getUserControllerFindOneQueryKey } from '@/generated/user/user';
import { useRolesControllerRemoveFromUser } from '@/generated/rbac/rbac';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export interface RemoveRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  roleId: string;
  roleCode: string;
}

/** T052.03C §10 — exact required framing: NEVER "system role", always the owner's final
 * role:update source. Backend is the sole authority (RBAC_006) — this is display copy only. */
const OWNER_PROTECTION_MESSAGE =
  'Không thể gỡ vai trò này: thao tác sẽ khiến chủ sở hữu tổ chức mất nguồn quyền role:update cuối cùng để quản lý vai trò.';

/** T052.03C §10 — `DELETE /roles/:roleId/users/:userId`, requires confirmation because access may
 * be lost. On `RBAC_OWNER_PERMISSION_REQUIRED` the dialog stays open with the explanatory copy
 * above instead of closing. */
export function RemoveRoleDialog({
  open,
  onOpenChange,
  userId,
  roleId,
  roleCode,
}: RemoveRoleDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useRolesControllerRemoveFromUser<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getUserControllerFindOneQueryKey(userId) });
        toast.success('Đã gỡ vai trò khỏi người dùng');
        setErrorMessage(null);
        onOpenChange(false);
      },
      onError: (error) => {
        if (error.kind === 'api-error' && error.code === 'RBAC_006') {
          setErrorMessage(OWNER_PROTECTION_MESSAGE);
          return;
        }
        setErrorMessage(
          error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định',
        );
      },
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) setErrorMessage(null);
    onOpenChange(next);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Gỡ vai trò khỏi người dùng?"
      description={`Người dùng có thể mất ngay quyền truy cập gắn với vai trò "${roleCode}".`}
      confirmLabel="Gỡ vai trò"
      danger
      isConfirming={mutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        mutation.mutate({ roleId, userId });
      }}
    />
  );
}
