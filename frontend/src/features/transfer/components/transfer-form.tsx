'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useFieldArray } from 'react-hook-form';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  getTransferControllerSearchQueryKey,
  useTransferControllerCreate,
} from '@/generated/transfer/transfer';
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
  createTransferSchema,
  type CreateTransferFormOutput,
  type CreateTransferFormValues,
} from '../schema';
import { useProductOptions, useWarehouseOptions } from '../../inventory/use-inventory-relations';

/** T044 Phase L — Transfer Create. Mirrors Product Create's `useFieldArray` line-item pattern. */
export function TransferCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { warehouseOptions } = useWarehouseOptions('ACTIVE');
  const { productOptions } = useProductOptions();

  const form = useCrudForm<CreateTransferFormValues, CreateTransferFormOutput>({
    schema: createTransferSchema,
    defaultValues: {
      fromWarehouseId: '',
      toWarehouseId: '',
      note: '',
      items: [{ productId: '', quantity: 1 }],
    },
  });
  void form.formState.errors.root;

  const itemsArray = useFieldArray({ control: form.control, name: 'items' });

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form.formState.isDirty]);

  const createMutation = useTransferControllerCreate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getTransferControllerSearchQueryKey() });
        toast.success('Đã tạo phiếu điều chuyển');
        router.push(`/transfers/${data.id}`);
      },
      onError: (error) => {
        if (error.kind === 'api-error') {
          if (error.code === 'TRANSFER_002') {
            form.setError('toWarehouseId', { type: 'server', message: error.message });
            return;
          }
          form.setServerError(error);
          return;
        }
        form.setError('root', { type: 'server', message: error.message });
      },
    },
  });

  const onSubmit = (values: CreateTransferFormOutput) => {
    createMutation.mutate({
      data: {
        fromWarehouseId: values.fromWarehouseId,
        toWarehouseId: values.toWarehouseId,
        note: values.note || undefined,
        items: values.items,
      },
    });
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/transfers');
  };

  return (
    <>
      <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Tạo phiếu">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fromWarehouseId">Kho nguồn</Label>
            <Select
              items={warehouseOptions}
              value={form.watch('fromWarehouseId')}
              onValueChange={(value) =>
                form.setValue('fromWarehouseId', value ?? '', { shouldDirty: true })
              }
            >
              <SelectTrigger
                id="fromWarehouseId"
                className="w-full"
                aria-label="Kho nguồn"
                aria-invalid={Boolean(form.formState.errors.fromWarehouseId)}
              >
                <SelectValue placeholder="Chọn kho nguồn" />
              </SelectTrigger>
              <SelectContent>
                {warehouseOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.fromWarehouseId && (
              <p className="text-destructive text-sm">
                {form.formState.errors.fromWarehouseId.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="toWarehouseId">Kho đích</Label>
            <Select
              items={warehouseOptions}
              value={form.watch('toWarehouseId')}
              onValueChange={(value) =>
                form.setValue('toWarehouseId', value ?? '', { shouldDirty: true })
              }
            >
              <SelectTrigger
                id="toWarehouseId"
                className="w-full"
                aria-label="Kho đích"
                aria-invalid={Boolean(form.formState.errors.toWarehouseId)}
              >
                <SelectValue placeholder="Chọn kho đích" />
              </SelectTrigger>
              <SelectContent>
                {warehouseOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.toWarehouseId && (
              <p className="text-destructive text-sm">
                {form.formState.errors.toWarehouseId.message}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note">Ghi chú</Label>
          <Input id="note" {...form.register('note')} />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Sản phẩm điều chuyển</legend>
          {form.formState.errors.items?.message && (
            <p className="text-destructive text-sm">{form.formState.errors.items.message}</p>
          )}
          {form.formState.errors.items?.root?.message && (
            <p className="text-destructive text-sm">{form.formState.errors.items.root.message}</p>
          )}
          {itemsArray.fields.map((field, index) => (
            <div key={field.id} className="flex items-end gap-2">
              <div className="w-64 space-y-1.5">
                <Label htmlFor={`item-product-${index}`}>Sản phẩm</Label>
                <Select
                  items={productOptions}
                  value={form.watch(`items.${index}.productId`)}
                  onValueChange={(value) =>
                    form.setValue(`items.${index}.productId`, value ?? '', { shouldDirty: true })
                  }
                >
                  <SelectTrigger
                    id={`item-product-${index}`}
                    className="w-full"
                    aria-label="Sản phẩm"
                  >
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
                {form.formState.errors.items?.[index]?.productId && (
                  <p className="text-destructive text-sm">
                    {form.formState.errors.items[index]?.productId?.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`item-quantity-${index}`}>Số lượng</Label>
                <Input
                  id={`item-quantity-${index}`}
                  type="number"
                  min={0}
                  step="any"
                  {...form.register(`items.${index}.quantity`)}
                />
                {form.formState.errors.items?.[index]?.quantity && (
                  <p className="text-destructive text-sm">
                    {form.formState.errors.items[index]?.quantity?.message}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Xóa sản phẩm này"
                onClick={() => itemsArray.remove(index)}
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
            onClick={() => itemsArray.append({ productId: '', quantity: 1 })}
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
        onConfirm={() => router.push('/transfers')}
      />
    </>
  );
}
