'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getTransferControllerFindOneQueryKey,
  getTransferControllerSearchQueryKey,
  useTransferControllerApprove,
  useTransferControllerCancel,
  useTransferControllerReceive,
} from '@/generated/transfer/transfer';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type TransferActionDialogMode = 'approve' | 'receive' | 'cancel';

export interface TransferActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transferId: string;
  transferCode: string;
  mode: TransferActionDialogMode;
}

const COPY: Record<
  TransferActionDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (code: string) => string;
    successMessage: string;
    danger: boolean;
  }
> = {
  approve: {
    title: 'Duyệt phiếu điều chuyển?',
    confirmLabel: 'Duyệt',
    describe: (code) => `Phiếu "${code}" sẽ được duyệt và trừ tồn kho nguồn.`,
    successMessage: 'Đã duyệt phiếu điều chuyển',
    danger: false,
  },
  receive: {
    title: 'Xác nhận nhận hàng?',
    confirmLabel: 'Xác nhận nhận hàng',
    describe: (code) => `Phiếu "${code}" sẽ được đánh dấu đã nhận và cộng tồn kho đích.`,
    successMessage: 'Đã xác nhận nhận hàng',
    danger: false,
  },
  cancel: {
    title: 'Hủy phiếu điều chuyển?',
    confirmLabel: 'Hủy phiếu',
    describe: (code) => `Phiếu "${code}" sẽ bị hủy. Nếu đã duyệt, tồn kho nguồn sẽ được hoàn lại.`,
    successMessage: 'Đã hủy phiếu điều chuyển',
    danger: true,
  },
};

/** T044 Phase L — one dialog for Approve/Receive/Cancel, mirroring the Warehouse lifecycle-dialog pattern. */
export function TransferActionDialog({
  open,
  onOpenChange,
  transferId,
  transferCode,
  mode,
}: TransferActionDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: getTransferControllerSearchQueryKey() });
    queryClient.invalidateQueries({ queryKey: getTransferControllerFindOneQueryKey(transferId) });
    toast.success(copy.successMessage);
    setErrorMessage(null);
    onOpenChange(false);
  };

  const handleError = (error: NormalizedError) => {
    setErrorMessage(error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định');
  };

  const approveMutation = useTransferControllerApprove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const receiveMutation = useTransferControllerReceive<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const cancelMutation = useTransferControllerCancel<NormalizedError>({
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
      description={copy.describe(transferCode)}
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        activeMutation.mutate({ id: transferId });
      }}
    />
  );
}
