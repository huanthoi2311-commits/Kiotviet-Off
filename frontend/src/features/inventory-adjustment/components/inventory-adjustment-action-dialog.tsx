'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getInventoryAdjustmentControllerFindOneQueryKey,
  getInventoryAdjustmentControllerSearchQueryKey,
  useInventoryAdjustmentControllerApprove,
  useInventoryAdjustmentControllerComplete,
  useInventoryAdjustmentControllerSubmit,
} from '@/generated/inventory-adjustment/inventory-adjustment';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type InventoryAdjustmentActionDialogMode = 'submit' | 'approve' | 'complete';

export interface InventoryAdjustmentActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adjustmentId: string;
  adjustmentCode: string;
  mode: InventoryAdjustmentActionDialogMode;
}

const COPY: Record<
  InventoryAdjustmentActionDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (code: string) => string;
    successMessage: string;
  }
> = {
  submit: {
    title: 'Gửi phiếu chờ duyệt?',
    confirmLabel: 'Gửi duyệt',
    describe: (code) => `Phiếu "${code}" sẽ được gửi chờ duyệt.`,
    successMessage: 'Đã gửi phiếu chờ duyệt',
  },
  approve: {
    title: 'Duyệt phiếu điều chỉnh?',
    confirmLabel: 'Duyệt',
    describe: (code) => `Phiếu "${code}" sẽ được duyệt.`,
    successMessage: 'Đã duyệt phiếu điều chỉnh',
  },
  complete: {
    title: 'Hoàn tất phiếu điều chỉnh?',
    confirmLabel: 'Hoàn tất',
    describe: (code) => `Phiếu "${code}" sẽ được hoàn tất và đồng bộ tồn kho ngay lập tức.`,
    successMessage: 'Đã hoàn tất phiếu điều chỉnh',
  },
};

/** T044 Phase M — one dialog for Submit/Approve/Complete, mirroring Transfer's action-dialog pattern. */
export function InventoryAdjustmentActionDialog({
  open,
  onOpenChange,
  adjustmentId,
  adjustmentCode,
  mode,
}: InventoryAdjustmentActionDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: getInventoryAdjustmentControllerSearchQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getInventoryAdjustmentControllerFindOneQueryKey(adjustmentId),
    });
    toast.success(copy.successMessage);
    setErrorMessage(null);
    onOpenChange(false);
  };

  const handleError = (error: NormalizedError) => {
    setErrorMessage(error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định');
  };

  const submitMutation = useInventoryAdjustmentControllerSubmit<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const approveMutation = useInventoryAdjustmentControllerApprove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const completeMutation = useInventoryAdjustmentControllerComplete<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });

  const activeMutation =
    mode === 'submit' ? submitMutation : mode === 'approve' ? approveMutation : completeMutation;

  const handleOpenChange = (next: boolean) => {
    if (!next) setErrorMessage(null);
    onOpenChange(next);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={copy.title}
      description={copy.describe(adjustmentCode)}
      confirmLabel={copy.confirmLabel}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        activeMutation.mutate({ id: adjustmentId });
      }}
    />
  );
}
