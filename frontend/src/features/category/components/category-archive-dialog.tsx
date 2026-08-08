'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getCategoryControllerListQueryKey,
  useCategoryControllerRemove,
} from '@/generated/category/category';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { NormalizedError } from '@/services/api-client';

export type CategoryArchiveDialogMode = 'archive';

export interface CategoryArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  /**
   * T038.10 implements 'archive' only (SPEC-T038 AD-6). Kept as its own prop
   * — with mode-keyed copy/behavior below — rather than hardcoded, so T039
   * can widen this union to 'archive' | 'restore' and add a restore case
   * without restructuring the component.
   */
  mode?: CategoryArchiveDialogMode;
}

const COPY: Record<
  CategoryArchiveDialogMode,
  {
    title: string;
    confirmLabel: string;
    describe: (categoryName: string) => string;
    successMessage: string;
  }
> = {
  archive: {
    title: 'Lưu trữ danh mục?',
    confirmLabel: 'Lưu trữ',
    describe: (categoryName) =>
      `Danh mục "${categoryName}" sẽ được lưu trữ và ẩn khỏi danh sách. Bạn có thể khôi phục lại sau.`,
    successMessage: 'Đã lưu trữ danh mục',
  },
};

export function CategoryArchiveDialog({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  mode = 'archive',
}: CategoryArchiveDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = COPY[mode];

  const archiveMutation = useCategoryControllerRemove<NormalizedError>({
    mutation: {
      // T038.08B (SPEC-T038A) — this mutation always shows its error
      // in-dialog (below); without this flag the global mutation-error
      // toast would duplicate the same message on top of it.
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getCategoryControllerListQueryKey() });
        toast.success(copy.successMessage);
        setErrorMessage(null);
        onOpenChange(false);
      },
      // Every error renders in-dialog (not just CATEGORY_004/007) — with
      // the global toast now suppressed above, this is the only surface
      // left for any error this mutation can produce, generic or not.
      onError: (error) => {
        setErrorMessage(
          error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định',
        );
      },
    },
  });

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
      danger
      isConfirming={archiveMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        archiveMutation.mutate({ id: categoryId });
      }}
    />
  );
}
