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
  /** T051.02 — Optimistic Lock, chỉ thật sự cần cho `complete` (hành động duy nhất tác động
   * Inventory); submit/approve không đụng Inventory nên không gửi version. */
  adjustmentVersion: number;
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
  adjustmentVersion,
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

  /** T051.02 AD-1 §12 — on a version conflict (INVENTORY_ADJUSTMENT_008) the dialog stays open and
   * the message is shown (never silently retried with a new version); the detail query is
   * invalidated so the next attempt (after the user re-opens the dialog) reads a fresh version. */
  const handleError = (error: NormalizedError) => {
    setErrorMessage(error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định');
    if (error.kind === 'api-error' && error.code === 'INVENTORY_ADJUSTMENT_008') {
      queryClient.invalidateQueries({
        queryKey: getInventoryAdjustmentControllerFindOneQueryKey(adjustmentId),
      });
    }
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
        if (mode === 'submit') {
          submitMutation.mutate({ id: adjustmentId });
        } else if (mode === 'approve') {
          approveMutation.mutate({ id: adjustmentId });
        } else {
          completeMutation.mutate({
            id: adjustmentId,
            data: { version: adjustmentVersion },
          });
        }
      }}
    />
  );
}
