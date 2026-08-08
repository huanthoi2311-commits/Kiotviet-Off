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

/** Errors with a dedicated in-dialog message (SPEC-T038 AD-5) — every other error relies on the app-wide mutation-error toast (`query-provider.tsx`), same as this component would otherwise duplicate it. */
const IN_DIALOG_ERROR_CODES = new Set(['CATEGORY_004', 'CATEGORY_007']);

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
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getCategoryControllerListQueryKey() });
        toast.success(copy.successMessage);
        setErrorMessage(null);
        onOpenChange(false);
      },
      onError: (error) => {
        if (error.kind === 'api-error' && IN_DIALOG_ERROR_CODES.has(error.code)) {
          setErrorMessage(error.message);
        }
        // Every other error (including CATEGORY_001/CATEGORY_005 and any
        // non-api-error) is left to the global MutationCache's onError
        // (query-provider.tsx) — it already shows a toast for any
        // otherwise-unhandled mutation error. Calling toast.error() here
        // too would double-surface the same message.
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
