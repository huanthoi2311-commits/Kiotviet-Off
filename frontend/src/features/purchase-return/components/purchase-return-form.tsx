'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useFieldArray } from 'react-hook-form';
import { toast } from 'sonner';
import { Trash2, Undo2 } from 'lucide-react';
import { usePurchaseOrderControllerFindOne } from '@/generated/purchase-order/purchase-order';
import {
  getPurchaseReturnControllerSearchQueryKey,
  usePurchaseReturnControllerCreate,
} from '@/generated/purchase-return/purchase-return';
import type { PurchaseOrderResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { CrudForm } from '@/components/common/crud-form';
import { EmptyState } from '@/components/common/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrudForm } from '@/hooks/use-crud-form';
import type { NormalizedError } from '@/services/api-client';
import {
  createPurchaseReturnSchema,
  type CreatePurchaseReturnFormOutput,
  type CreatePurchaseReturnFormValues,
} from '../schema';
import { useProductOptions } from '../../inventory/use-inventory-relations';

const REASON_OPTIONS: { value: CreatePurchaseReturnFormValues['reason']; label: string }[] = [
  { value: 'DAMAGED', label: 'Hư hỏng' },
  { value: 'WRONG_PRODUCT', label: 'Sai sản phẩm' },
  { value: 'EXPIRED', label: 'Hết hạn' },
  { value: 'OTHER', label: 'Khác' },
];

const RETURNABLE_ORDER_STATUSES = ['RECEIVED', 'COMPLETED'];

/**
 * T045 §7 — Purchase Return Create. Only reachable with a known `purchaseOrderId` (via the
 * "Trả hàng nhà cung cấp" link on a RECEIVED Purchase Order's own detail page) — the backend
 * requires returns to reference an existing received order and its own line items
 * (`purchaseItemId`, not a raw productId), so there is no standalone "browse all orders" picker
 * to build; the natural, complete entry point is the order's own detail page.
 */
export function PurchaseReturnCreateForm({ purchaseOrderId }: { purchaseOrderId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { productOptions } = useProductOptions();
  const productNameById = useMemo(
    () => new Map(productOptions.map((o) => [o.value, o.label])),
    [productOptions],
  );

  const {
    data: order,
    isLoading: isOrderLoading,
    isError: isOrderError,
  } = usePurchaseOrderControllerFindOne<PurchaseOrderResponseDto, NormalizedError>(
    purchaseOrderId ?? '',
    { query: { enabled: Boolean(purchaseOrderId) } },
  );

  const form = useCrudForm<CreatePurchaseReturnFormValues, CreatePurchaseReturnFormOutput>({
    schema: createPurchaseReturnSchema,
    defaultValues: {
      purchaseOrderId: purchaseOrderId ?? '',
      reason: 'DAMAGED',
      note: '',
      items: [{ purchaseItemId: '', quantity: 1 }],
    },
  });
  void form.formState.errors.root;

  useEffect(() => {
    if (purchaseOrderId) form.setValue('purchaseOrderId', purchaseOrderId);
  }, [purchaseOrderId, form]);

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

  const createMutation = usePurchaseReturnControllerCreate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getPurchaseReturnControllerSearchQueryKey() });
        toast.success('Đã tạo phiếu trả hàng');
        router.push(`/purchase-returns/${data.id}`);
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

  const onSubmit = (values: CreatePurchaseReturnFormOutput) => {
    createMutation.mutate({
      data: {
        purchaseOrderId: values.purchaseOrderId,
        reason: values.reason,
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
    router.push('/purchase-returns');
  };

  if (!purchaseOrderId) {
    return (
      <EmptyState
        icon={Undo2}
        title="Chưa chọn đơn nhập hàng"
        description='Vui lòng bắt đầu trả hàng từ nút "Trả hàng nhà cung cấp" trên trang chi tiết đơn nhập hàng đã nhận.'
        action={
          <Button render={<Link href="/purchase-orders">Xem danh sách đơn nhập hàng</Link>} />
        }
      />
    );
  }

  if (isOrderLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isOrderError || !order) {
    return (
      <EmptyState
        icon={Undo2}
        title="Không tìm thấy đơn nhập hàng"
        description="Đơn nhập hàng này có thể không tồn tại."
        action={
          <Button render={<Link href="/purchase-orders">Xem danh sách đơn nhập hàng</Link>} />
        }
      />
    );
  }

  if (!RETURNABLE_ORDER_STATUSES.includes(order.status)) {
    return (
      <EmptyState
        icon={Undo2}
        title="Đơn nhập hàng chưa thể trả hàng"
        description="Chỉ có thể trả hàng của đơn nhập đã nhận hàng (RECEIVED)."
        action={
          <Button render={<Link href={`/purchase-orders/${order.id}`}>Xem đơn nhập hàng</Link>} />
        }
      />
    );
  }

  const purchaseItemOptions = order.items.map((item) => ({
    value: item.id,
    label: `${productNameById.get(item.productId) ?? item.productId} — đã nhận ${item.receivedQuantity}`,
  }));

  return (
    <>
      <CrudForm
        form={form}
        onSubmit={onSubmit}
        onCancel={handleCancel}
        submitLabel="Tạo phiếu trả hàng"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="purchaseOrderId">Đơn nhập hàng</Label>
            <Input id="purchaseOrderId" value={order.code} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Lý do</Label>
            <Select
              items={REASON_OPTIONS}
              value={form.watch('reason')}
              onValueChange={(value) =>
                form.setValue('reason', value as CreatePurchaseReturnFormValues['reason'], {
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
          <legend className="text-sm font-medium">Sản phẩm trả hàng</legend>
          {form.formState.errors.items?.message && (
            <p className="text-destructive text-sm">{form.formState.errors.items.message}</p>
          )}
          {form.formState.errors.items?.root?.message && (
            <p className="text-destructive text-sm">{form.formState.errors.items.root.message}</p>
          )}
          {itemsArray.fields.map((field, index) => (
            <div key={field.id} className="flex items-end gap-2">
              <div className="w-72 space-y-1.5">
                <Label htmlFor={`item-purchase-item-${index}`}>Dòng hàng</Label>
                <Select
                  items={purchaseItemOptions}
                  value={form.watch(`items.${index}.purchaseItemId`)}
                  onValueChange={(value) =>
                    form.setValue(`items.${index}.purchaseItemId`, value ?? '', {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger
                    id={`item-purchase-item-${index}`}
                    className="w-full"
                    aria-label="Dòng hàng"
                  >
                    <SelectValue placeholder="Chọn dòng hàng đã nhận" />
                  </SelectTrigger>
                  <SelectContent>
                    {purchaseItemOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.items?.[index]?.purchaseItemId && (
                  <p className="text-destructive text-sm">
                    {form.formState.errors.items[index]?.purchaseItemId?.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`item-quantity-${index}`}>Số lượng trả</Label>
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
                aria-label="Xóa dòng hàng này"
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
            onClick={() => itemsArray.append({ purchaseItemId: '', quantity: 1 })}
          >
            Thêm dòng hàng
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
        onConfirm={() => router.push('/purchase-returns')}
      />
    </>
  );
}
