'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useFieldArray } from 'react-hook-form';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  getStockCountControllerSearchQueryKey,
  useStockCountControllerCreate,
} from '@/generated/stock-count/stock-count';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { CrudForm } from '@/components/common/crud-form';
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
import type { NormalizedError } from '@/services/api-client';
import {
  createStockCountSchema,
  type CreateStockCountFormOutput,
  type CreateStockCountFormValues,
} from '../schema';
import { useProductOptions, useWarehouseOptions } from '../../inventory/use-inventory-relations';

/** T044 Phase N — Stock Count Create. `productIds` snapshots `systemQty` server-side at creation time. */
export function StockCountCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { warehouseOptions } = useWarehouseOptions('ACTIVE');
  const { productOptions } = useProductOptions();

  const form = useCrudForm<CreateStockCountFormValues, CreateStockCountFormOutput>({
    schema: createStockCountSchema,
    defaultValues: { warehouseId: '', note: '', products: [{ productId: '' }] },
  });
  void form.formState.errors.root;

  const productsArray = useFieldArray({ control: form.control, name: 'products' });

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form.formState.isDirty]);

  const createMutation = useStockCountControllerCreate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getStockCountControllerSearchQueryKey() });
        toast.success('Đã tạo phiếu kiểm kê');
        router.push(`/stock-count/${data.id}`);
      },
      onError: (error) => {
        if (error.kind === 'api-error') {
          form.setServerError(error);
          return;
        }
        form.setError('root', { type: 'server', message: error.message });
      },
    },
  });

  const onSubmit = (values: CreateStockCountFormOutput) => {
    createMutation.mutate({
      data: {
        warehouseId: values.warehouseId,
        note: values.note || undefined,
        productIds: values.products.map((p) => p.productId),
      },
    });
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/stock-count');
  };

  return (
    <>
      <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Tạo phiếu">
        <div className="space-y-1.5">
          <Label htmlFor="warehouseId">Kho</Label>
          <Select
            items={warehouseOptions}
            value={form.watch('warehouseId')}
            onValueChange={(value) =>
              form.setValue('warehouseId', value ?? '', { shouldDirty: true })
            }
          >
            <SelectTrigger
              id="warehouseId"
              className="w-full"
              aria-label="Kho"
              aria-invalid={Boolean(form.formState.errors.warehouseId)}
            >
              <SelectValue placeholder="Chọn kho" />
            </SelectTrigger>
            <SelectContent>
              {warehouseOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.warehouseId && (
            <p className="text-destructive text-sm">{form.formState.errors.warehouseId.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note">Ghi chú</Label>
          <Input id="note" {...form.register('note')} />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Sản phẩm cần kiểm kê</legend>
          {form.formState.errors.products?.message && (
            <p className="text-destructive text-sm">{form.formState.errors.products.message}</p>
          )}
          {form.formState.errors.products?.root?.message && (
            <p className="text-destructive text-sm">
              {form.formState.errors.products.root.message}
            </p>
          )}
          {productsArray.fields.map((field, index) => (
            <div key={field.id} className="flex items-end gap-2">
              <div className="w-64 space-y-1.5">
                <Label htmlFor={`product-${index}`}>Sản phẩm</Label>
                <Select
                  items={productOptions}
                  value={form.watch(`products.${index}.productId`)}
                  onValueChange={(value) =>
                    form.setValue(`products.${index}.productId`, value ?? '', { shouldDirty: true })
                  }
                >
                  <SelectTrigger id={`product-${index}`} className="w-full" aria-label="Sản phẩm">
                    <SelectValue placeholder="Chọn sản phẩm" />
                  </SelectTrigger>
                  <SelectContent>
                    {productOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.products?.[index]?.productId && (
                  <p className="text-destructive text-sm">
                    {form.formState.errors.products[index]?.productId?.message}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Xóa sản phẩm này"
                onClick={() => productsArray.remove(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => productsArray.append({ productId: '' })}
          >
            <Plus className="size-4" />
            Thêm sản phẩm
          </Button>
        </fieldset>
      </CrudForm>
      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="Hủy các thay đổi chưa lưu?"
        description="Các thay đổi bạn đã nhập sẽ không được lưu."
        confirmLabel="Hủy thay đổi"
        cancelLabel="Tiếp tục chỉnh sửa"
        danger
        onConfirm={() => router.push('/stock-count')}
      />
    </>
  );
}
