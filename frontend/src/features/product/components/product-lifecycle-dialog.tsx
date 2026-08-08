'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getProductControllerSearchQueryKey,
  useProductControllerRemove,
  useProductControllerRestore,
} from '@/generated/product/product';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type ProductLifecycleDialogMode = 'archive' | 'restore';

export interface ProductLifecycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  mode: ProductLifecycleDialogMode;
}

const COPY: Record<
  ProductLifecycleDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (productName: string) => string;
    successMessage: string;
    danger: boolean;
  }
> = {
  archive: {
    title: 'Lưu trữ sản phẩm?',
    confirmLabel: 'Lưu trữ',
    describe: (productName) =>
      `Sản phẩm "${productName}" sẽ được lưu trữ và ẩn khỏi danh sách. Bạn có thể khôi phục lại sau.`,
    successMessage: 'Đã lưu trữ sản phẩm',
    danger: true,
  },
  restore: {
    title: 'Khôi phục sản phẩm?',
    confirmLabel: 'Khôi phục',
    describe: (productName) =>
      `Sản phẩm "${productName}" sẽ được khôi phục và chuyển sang trạng thái Ngừng hoạt động.`,
    successMessage: 'Đã khôi phục sản phẩm',
    danger: false,
  },
};

/**
 * T043 Phase G — mirrors Category/Brand/Unit's shared lifecycle-dialog pattern. Archive can be
 * rejected by the now-real PRODUCT_012 guard (RFC-0001 §8, activated by T043.05) when the product
 * is a Variant Parent with an active Variant Child — surfaced here exactly like Unit's dual-guard
 * UNIT_003 (generic `error.message` passthrough, no special-casing needed).
 */
export function ProductLifecycleDialog({
  open,
  onOpenChange,
  productId,
  productName,
  mode,
}: ProductLifecycleDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSuccess = (successMessage: string) => {
    queryClient.invalidateQueries({ queryKey: getProductControllerSearchQueryKey() });
    toast.success(successMessage);
    setErrorMessage(null);
    onOpenChange(false);
  };

  const handleError = (error: NormalizedError) => {
    setErrorMessage(error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định');
  };

  const archiveMutation = useProductControllerRemove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => handleSuccess(COPY.archive.successMessage),
      onError: handleError,
    },
  });

  const restoreMutation = useProductControllerRestore<NormalizedError>({
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
      description={copy.describe(productName)}
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        activeMutation.mutate({ id: productId });
      }}
    />
  );
}
