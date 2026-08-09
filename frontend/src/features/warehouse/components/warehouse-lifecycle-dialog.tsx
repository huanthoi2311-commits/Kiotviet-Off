'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getWarehouseControllerSearchQueryKey,
  useWarehouseControllerRemove,
  useWarehouseControllerRestore,
} from '@/generated/warehouse/warehouse';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type WarehouseLifecycleDialogMode = 'archive' | 'restore';

export interface WarehouseLifecycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouseId: string;
  warehouseName: string;
  mode: WarehouseLifecycleDialogMode;
}

const COPY: Record<
  WarehouseLifecycleDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (name: string) => string;
    successMessage: string;
    danger: boolean;
  }
> = {
  archive: {
    title: 'Xóa kho?',
    confirmLabel: 'Xóa',
    describe: (name) =>
      `Kho "${name}" sẽ bị xóa mềm và ẩn khỏi danh sách. Bị chặn nếu còn tồn kho hoặc giao dịch. Bạn có thể khôi phục lại sau.`,
    successMessage: 'Đã xóa kho',
    danger: true,
  },
  restore: {
    title: 'Khôi phục kho?',
    confirmLabel: 'Khôi phục',
    describe: (name) => `Kho "${name}" sẽ được khôi phục.`,
    successMessage: 'Đã khôi phục kho',
    danger: false,
  },
};

/** T044 Phase K — mirrors Category/Brand/Unit/Product's shared lifecycle-dialog pattern. */
export function WarehouseLifecycleDialog({
  open,
  onOpenChange,
  warehouseId,
  warehouseName,
  mode,
}: WarehouseLifecycleDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSuccess = (successMessage: string) => {
    queryClient.invalidateQueries({ queryKey: getWarehouseControllerSearchQueryKey() });
    toast.success(successMessage);
    setErrorMessage(null);
    onOpenChange(false);
  };

  const handleError = (error: NormalizedError) => {
    setErrorMessage(error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định');
  };

  const archiveMutation = useWarehouseControllerRemove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => handleSuccess(COPY.archive.successMessage),
      onError: handleError,
    },
  });

  const restoreMutation = useWarehouseControllerRestore<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => handleSuccess(COPY.restore.successMessage),
      onError: handleError,
    },
  });

  const activeMutation = mode === 'archive' ? archiveMutation : restoreMutation;

  const handleOpenChange = (next: boolean) => {
    if (!next) setErrorMessage(null);
    onOpenChange(next);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={copy.title}
      description={copy.describe(warehouseName)}
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        activeMutation.mutate({ id: warehouseId });
      }}
    />
  );
}
