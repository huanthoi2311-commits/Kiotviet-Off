'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getPurchaseOrderControllerFindOneQueryKey,
  getPurchaseOrderControllerSearchQueryKey,
  usePurchaseOrderControllerApprove,
  usePurchaseOrderControllerCancel,
  usePurchaseOrderControllerReceive,
} from '@/generated/purchase-order/purchase-order';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type PurchaseOrderActionDialogMode = 'approve' | 'receive' | 'cancel';

export interface PurchaseOrderActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  /** T051.02 — Optimistic Lock, chỉ thật sự cần cho `receive` (đơn hành động duy nhất tác động
   * Inventory/Debt); approve/cancel không đụng Inventory nên không gửi version. */
  purchaseOrderVersion: number;
  mode: PurchaseOrderActionDialogMode;
}

const COPY: Record<
  PurchaseOrderActionDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (code: string) => string;
    successMessage: string;
    danger: boolean;
  }
> = {
  approve: {
    title: 'Duyệt đơn nhập hàng?',
    confirmLabel: 'Duyệt',
    describe: (code) => `Đơn "${code}" sẽ được duyệt.`,
    successMessage: 'Đã duyệt đơn nhập hàng',
    danger: false,
  },
  receive: {
    title: 'Xác nhận nhận hàng?',
    confirmLabel: 'Xác nhận nhận hàng',
    describe: (code) =>
      `Đơn "${code}" sẽ được đánh dấu đã nhận toàn bộ hàng và cộng tồn kho ngay lập tức. Không thể hoàn tác sau bước này (dùng Trả hàng nhà cung cấp nếu cần).`,
    successMessage: 'Đã xác nhận nhận hàng',
    danger: false,
  },
  cancel: {
    title: 'Hủy đơn nhập hàng?',
    confirmLabel: 'Hủy đơn',
    describe: (code) => `Đơn "${code}" sẽ bị hủy.`,
    successMessage: 'Đã hủy đơn nhập hàng',
    danger: true,
  },
};

/** T045 §5 — one dialog for Approve/Receive/Cancel, mirroring Transfer's action-dialog pattern (T044). */
export function PurchaseOrderActionDialog({
  open,
  onOpenChange,
  purchaseOrderId,
  purchaseOrderCode,
  purchaseOrderVersion,
  mode,
}: PurchaseOrderActionDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: getPurchaseOrderControllerSearchQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getPurchaseOrderControllerFindOneQueryKey(purchaseOrderId),
    });
    toast.success(copy.successMessage);
    setErrorMessage(null);
    onOpenChange(false);
  };

  /** T051.02 AD-1 §12 — on a version conflict (PURCHASE_ORDER_005) the dialog stays open and the
   * message is shown (never silently retried with a new version); the detail query is invalidated
   * so the next attempt (after the user re-opens the dialog) reads a fresh version. */
  const handleError = (error: NormalizedError) => {
    setErrorMessage(error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định');
    if (error.kind === 'api-error' && error.code === 'PURCHASE_ORDER_005') {
      queryClient.invalidateQueries({
        queryKey: getPurchaseOrderControllerFindOneQueryKey(purchaseOrderId),
      });
    }
  };

  const approveMutation = usePurchaseOrderControllerApprove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const receiveMutation = usePurchaseOrderControllerReceive<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const cancelMutation = usePurchaseOrderControllerCancel<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });

  const activeMutation =
    mode === 'approve' ? approveMutation : mode === 'receive' ? receiveMutation : cancelMutation;

  const handleOpenChange = (next: boolean) => {
    if (!next) setErrorMessage(null);
    onOpenChange(next);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={copy.title}
      description={copy.describe(purchaseOrderCode)}
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        if (mode === 'approve') {
          approveMutation.mutate({ id: purchaseOrderId });
        } else if (mode === 'receive') {
          receiveMutation.mutate({
            id: purchaseOrderId,
            data: { version: purchaseOrderVersion },
          });
        } else {
          cancelMutation.mutate({ id: purchaseOrderId });
        }
      }}
    />
  );
}
