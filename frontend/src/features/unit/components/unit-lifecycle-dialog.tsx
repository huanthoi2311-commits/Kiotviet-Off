'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getUnitControllerSearchQueryKey,
  useUnitControllerRemove,
  useUnitControllerRestore,
} from '@/generated/unit/unit';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type UnitLifecycleDialogMode = 'archive' | 'restore';

export interface UnitLifecycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  unitName: string;
  mode: UnitLifecycleDialogMode;
}

const COPY: Record<
  UnitLifecycleDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (unitName: string) => string;
    successMessage: string;
    danger: boolean;
  }
> = {
  archive: {
    title: 'Lưu trữ đơn vị tính?',
    confirmLabel: 'Lưu trữ',
    describe: (unitName) =>
      `Đơn vị tính "${unitName}" sẽ được lưu trữ và ẩn khỏi danh sách. Bạn có thể khôi phục lại sau.`,
    successMessage: 'Đã lưu trữ đơn vị tính',
    danger: true,
  },
  restore: {
    title: 'Khôi phục đơn vị tính?',
    confirmLabel: 'Khôi phục',
    describe: (unitName) =>
      `Đơn vị tính "${unitName}" sẽ được khôi phục và chuyển sang trạng thái Ngừng hoạt động.`,
    successMessage: 'Đã khôi phục đơn vị tính',
    danger: false,
  },
};

/** T042 Phase F — mirrors Category/Brand's shared lifecycle-dialog pattern. */
export function UnitLifecycleDialog({
  open,
  onOpenChange,
  unitId,
  unitName,
  mode,
}: UnitLifecycleDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSuccess = (successMessage: string) => {
    // Status is per-row here (Unit has a real ARCHIVED status value, unlike
    // Brand) — the currently active status filter naturally reflects the
    // change once this refetch resolves, same as Category.
    queryClient.invalidateQueries({ queryKey: getUnitControllerSearchQueryKey() });
    toast.success(successMessage);
    setErrorMessage(null);
    onOpenChange(false);
  };

  const handleError = (error: NormalizedError) => {
    setErrorMessage(error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định');
  };

  const archiveMutation = useUnitControllerRemove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => handleSuccess(COPY.archive.successMessage),
      onError: handleError,
    },
  });

  const restoreMutation = useUnitControllerRestore<NormalizedError>({
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
      description={copy.describe(unitName)}
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        activeMutation.mutate({ id: unitId });
      }}
    />
  );
}
