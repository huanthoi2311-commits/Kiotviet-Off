'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getSalesReturnControllerFindOneQueryKey,
  useSalesReturnControllerCancelRefund,
  useSalesReturnControllerCompleteRefund,
  useSalesReturnControllerFailRefund,
  useSalesReturnControllerProcessRefund,
} from '@/generated/sales-return/sales-return';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { NormalizedError } from '@/services/api-client';

export type RefundActionDialogMode = 'process' | 'complete' | 'fail' | 'cancel';

export interface RefundActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesReturnId: string;
  refundId: string;
  version: number;
  mode: RefundActionDialogMode;
  onVersionConflict: (message: string) => void;
}

const COPY: Record<
  RefundActionDialogMode,
  {
    title: string;
    confirmLabel: string;
    description: string;
    successMessage: string;
    danger: boolean;
  }
> = {
  process: {
    title: 'Xử lý hoàn tiền?',
    confirmLabel: 'Xử lý',
    description: 'Khoản hoàn tiền sẽ chuyển sang trạng thái đang xử lý.',
    successMessage: 'Đã xử lý hoàn tiền',
    danger: false,
  },
  complete: {
    title: 'Hoàn tất hoàn tiền?',
    confirmLabel: 'Hoàn tất',
    description: 'Khoản hoàn tiền sẽ được đánh dấu hoàn tất.',
    successMessage: 'Đã hoàn tất hoàn tiền',
    danger: false,
  },
  fail: {
    title: 'Đánh dấu hoàn tiền thất bại?',
    confirmLabel: 'Đánh dấu thất bại',
    description: 'Vui lòng nhập lý do thất bại.',
    successMessage: 'Đã đánh dấu hoàn tiền thất bại',
    danger: true,
  },
  cancel: {
    title: 'Hủy hoàn tiền?',
    confirmLabel: 'Hủy hoàn tiền',
    description: 'Khoản hoàn tiền này sẽ bị hủy.',
    successMessage: 'Đã hủy hoàn tiền',
    danger: true,
  },
};

const VERSION_CONFLICT_CODES = new Set(['SALES_RETURN_013']);

/** T047 §9 — Refund's own lifecycle dialog (Process/Complete/Fail/Cancel), decoupled from Payment. */
export function RefundActionDialog({
  open,
  onOpenChange,
  salesReturnId,
  refundId,
  version,
  mode,
  onVersionConflict,
}: RefundActionDialogProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState('');
  const copy = COPY[mode];

  const handleSuccess = () => {
    queryClient.invalidateQueries({
      queryKey: getSalesReturnControllerFindOneQueryKey(salesReturnId),
    });
    toast.success(copy.successMessage);
    setErrorMessage(null);
    setFailureReason('');
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

  const processMutation = useSalesReturnControllerProcessRefund<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const completeMutation = useSalesReturnControllerCompleteRefund<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const failMutation = useSalesReturnControllerFailRefund<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });
  const cancelMutation = useSalesReturnControllerCancelRefund<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: handleSuccess,
      onError: handleError,
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setErrorMessage(null);
      setFailureReason('');
    }
    onOpenChange(next);
  };

  if (mode === 'fail') {
    const isConfirming = failMutation.isPending;
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="refund-failure-reason">Lý do thất bại</Label>
            <Input
              id="refund-failure-reason"
              value={failureReason}
              onChange={(e) => setFailureReason(e.target.value)}
              aria-invalid={Boolean(errorMessage)}
            />
          </div>
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              aria-disabled={isConfirming}
              className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
              onClick={() => {
                if (isConfirming) return;
                handleOpenChange(false);
              }}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              aria-disabled={isConfirming}
              className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
              onClick={() => {
                if (isConfirming) return;
                if (!failureReason.trim()) {
                  setErrorMessage('Vui lòng nhập lý do thất bại');
                  return;
                }
                setErrorMessage(null);
                failMutation.mutate({ refundId, data: { version, failureReason } });
              }}
            >
              {copy.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const activeMutation = {
    process: processMutation,
    complete: completeMutation,
    cancel: cancelMutation,
  }[mode];

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      isConfirming={activeMutation.isPending}
      errorMessage={errorMessage}
      onConfirm={() => {
        setErrorMessage(null);
        activeMutation.mutate({ refundId, data: { version } });
      }}
    />
  );
}
