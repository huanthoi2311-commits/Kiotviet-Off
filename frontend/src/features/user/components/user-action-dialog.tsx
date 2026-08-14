'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getUserControllerFindOneQueryKey,
  getUserControllerSearchQueryKey,
  useUserControllerDeactivate,
  useUserControllerReactivate,
} from '@/generated/user/user';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type UserActionDialogMode = 'deactivate' | 'reactivate';

export interface UserActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  mode: UserActionDialogMode;
}

const COPY: Record<
  UserActionDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (name: string) => string;
    successMessage: string;
  }
> = {
  deactivate: {
    title: 'Vô hiệu hóa nhân viên?',
    confirmLabel: 'Vô hiệu hóa',
    describe: (name) =>
      `Nhân viên "${name}" sẽ không thể đăng nhập nữa và các phiên đăng nhập hiện tại sẽ bị hủy.`,
    successMessage: 'Đã vô hiệu hóa nhân viên',
  },
  reactivate: {
    title: 'Kích hoạt lại nhân viên?',
    confirmLabel: 'Kích hoạt lại',
    describe: (name) => `Nhân viên "${name}" sẽ có thể đăng nhập trở lại.`,
    successMessage: 'Đã kích hoạt lại nhân viên',
  },
};

/**
 * T052.02C §9/§10 — one dialog for Deactivate/Reactivate, no `version` field (D6 — User has no
 * CAS). Backend is authoritative for self/owner protection (D1) and transition validity — every
 * rejection (USER_CANNOT_DEACTIVATE_SELF/USER_CANNOT_DEACTIVATE_OWNER/USER_INVALID_TRANSITION)
 * simply renders here as an explicit, still-open-dialog error message, never invented client-side.
 */
export function UserActionDialog({
  open,
  onOpenChange,
  userId,
  userName,
  mode,
}: UserActionDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: getUserControllerSearchQueryKey() });
    queryClient.invalidateQueries({ queryKey: getUserControllerFindOneQueryKey(userId) });
    toast.success(copy.successMessage);
    setErrorMessage(null);
    onOpenChange(false);
  };

  const handleError = (error: NormalizedError) => {
    setErrorMessage(error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định');
  };

  const deactivateMutation = useUserControllerDeactivate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const reactivateMutation = useUserControllerReactivate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });

  const activeMutation = mode === 'deactivate' ? deactivateMutation : reactivateMutation;

  const handleOpenChange = (next: boolean) => {
    if (!next) setErrorMessage(null);
    onOpenChange(next);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={copy.title}
      description={copy.describe(userName)}
      confirmLabel={copy.confirmLabel}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        activeMutation.mutate({ id: userId });
      }}
    />
  );
}
