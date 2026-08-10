'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getSupplierControllerFindOneQueryKey,
  getSupplierControllerSearchQueryKey,
  useSupplierControllerActivate,
  useSupplierControllerDeactivate,
  useSupplierControllerRemove,
  useSupplierControllerRestore,
} from '@/generated/supplier/supplier';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type SupplierActionDialogMode = 'activate' | 'deactivate' | 'archive' | 'restore';

export interface SupplierActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  supplierName: string;
  version: number;
  mode: SupplierActionDialogMode;
  /** T049 §7 — a version conflict (SUPPLIER_009) is handled at the Detail level's own "Tải lại"
   * alert, not inside this transient dialog — mirrors T048's own pattern. */
  onVersionConflict: (message: string) => void;
}

const COPY: Record<
  SupplierActionDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (name: string) => string;
    successMessage: string;
    danger: boolean;
  }
> = {
  activate: {
    title: 'Kích hoạt nhà cung cấp?',
    confirmLabel: 'Kích hoạt',
    describe: (name) => `Nhà cung cấp "${name}" sẽ được kích hoạt.`,
    successMessage: 'Đã kích hoạt nhà cung cấp',
    danger: false,
  },
  deactivate: {
    title: 'Ngừng hoạt động nhà cung cấp?',
    confirmLabel: 'Ngừng hoạt động',
    describe: (name) => `Nhà cung cấp "${name}" sẽ ngừng hoạt động.`,
    successMessage: 'Đã ngừng hoạt động nhà cung cấp',
    danger: false,
  },
  archive: {
    title: 'Lưu trữ nhà cung cấp?',
    confirmLabel: 'Lưu trữ',
    describe: (name) => `Nhà cung cấp "${name}" sẽ được lưu trữ.`,
    successMessage: 'Đã lưu trữ nhà cung cấp',
    danger: true,
  },
  restore: {
    title: 'Khôi phục nhà cung cấp?',
    confirmLabel: 'Khôi phục',
    describe: (name) => `Nhà cung cấp "${name}" sẽ được khôi phục (trạng thái Ngừng hoạt động).`,
    successMessage: 'Đã khôi phục nhà cung cấp',
    danger: false,
  },
};

const VERSION_CONFLICT_CODES = new Set(['SUPPLIER_009']);

/** T049 Phase U — one dialog for Activate/Deactivate/Archive/Restore, mirroring T048's action-dialog pattern. */
export function SupplierActionDialog({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  version,
  mode,
  onVersionConflict,
}: SupplierActionDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: getSupplierControllerSearchQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getSupplierControllerFindOneQueryKey(supplierId),
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

  const activateMutation = useSupplierControllerActivate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const deactivateMutation = useSupplierControllerDeactivate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const archiveMutation = useSupplierControllerRemove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const restoreMutation = useSupplierControllerRestore<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });

  const activeMutation = {
    activate: activateMutation,
    deactivate: deactivateMutation,
    archive: archiveMutation,
    restore: restoreMutation,
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
      description={copy.describe(supplierName)}
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        activeMutation.mutate({ id: supplierId, data: { version } });
      }}
    />
  );
}
