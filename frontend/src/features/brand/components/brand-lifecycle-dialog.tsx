'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getBrandControllerSearchQueryKey,
  useBrandControllerRemove,
  useBrandControllerRestore,
} from '@/generated/brand/brand';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type BrandLifecycleDialogMode = 'archive' | 'restore';

export interface BrandLifecycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  brandName: string;
  mode: BrandLifecycleDialogMode;
}

const COPY: Record<
  BrandLifecycleDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (brandName: string) => string;
    successMessage: string;
    /** Category precedent (T034.01 §5): destructive red for Archive, neutral for Restore. */
    danger: boolean;
  }
> = {
  archive: {
    title: 'Lưu trữ thương hiệu?',
    confirmLabel: 'Lưu trữ',
    describe: (brandName) =>
      `Thương hiệu "${brandName}" sẽ được lưu trữ và ẩn khỏi danh sách. Bạn có thể khôi phục lại sau.`,
    successMessage: 'Đã lưu trữ thương hiệu',
    danger: true,
  },
  restore: {
    title: 'Khôi phục thương hiệu?',
    confirmLabel: 'Khôi phục',
    describe: (brandName) =>
      `Thương hiệu "${brandName}" sẽ được khôi phục và chuyển sang trạng thái Ngừng hoạt động.`,
    successMessage: 'Đã khôi phục thương hiệu',
    danger: false,
  },
};

/**
 * T041 Phase F — one shared component for both lifecycle actions, mirroring
 * Category's `CategoryLifecycleDialog` (T039 AD-2). Both mutations are
 * called unconditionally (React's rules of hooks); only the active mode's
 * `mutate()` is ever invoked.
 */
export function BrandLifecycleDialog({
  open,
  onOpenChange,
  brandId,
  brandName,
  mode,
}: BrandLifecycleDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSuccess = (successMessage: string) => {
    // Invalidate the (parameterized) list query — no redirect, no full
    // refresh. Archive/Restore both change which `archived=`/`status=`
    // bucket a row belongs to, so the currently-viewed page's own filter
    // naturally reflects the change once this refetch resolves.
    queryClient.invalidateQueries({ queryKey: getBrandControllerSearchQueryKey() });
    toast.success(successMessage);
    setErrorMessage(null);
    onOpenChange(false);
  };

  const handleError = (error: NormalizedError) => {
    setErrorMessage(error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định');
  };

  const archiveMutation = useBrandControllerRemove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => handleSuccess(COPY.archive.successMessage),
      onError: handleError,
    },
  });

  const restoreMutation = useBrandControllerRestore<NormalizedError>({
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
      description={copy.describe(brandName)}
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        activeMutation.mutate({ id: brandId });
      }}
    />
  );
}
