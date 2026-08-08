'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getCategoryControllerGetTreeQueryKey,
  getCategoryControllerListQueryKey,
  useCategoryControllerRemove,
  useCategoryControllerRestore,
} from '@/generated/category/category';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type CategoryLifecycleDialogMode = 'archive' | 'restore';

export interface CategoryLifecycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  mode: CategoryLifecycleDialogMode;
}

const COPY: Record<
  CategoryLifecycleDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (categoryName: string) => string;
    successMessage: string;
    /** T034.01 §5: destructive red for Archive, neutral for Restore. */
    danger: boolean;
  }
> = {
  archive: {
    title: 'Lưu trữ danh mục?',
    confirmLabel: 'Lưu trữ',
    describe: (categoryName) =>
      `Danh mục "${categoryName}" sẽ được lưu trữ và ẩn khỏi danh sách. Bạn có thể khôi phục lại sau.`,
    successMessage: 'Đã lưu trữ danh mục',
    danger: true,
  },
  restore: {
    title: 'Khôi phục danh mục?',
    confirmLabel: 'Khôi phục',
    describe: (categoryName) =>
      `Danh mục "${categoryName}" sẽ được khôi phục và chuyển sang trạng thái Ngừng hoạt động.`,
    successMessage: 'Đã khôi phục danh mục',
    danger: false,
  },
};

/**
 * T039 AD-2 — renamed from `CategoryArchiveDialog` (T038.10); one shared
 * component for both lifecycle actions instead of a separate Restore
 * dialog. `mode` is a required prop now (was optional/archive-only)
 * selecting both the copy below and which mutation is active.
 *
 * Both `useCategoryControllerRemove` and `useCategoryControllerRestore` are
 * called unconditionally — required by React's rules of hooks, since which
 * one is "active" can only be decided *after* both have already been
 * called, not before. Only the active mutation's `mutate()` is ever
 * invoked; the idle one never fires its own onSuccess/onError.
 */
export function CategoryLifecycleDialog({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  mode,
}: CategoryLifecycleDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSuccess = (successMessage: string) => {
    // T039 AD-5 — invalidate the list; no redirect, no full refresh. When
    // the ARCHIVED filter is active, the row naturally disappears once this
    // refetch resolves (restored rows are no longer ARCHIVED); the mirror
    // is already true for Archive today. T040 also invalidates the Tree
    // query — archived categories must disappear from (and restored ones
    // reappear in) the hierarchy view too, not just the flat list.
    queryClient.invalidateQueries({ queryKey: getCategoryControllerListQueryKey() });
    queryClient.invalidateQueries({ queryKey: getCategoryControllerGetTreeQueryKey() });
    toast.success(successMessage);
    setErrorMessage(null);
    onOpenChange(false);
  };

  const handleError = (error: NormalizedError) => {
    // T039 AD-4 (continuing T038.08B/T038.10) — every error renders
    // in-dialog; `meta.suppressGlobalErrorToast` below stops the global
    // handler from also toasting the same message.
    setErrorMessage(error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định');
  };

  const archiveMutation = useCategoryControllerRemove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => handleSuccess(COPY.archive.successMessage),
      onError: handleError,
    },
  });

  const restoreMutation = useCategoryControllerRestore<NormalizedError>({
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
      description={copy.describe(categoryName)}
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        activeMutation.mutate({ id: categoryId });
      }}
    />
  );
}
