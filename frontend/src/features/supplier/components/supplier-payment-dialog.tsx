'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getSupplierDebtControllerSearchQueryKey,
  useSupplierDebtControllerSearch,
} from '@/generated/supplier-debt/supplier-debt';
import { useSupplierPaymentControllerCreate } from '@/generated/supplier-payment/supplier-payment';
import type { NormalizedError } from '@/services/api-client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCrudForm } from '@/hooks/use-crud-form';
import { useBranchOptions } from '@/features/inventory/use-inventory-relations';
import { usePurchaseOrderOptions } from '../use-supplier-payment-relations';
import { useSupplierPaymentIdempotencyKey } from '../use-supplier-payment-idempotency-key';
import {
  SUPPLIER_PAYMENT_METHOD_OPTIONS,
  supplierPaymentSchema,
  type SupplierPaymentFormOutput,
  type SupplierPaymentFormValues,
} from '../payment-schema';

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface SupplierPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
}

/**
 * T052.05C — the single canonical entry point for recording a Supplier Payment. Uses the
 * generated `useSupplierPaymentControllerCreate` hook (fixed this package via
 * `orval.config.ts`'s `output.headers: true` — no hand-rolled `apiClientMutator` bypass needed,
 * unlike Checkout's pre-existing AD-2 exception).
 */
export function SupplierPaymentDialog({
  open,
  onOpenChange,
  supplierId,
}: SupplierPaymentDialogProps) {
  const queryClient = useQueryClient();
  const { branchOptions } = useBranchOptions();
  const { purchaseOrderOptions } = usePurchaseOrderOptions(supplierId);
  const { prepareSubmit, retire } = useSupplierPaymentIdempotencyKey();

  const { data: debtData } = useSupplierDebtControllerSearch({ supplierId, limit: 1 });
  const currentBalance = debtData?.items[0]?.balance;

  const form = useCrudForm<SupplierPaymentFormValues, SupplierPaymentFormOutput>({
    schema: supplierPaymentSchema,
    defaultValues: {
      branchId: '',
      purchaseOrderId: '',
      method: 'CASH',
      amount: '' as unknown as number,
      paidAt: todayDateInputValue(),
    },
  });

  // T052.05C §7 — a genuinely NEW logical intent (dialog reopened fresh) must never carry over a
  // key/fingerprint/form state from whatever the dialog last did (a prior success already retired
  // via onSuccess below; a prior cancel is caught here).
  useEffect(() => {
    if (open) {
      form.reset({
        branchId: '',
        purchaseOrderId: '',
        method: 'CASH',
        amount: '' as unknown as number,
        paidAt: todayDateInputValue(),
      });
    } else {
      retire();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const createMutation = useSupplierPaymentControllerCreate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getSupplierDebtControllerSearchQueryKey() });
        toast.success('Đã ghi nhận thanh toán');
        retire();
        onOpenChange(false);
      },
      onError: (error) => {
        if (error.kind === 'api-error') {
          if (error.code === 'SUPPLIER_DEBT_004') {
            form.setError('root', {
              type: 'server',
              message:
                'Dữ liệu thanh toán đã thay đổi — vui lòng thử lại như một lần thanh toán mới.',
            });
            return;
          }
          if (error.code === 'SUPPLIER_DEBT_005') {
            form.setError('root', {
              type: 'server',
              message: 'Yêu cầu thanh toán này đang được xử lý — vui lòng thử lại sau ít phút.',
            });
            return;
          }
          // SUPPLIER_DEBT_002/003 (missing/invalid Idempotency-Key) should never occur from
          // correct frontend code — a diagnosable internal error, not a business/field error.
          if (error.code === 'SUPPLIER_DEBT_002' || error.code === 'SUPPLIER_DEBT_003') {
            form.setError('root', {
              type: 'server',
              message: `Lỗi nội bộ ứng dụng (${error.code}) — vui lòng báo cho quản trị viên.`,
            });
            return;
          }
          // SUPPLIER_DEBT_001 (exceeds balance), BRANCH_001/SUPPLIER_001/PURCHASE_ORDER_001
          // (tenant-safe 404) all fall through to the generic root-level server message.
          form.setServerError(error);
          return;
        }
        form.setError('root', { type: 'server', message: error.message });
      },
    },
  });

  const onSubmit = (values: SupplierPaymentFormOutput) => {
    const purchaseOrderId = values.purchaseOrderId || undefined;
    const key = prepareSubmit({
      branchId: values.branchId,
      supplierId,
      purchaseOrderId,
      method: values.method,
      amount: values.amount,
      paidAt: values.paidAt,
    });
    createMutation.mutate({
      data: {
        branchId: values.branchId,
        supplierId,
        purchaseOrderId,
        method: values.method,
        amount: values.amount,
        paidAt: values.paidAt,
      },
      headers: { 'Idempotency-Key': key },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ghi nhận thanh toán</DialogTitle>
          <DialogDescription>
            {currentBalance !== undefined
              ? `Công nợ hiện tại: ${currentBalance}`
              : 'Ghi nhận một khoản thanh toán cho nhà cung cấp này.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-4"
          aria-label="Ghi nhận thanh toán"
        >
          {form.formState.errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="supplier-payment-branch">Chi nhánh</Label>
            <Select
              items={branchOptions}
              value={form.watch('branchId')}
              onValueChange={(value) =>
                form.setValue('branchId', value ?? '', { shouldDirty: true })
              }
            >
              <SelectTrigger
                id="supplier-payment-branch"
                className="w-full"
                aria-label="Chi nhánh"
                aria-invalid={Boolean(form.formState.errors.branchId)}
              >
                <SelectValue placeholder="Chọn chi nhánh" />
              </SelectTrigger>
              <SelectContent>
                {branchOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.branchId && (
              <p className="text-destructive text-sm">{form.formState.errors.branchId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supplier-payment-purchase-order">Đơn nhập hàng (tùy chọn)</Label>
            <Select
              items={purchaseOrderOptions}
              value={form.watch('purchaseOrderId') || undefined}
              onValueChange={(value) =>
                form.setValue('purchaseOrderId', value ?? '', { shouldDirty: true })
              }
            >
              <SelectTrigger
                id="supplier-payment-purchase-order"
                className="w-full"
                aria-label="Đơn nhập hàng"
              >
                <SelectValue placeholder="Không gắn với đơn nhập hàng cụ thể" />
              </SelectTrigger>
              <SelectContent>
                {purchaseOrderOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supplier-payment-method">Phương thức thanh toán</Label>
            <Select
              items={SUPPLIER_PAYMENT_METHOD_OPTIONS}
              value={form.watch('method')}
              onValueChange={(value) =>
                form.setValue('method', (value ?? 'CASH') as SupplierPaymentFormValues['method'], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger
                id="supplier-payment-method"
                className="w-full"
                aria-label="Phương thức thanh toán"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPLIER_PAYMENT_METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supplier-payment-amount">Số tiền</Label>
            <Input
              id="supplier-payment-amount"
              type="number"
              min="0"
              step="any"
              aria-invalid={Boolean(form.formState.errors.amount)}
              {...form.register('amount')}
            />
            {form.formState.errors.amount && (
              <p className="text-destructive text-sm">{form.formState.errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supplier-payment-paid-at">Ngày thanh toán</Label>
            <Input
              id="supplier-payment-paid-at"
              type="date"
              aria-invalid={Boolean(form.formState.errors.paidAt)}
              {...form.register('paidAt')}
            />
            {form.formState.errors.paidAt && (
              <p className="text-destructive text-sm">{form.formState.errors.paidAt.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              aria-disabled={createMutation.isPending}
              onClick={() => {
                if (!createMutation.isPending) onOpenChange(false);
              }}
            >
              Hủy
            </Button>
            <Button type="submit" aria-disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Đang xử lý...' : 'Ghi nhận thanh toán'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
