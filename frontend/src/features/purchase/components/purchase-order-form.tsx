'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useFieldArray } from 'react-hook-form';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  getPurchaseOrderControllerSearchQueryKey,
  usePurchaseOrderControllerCreate,
} from '@/generated/purchase-order/purchase-order';
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
  createPurchaseOrderSchema,
  type CreatePurchaseOrderFormOutput,
  type CreatePurchaseOrderFormValues,
} from '../schema';
import { useSupplierOptions } from '../use-purchase-relations';
import {
  useBranchOptions,
  useProductOptions,
  useWarehouseOptions,
} from '../../inventory/use-inventory-relations';

/** T045 §5 — Purchase Order Create. Mirrors Transfer/Adjustment Create's `useFieldArray` line-item pattern. */
export function PurchaseOrderCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { branchOptions } = useBranchOptions();
  const { supplierOptions } = useSupplierOptions('ACTIVE');
  const { warehouseOptions } = useWarehouseOptions('ACTIVE');
  const { productOptions } = useProductOptions();

  const form = useCrudForm<CreatePurchaseOrderFormValues, CreatePurchaseOrderFormOutput>({
    schema: createPurchaseOrderSchema,
    defaultValues: {
      branchId: '',
      supplierId: '',
      expectedAt: '',
      items: [
        { productId: '', warehouseId: '', quantity: 1, unitCost: 0, discount: 0, taxAmount: 0 },
      ],
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

  const createMutation = usePurchaseOrderControllerCreate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getPurchaseOrderControllerSearchQueryKey() });
        toast.success('Đã tạo đơn nhập hàng');
        router.push(`/purchase-orders/${data.id}`);
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

  const onSubmit = (values: CreatePurchaseOrderFormOutput) => {
    createMutation.mutate({
      data: {
        branchId: values.branchId,
        supplierId: values.supplierId,
        expectedAt: values.expectedAt || undefined,
        items: values.items.map((item) => ({
          productId: item.productId,
          warehouseId: item.warehouseId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          discount: item.discount,
          taxAmount: item.taxAmount,
        })),
      },
    });
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/purchase-orders');
  };

  return (
    <>
      <CrudForm
        form={form}
        onSubmit={onSubmit}
        onCancel={handleCancel}
        submitLabel="Tạo đơn nhập hàng"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="branchId">Chi nhánh</Label>
            <Select
              items={branchOptions}
              value={form.watch('branchId')}
              onValueChange={(value) =>
                form.setValue('branchId', value ?? '', { shouldDirty: true })
              }
            >
              <SelectTrigger
                id="branchId"
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
            <Label htmlFor="supplierId">Nhà cung cấp</Label>
            <Select
              items={supplierOptions}
              value={form.watch('supplierId')}
              onValueChange={(value) =>
                form.setValue('supplierId', value ?? '', { shouldDirty: true })
              }
            >
              <SelectTrigger
                id="supplierId"
                className="w-full"
                aria-label="Nhà cung cấp"
                aria-invalid={Boolean(form.formState.errors.supplierId)}
              >
                <SelectValue placeholder="Chọn nhà cung cấp" />
              </SelectTrigger>
              <SelectContent>
                {supplierOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.supplierId && (
              <p className="text-destructive text-sm">{form.formState.errors.supplierId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expectedAt">Ngày dự kiến nhận hàng</Label>
            <Input id="expectedAt" type="date" {...form.register('expectedAt')} />
          </div>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Sản phẩm nhập hàng</legend>
          {form.formState.errors.items?.message && (
            <p className="text-destructive text-sm">{form.formState.errors.items.message}</p>
          )}
          {form.formState.errors.items?.root?.message && (
            <p className="text-destructive text-sm">{form.formState.errors.items.root.message}</p>
          )}
          {itemsArray.fields.map((field, index) => (
            <div key={field.id} className="flex flex-wrap items-end gap-2">
              <div className="w-56 space-y-1.5">
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
              <div className="w-44 space-y-1.5">
                <Label htmlFor={`item-warehouse-${index}`}>Kho nhận hàng</Label>
                <Select
                  items={warehouseOptions}
                  value={form.watch(`items.${index}.warehouseId`)}
                  onValueChange={(value) =>
                    form.setValue(`items.${index}.warehouseId`, value ?? '', { shouldDirty: true })
                  }
                >
                  <SelectTrigger
                    id={`item-warehouse-${index}`}
                    className="w-full"
                    aria-label="Kho nhận hàng"
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
                {form.formState.errors.items?.[index]?.warehouseId && (
                  <p className="text-destructive text-sm">
                    {form.formState.errors.items[index]?.warehouseId?.message}
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
                  className="w-24"
                  {...form.register(`items.${index}.quantity`)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`item-unit-cost-${index}`}>Đơn giá</Label>
                <Input
                  id={`item-unit-cost-${index}`}
                  type="number"
                  min={0}
                  step="any"
                  className="w-28"
                  {...form.register(`items.${index}.unitCost`)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`item-discount-${index}`}>Chiết khấu</Label>
                <Input
                  id={`item-discount-${index}`}
                  type="number"
                  min={0}
                  step="any"
                  className="w-24"
                  {...form.register(`items.${index}.discount`)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`item-tax-${index}`}>Thuế</Label>
                <Input
                  id={`item-tax-${index}`}
                  type="number"
                  min={0}
                  step="any"
                  className="w-24"
                  {...form.register(`items.${index}.taxAmount`)}
                />
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
            onClick={() =>
              itemsArray.append({
                productId: '',
                warehouseId: '',
                quantity: 1,
                unitCost: 0,
                discount: 0,
                taxAmount: 0,
              })
            }
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
        onConfirm={() => router.push('/purchase-orders')}
      />
    </>
  );
}
