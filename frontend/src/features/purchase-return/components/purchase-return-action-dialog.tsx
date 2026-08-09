'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getPurchaseReturnControllerFindOneQueryKey,
  getPurchaseReturnControllerSearchQueryKey,
  usePurchaseReturnControllerApprove,
  usePurchaseReturnControllerCancel,
  usePurchaseReturnControllerComplete,
} from '@/generated/purchase-return/purchase-return';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type PurchaseReturnActionDialogMode = 'approve' | 'complete' | 'cancel';

export interface PurchaseReturnActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseReturnId: string;
  purchaseReturnCode: string;
  mode: PurchaseReturnActionDialogMode;
}

const COPY: Record<
  PurchaseReturnActionDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (code: string) => string;
    successMessage: string;
    danger: boolean;
  }
> = {
  approve: {
    title: 'Duyệt phiếu trả hàng?',
    confirmLabel: 'Duyệt',
    describe: (code) => `Phiếu "${code}" sẽ được duyệt.`,
    successMessage: 'Đã duyệt phiếu trả hàng',
    danger: false,
  },
  complete: {
    title: 'Hoàn tất phiếu trả hàng?',
    confirmLabel: 'Hoàn tất',
    describe: (code) => `Phiếu "${code}" sẽ được hoàn tất và trừ tồn kho ngay lập tức.`,
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

/** T045 §7 — one dialog for Approve/Complete/Cancel, mirroring Purchase Order's own action-dialog pattern. */
export function PurchaseReturnActionDialog({
  open,
  onOpenChange,
  purchaseReturnId,
  purchaseReturnCode,
  mode,
}: PurchaseReturnActionDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: getPurchaseReturnControllerSearchQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getPurchaseReturnControllerFindOneQueryKey(purchaseReturnId),
    });
    toast.success(copy.successMessage);
    setErrorMessage(null);
    onOpenChange(false);
  };

  const handleError = (error: NormalizedError) => {
    setErrorMessage(error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định');
  };

  const approveMutation = usePurchaseReturnControllerApprove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const completeMutation = usePurchaseReturnControllerComplete<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const cancelMutation = usePurchaseReturnControllerCancel<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });

  const activeMutation =
    mode === 'approve' ? approveMutation : mode === 'complete' ? completeMutation : cancelMutation;

  const handleOpenChange = (next: boolean) => {
    if (!next) setErrorMessage(null);
    onOpenChange(next);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={copy.title}
      description={copy.describe(purchaseReturnCode)}
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        activeMutation.mutate({ id: purchaseReturnId });
      }}
    />
  );
}
