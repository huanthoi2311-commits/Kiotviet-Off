'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useFieldArray } from 'react-hook-form';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  getInventoryAdjustmentControllerSearchQueryKey,
  useInventoryAdjustmentControllerCreate,
} from '@/generated/inventory-adjustment/inventory-adjustment';
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
  createInventoryAdjustmentSchema,
  type CreateInventoryAdjustmentFormOutput,
  type CreateInventoryAdjustmentFormValues,
} from '../schema';
import { useProductOptions, useWarehouseOptions } from '../../inventory/use-inventory-relations';

const REASON_OPTIONS: { value: CreateInventoryAdjustmentFormValues['reason']; label: string }[] = [
  { value: 'LOST', label: 'Thất lạc' },
  { value: 'DAMAGED', label: 'Hư hỏng' },
  { value: 'FOUND', label: 'Tìm thấy' },
  { value: 'SYSTEM', label: 'Hệ thống' },
  { value: 'OTHER', label: 'Khác' },
];

/** T044 Phase M — Inventory Adjustment Create. `quantity` is a signed delta (dương = tăng, âm = giảm). */
export function InventoryAdjustmentCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { warehouseOptions } = useWarehouseOptions('ACTIVE');
  const { productOptions } = useProductOptions();

  const form = useCrudForm<
    CreateInventoryAdjustmentFormValues,
    CreateInventoryAdjustmentFormOutput
  >({
    schema: createInventoryAdjustmentSchema,
    defaultValues: {
      warehouseId: '',
      reason: 'LOST',
      note: '',
      items: [{ productId: '', quantity: 0, remark: '' }],
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

  const createMutation = useInventoryAdjustmentControllerCreate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (data) => {
        queryClient.invalidateQueries({
          queryKey: getInventoryAdjustmentControllerSearchQueryKey(),
        });
        toast.success('Đã tạo phiếu điều chỉnh');
        router.push(`/inventory-adjustments/${data.id}`);
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

  const onSubmit = (values: CreateInventoryAdjustmentFormOutput) => {
    createMutation.mutate({
      data: {
        warehouseId: values.warehouseId,
        reason: values.reason,
        note: values.note || undefined,
        items: values.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          remark: item.remark || undefined,
        })),
      },
    });
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/inventory-adjustments');
  };

  return (
    <>
      <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Tạo phiếu">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <p className="text-destructive text-sm">
                {form.formState.errors.warehouseId.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason">Lý do</Label>
            <Select
              items={REASON_OPTIONS}
              value={form.watch('reason')}
              onValueChange={(value) =>
                form.setValue('reason', value as CreateInventoryAdjustmentFormValues['reason'], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger id="reason" className="w-full" aria-label="Lý do">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note">Ghi chú</Label>
          <Input id="note" {...form.register('note')} />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Sản phẩm điều chỉnh</legend>
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
                <Label htmlFor={`item-quantity-${index}`}>Chênh lệch (+/-)</Label>
                <Input
                  id={`item-quantity-${index}`}
                  type="number"
                  step="any"
                  {...form.register(`items.${index}.quantity`)}
                />
                {form.formState.errors.items?.[index]?.quantity && (
                  <p className="text-destructive text-sm">
                    {form.formState.errors.items[index]?.quantity?.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`item-remark-${index}`}>Ghi chú</Label>
                <Input id={`item-remark-${index}`} {...form.register(`items.${index}.remark`)} />
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
            onClick={() => itemsArray.append({ productId: '', quantity: 0, remark: '' })}
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
        onConfirm={() => router.push('/inventory-adjustments')}
      />
    </>
  );
}
