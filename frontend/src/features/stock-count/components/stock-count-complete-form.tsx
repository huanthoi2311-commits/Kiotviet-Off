'use client';

import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getStockCountControllerFindOneQueryKey,
  getStockCountControllerSearchQueryKey,
  useStockCountControllerComplete,
} from '@/generated/stock-count/stock-count';
import type { StockCountItemResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCrudForm } from '@/hooks/use-crud-form';
import type { NormalizedError } from '@/services/api-client';
import {
  completeStockCountSchema,
  type CompleteStockCountFormOutput,
  type CompleteStockCountFormValues,
} from '../schema';
import { useProductOptions } from '../../inventory/use-inventory-relations';

export interface StockCountCompleteFormProps {
  stockCountId: string;
  /** T051.02 — Optimistic Lock, đọc từ GET trước đó (`StockCountDetail`'s own fetch). */
  stockCountVersion: number;
  items: StockCountItemResponseDto[];
}

/**
 * T044 Phase N — the real per-row counting step (COUNTING → COMPLETED). `actualQty` starts blank
 * per row — deliberately NOT pre-filled with `systemQty` (SPEC-T044 §6.3), so a submit without
 * genuinely counting cannot silently confirm the system's own snapshot as correct.
 */
export function StockCountCompleteForm({
  stockCountId,
  stockCountVersion,
  items,
}: StockCountCompleteFormProps) {
  const queryClient = useQueryClient();
  const { productOptions } = useProductOptions();
  const productNameById = useMemo(
    () => new Map(productOptions.map((o) => [o.value, o.label])),
    [productOptions],
  );

  const form = useCrudForm<CompleteStockCountFormValues, CompleteStockCountFormOutput>({
    schema: completeStockCountSchema,
    defaultValues: {
      items: items.map((item) => ({ itemId: item.id, actualQty: 0, remark: '' })),
    },
  });
  void form.formState.errors.root;

  const completeMutation = useStockCountControllerComplete<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getStockCountControllerSearchQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getStockCountControllerFindOneQueryKey(stockCountId),
        });
        toast.success('Đã hoàn tất kiểm kê');
      },
      /** T051.02 AD-1 §12 — on a version conflict (STOCK_COUNT_007) the form stays on-screen and the
       * message is shown (never silently retried with a new version); the detail query is
       * invalidated so a retry after re-opening/reloading reads a fresh version. */
      onError: (error) => {
        if (error.kind === 'api-error') {
          form.setServerError(error);
          if (error.code === 'STOCK_COUNT_007') {
            queryClient.invalidateQueries({
              queryKey: getStockCountControllerFindOneQueryKey(stockCountId),
            });
          }
          return;
        }
        form.setError('root', { type: 'server', message: error.message });
      },
    },
  });

  const onSubmit = (values: CompleteStockCountFormOutput) => {
    completeMutation.mutate({
      id: stockCountId,
      data: { version: stockCountVersion, items: values.items },
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {form.formState.errors.root && (
        <Alert variant="destructive">
          <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sản phẩm</TableHead>
            <TableHead>Tồn hệ thống</TableHead>
            <TableHead>Số lượng đếm thực tế</TableHead>
            <TableHead>Ghi chú</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={item.id}>
              <TableCell>{productNameById.get(item.productId) ?? item.productId}</TableCell>
              <TableCell>{item.systemQty}</TableCell>
              <TableCell>
                <Label htmlFor={`actual-qty-${index}`} className="sr-only">
                  Số lượng đếm thực tế
                </Label>
                <Input
                  id={`actual-qty-${index}`}
                  type="number"
                  min={0}
                  step="any"
                  className="w-28"
                  aria-invalid={Boolean(form.formState.errors.items?.[index]?.actualQty)}
                  {...form.register(`items.${index}.actualQty`)}
                />
                {form.formState.errors.items?.[index]?.actualQty && (
                  <p className="text-destructive text-sm">
                    {form.formState.errors.items[index]?.actualQty?.message}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <Label htmlFor={`remark-${index}`} className="sr-only">
                  Ghi chú
                </Label>
                <Input
                  id={`remark-${index}`}
                  className="w-48"
                  {...form.register(`items.${index}.remark`)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button type="submit" className="w-fit" disabled={form.formState.isSubmitting}>
        Hoàn tất kiểm kê
      </Button>
    </form>
  );
}
