'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getSalesReturnControllerFindOneQueryKey,
  getSalesReturnControllerSearchQueryKey,
  useSalesReturnControllerApprove,
  useSalesReturnControllerCancel,
  useSalesReturnControllerComplete,
  useSalesReturnControllerReceive,
  useSalesReturnControllerSubmit,
} from '@/generated/sales-return/sales-return';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type SalesReturnActionDialogMode = 'submit' | 'approve' | 'receive' | 'complete' | 'cancel';

export interface SalesReturnActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesReturnId: string;
  salesReturnCode: string;
  version: number;
  mode: SalesReturnActionDialogMode;
  /** T047 §15/§16 — a version conflict (SALES_RETURN_006) is handled at the Detail level's own
   * "Tải lại" alert, not inside this transient dialog — the dialog is closed and the parent
   * refetches, since continuing to interact with a stale dialog is pointless. */
  onVersionConflict: (message: string) => void;
}

const COPY: Record<
  SalesReturnActionDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (code: string) => string;
    successMessage: string;
    danger: boolean;
  }
> = {
  submit: {
    title: 'Gửi phiếu trả hàng chờ duyệt?',
    confirmLabel: 'Gửi duyệt',
    describe: (code) => `Phiếu "${code}" sẽ được gửi chờ duyệt.`,
    successMessage: 'Đã gửi phiếu chờ duyệt',
    danger: false,
  },
  approve: {
    title: 'Duyệt phiếu trả hàng?',
    confirmLabel: 'Duyệt',
    describe: (code) => `Phiếu "${code}" sẽ được duyệt.`,
    successMessage: 'Đã duyệt phiếu trả hàng',
    danger: false,
  },
  receive: {
    title: 'Xác nhận nhận hàng trả?',
    confirmLabel: 'Xác nhận nhận hàng',
    describe: (code) =>
      `Phiếu "${code}" sẽ được đánh dấu đã nhận và cộng lại tồn kho ngay lập tức.`,
    successMessage: 'Đã xác nhận nhận hàng trả',
    danger: false,
  },
  complete: {
    title: 'Hoàn tất phiếu trả hàng?',
    confirmLabel: 'Hoàn tất',
    describe: (code) => `Phiếu "${code}" sẽ được hoàn tất.`,
    successMessage: 'Đã hoàn tất phiếu trả hàng',
    danger: false,
  },
  cancel: {
    title: 'Hủy phiếu trả hàng?',
    confirmLabel: 'Hủy phiếu',
    describe: (code) => `Phiếu "${code}" sẽ bị hủy.`,
    successMessage: 'Đã hủy phiếu trả hàng',
    danger: true,
  },
};

const VERSION_CONFLICT_CODES = new Set(['SALES_RETURN_006']);

/** T047 §4 — one dialog for Submit/Approve/Receive/Complete/Cancel, mirroring T044-T046's own action-dialog pattern. */
export function SalesReturnActionDialog({
  open,
  onOpenChange,
  salesReturnId,
  salesReturnCode,
  version,
  mode,
  onVersionConflict,
}: SalesReturnActionDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: getSalesReturnControllerSearchQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getSalesReturnControllerFindOneQueryKey(salesReturnId),
    });
    toast.success(copy.successMessage);
    setErrorMessage(null);
    onOpenChange(false);
  };

  const handleError = (error: NormalizedError) => {
    if (error.kind === 'api-error' && VERSION_CONFLICT_CODES.has(error.code)) {
      onOpenChange(false);
      onVersionConflict(error.message);
      return;
    }
    setErrorMessage(error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định');
  };

  const submitMutation = useSalesReturnControllerSubmit<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const approveMutation = useSalesReturnControllerApprove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const receiveMutation = useSalesReturnControllerReceive<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const completeMutation = useSalesReturnControllerComplete<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const cancelMutation = useSalesReturnControllerCancel<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });

  const activeMutation = {
    submit: submitMutation,
    approve: approveMutation,
    receive: receiveMutation,
    complete: completeMutation,
    cancel: cancelMutation,
  }[mode];

  const handleOpenChange = (next: boolean) => {
    if (!next) setErrorMessage(null);
    onOpenChange(next);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={copy.title}
      description={copy.describe(salesReturnCode)}
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        activeMutation.mutate({ id: salesReturnId, data: { version } });
      }}
    />
  );
}
