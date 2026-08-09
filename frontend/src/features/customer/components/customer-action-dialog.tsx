'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getCustomerControllerFindOneQueryKey,
  getCustomerControllerSearchQueryKey,
  useCustomerControllerActivate,
  useCustomerControllerDeactivate,
  useCustomerControllerRemove,
  useCustomerControllerRestore,
} from '@/generated/customer/customer';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type CustomerActionDialogMode = 'activate' | 'deactivate' | 'archive' | 'restore';

export interface CustomerActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  version: number;
  mode: CustomerActionDialogMode;
  /** T048 §7 — a version conflict (CUSTOMER_005) is handled at the Detail level's own
   * "Tải lại" alert, not inside this transient dialog — mirrors T047's own pattern. */
  onVersionConflict: (message: string) => void;
}

const COPY: Record<
  CustomerActionDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (name: string) => string;
    successMessage: string;
    danger: boolean;
  }
> = {
  activate: {
    title: 'Kích hoạt khách hàng?',
    confirmLabel: 'Kích hoạt',
    describe: (name) => `Khách hàng "${name}" sẽ được kích hoạt.`,
    successMessage: 'Đã kích hoạt khách hàng',
    danger: false,
  },
  deactivate: {
    title: 'Ngừng hoạt động khách hàng?',
    confirmLabel: 'Ngừng hoạt động',
    describe: (name) => `Khách hàng "${name}" sẽ ngừng hoạt động.`,
    successMessage: 'Đã ngừng hoạt động khách hàng',
    danger: false,
  },
  archive: {
    title: 'Lưu trữ khách hàng?',
    confirmLabel: 'Lưu trữ',
    describe: (name) => `Khách hàng "${name}" sẽ được lưu trữ.`,
    successMessage: 'Đã lưu trữ khách hàng',
    danger: true,
  },
  restore: {
    title: 'Khôi phục khách hàng?',
    confirmLabel: 'Khôi phục',
    describe: (name) => `Khách hàng "${name}" sẽ được khôi phục (trạng thái Ngừng hoạt động).`,
    successMessage: 'Đã khôi phục khách hàng',
    danger: false,
  },
};

const VERSION_CONFLICT_CODES = new Set(['CUSTOMER_005']);

/** T048 Phase S — one dialog for Activate/Deactivate/Archive/Restore, mirroring T047's action-dialog pattern. */
export function CustomerActionDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  version,
  mode,
  onVersionConflict,
}: CustomerActionDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: getCustomerControllerSearchQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getCustomerControllerFindOneQueryKey(customerId),
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

  const activateMutation = useCustomerControllerActivate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const deactivateMutation = useCustomerControllerDeactivate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const archiveMutation = useCustomerControllerRemove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const restoreMutation = useCustomerControllerRestore<NormalizedError>({
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
      description={copy.describe(customerName)}
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        activeMutation.mutate({ id: customerId, data: { version } });
      }}
    />
  );
}
