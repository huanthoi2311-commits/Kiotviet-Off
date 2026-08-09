'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useFieldArray } from 'react-hook-form';
import { toast } from 'sonner';
import { Trash2, Undo2 } from 'lucide-react';
import { useInvoiceControllerGetById } from '@/generated/invoice/invoice';
import {
  getSalesReturnControllerSearchQueryKey,
  useSalesReturnControllerCreate,
  useSalesReturnControllerEligibility,
} from '@/generated/sales-return/sales-return';
import type { InvoiceResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
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
import { useWarehouseOptions } from '../../inventory/use-inventory-relations';
import {
  createSalesReturnSchema,
  type CreateSalesReturnFormOutput,
  type CreateSalesReturnFormValues,
} from '../schema';

const REASON_OPTIONS: {
  value: CreateSalesReturnFormValues['items'][number]['reason'];
  label: string;
}[] = [
  { value: 'DAMAGED', label: 'Hư hỏng' },
  { value: 'DEFECTIVE', label: 'Lỗi sản xuất' },
  { value: 'WRONG_PRODUCT', label: 'Sai sản phẩm' },
  { value: 'CUSTOMER_CHANGED_MIND', label: 'Khách đổi ý' },
  { value: 'EXPIRED', label: 'Hết hạn' },
  { value: 'TRANSPORT_DAMAGE', label: 'Hư hỏng vận chuyển' },
  { value: 'OTHER', label: 'Khác' },
];

/**
 * T047 §6/§12 — Sales Return Create. Only reachable with a known `invoiceId` (via the "Trả hàng"
 * link on Invoice Detail) — the backend requires returns to reference an existing invoice and its
 * own line items (`invoiceItemId`), so there is no standalone "browse all invoices" picker; the
 * natural, complete entry point is the invoice's own detail page (mirrors T045 Purchase Return).
 */
export function SalesReturnCreateForm({ invoiceId }: { invoiceId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const {
    data: invoice,
    isLoading: isInvoiceLoading,
    isError: isInvoiceError,
  } = useInvoiceControllerGetById<InvoiceResponseDto, NormalizedError>(invoiceId ?? '', {
    query: { enabled: Boolean(invoiceId) },
  });

  const { data: eligibility } = useSalesReturnControllerEligibility(
    { invoiceId: invoiceId ?? '' },
    { query: { enabled: Boolean(invoiceId) } },
  );
  const eligibilityByItemId = useMemo(
    () => new Map((eligibility ?? []).map((e) => [e.invoiceItemId, e])),
    [eligibility],
  );

  const { warehouseOptions } = useWarehouseOptions('ACTIVE');

  const form = useCrudForm<CreateSalesReturnFormValues, CreateSalesReturnFormOutput>({
    schema: createSalesReturnSchema,
    defaultValues: {
      invoiceId: invoiceId ?? '',
      note: '',
      items: [
        { invoiceItemId: '', quantity: 1, reason: 'DAMAGED', reasonNote: '', warehouseId: '' },
      ],
    },
  });
  void form.formState.errors.root;

  useEffect(() => {
    if (invoiceId) form.setValue('invoiceId', invoiceId);
  }, [invoiceId, form]);

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

  const createMutation = useSalesReturnControllerCreate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getSalesReturnControllerSearchQueryKey() });
        toast.success('Đã tạo phiếu trả hàng');
        router.push(`/sales-returns/${data.id}`);
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

  const onSubmit = (values: CreateSalesReturnFormOutput) => {
    createMutation.mutate({
      data: {
        invoiceId: values.invoiceId,
        note: values.note || undefined,
        items: values.items.map((item) => ({
          invoiceItemId: item.invoiceItemId,
          quantity: item.quantity,
          reason: item.reason,
          reasonNote: item.reasonNote || undefined,
          warehouseId: item.warehouseId || undefined,
        })),
      },
    });
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/sales-returns');
  };

  if (!invoiceId) {
    return (
      <EmptyState
        icon={Undo2}
        title="Chưa chọn hóa đơn"
        description='Vui lòng bắt đầu trả hàng từ nút "Trả hàng" trên trang chi tiết hóa đơn.'
        action={<Button render={<Link href="/invoices">Xem danh sách hóa đơn</Link>} />}
      />
    );
  }

  if (isInvoiceLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isInvoiceError || !invoice) {
    return (
      <EmptyState
        icon={Undo2}
        title="Không tìm thấy hóa đơn"
        description="Hóa đơn này có thể không tồn tại."
        action={<Button render={<Link href="/invoices">Xem danh sách hóa đơn</Link>} />}
      />
    );
  }

  if (invoice.status === 'CANCELLED') {
    return (
      <EmptyState
        icon={Undo2}
        title="Hóa đơn đã hủy"
        description="Không thể trả hàng cho hóa đơn đã hủy."
        action={<Button render={<Link href={`/invoices/${invoice.id}`}>Xem hóa đơn</Link>} />}
      />
    );
  }

  const invoiceItemOptions = invoice.items.map((item) => {
    const itemEligibility = eligibilityByItemId.get(item.id);
    const label = itemEligibility
      ? `${item.productNameSnapshot} — còn có thể trả ${itemEligibility.eligibleQty}`
      : `${item.productNameSnapshot} — đã bán ${item.quantity}`;
    return { value: item.id, label };
  });

  return (
    <>
      <CrudForm
        form={form}
        onSubmit={onSubmit}
        onCancel={handleCancel}
        submitLabel="Tạo phiếu trả hàng"
      >
        <div className="space-y-1.5">
          <Label htmlFor="salesReturnInvoiceCode">Hóa đơn</Label>
          <Input id="salesReturnInvoiceCode" value={invoice.code} disabled readOnly />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="salesReturnNote">Ghi chú</Label>
          <Input id="salesReturnNote" {...form.register('note')} />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Sản phẩm trả hàng</legend>
          {form.formState.errors.items?.message && (
            <p className="text-destructive text-sm">{form.formState.errors.items.message}</p>
          )}
          {form.formState.errors.items?.root?.message && (
            <p className="text-destructive text-sm">{form.formState.errors.items.root.message}</p>
          )}
          {itemsArray.fields.map((field, index) => {
            const selectedItemId = form.watch(`items.${index}.invoiceItemId`);
            const selectedEligibility = eligibilityByItemId.get(selectedItemId);
            const selectedReason = form.watch(`items.${index}.reason`);
            return (
              <div key={field.id} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                <div className="w-72 space-y-1.5">
                  <Label htmlFor={`item-invoice-item-${index}`}>Dòng hàng</Label>
                  <Select
                    items={invoiceItemOptions}
                    value={selectedItemId}
                    onValueChange={(value) =>
                      form.setValue(`items.${index}.invoiceItemId`, value ?? '', {
                        shouldDirty: true,
                      })
                    }
                  >
                    <SelectTrigger
                      id={`item-invoice-item-${index}`}
                      className="w-full"
                      aria-label="Dòng hàng"
                    >
                      <SelectValue placeholder="Chọn dòng hàng đã bán" />
                    </SelectTrigger>
                    <SelectContent>
                      {invoiceItemOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.items?.[index]?.invoiceItemId && (
                    <p className="text-destructive text-sm">
                      {form.formState.errors.items[index]?.invoiceItemId?.message}
                    </p>
                  )}
                </div>
                <div className="w-28 space-y-1.5">
                  <Label htmlFor={`item-quantity-${index}`}>Số lượng trả</Label>
                  <Input
                    id={`item-quantity-${index}`}
                    type="number"
                    min={0}
                    max={selectedEligibility ? Number(selectedEligibility.eligibleQty) : undefined}
                    step="any"
                    {...form.register(`items.${index}.quantity`)}
                  />
                  {form.formState.errors.items?.[index]?.quantity && (
                    <p className="text-destructive text-sm">
                      {form.formState.errors.items[index]?.quantity?.message}
                    </p>
                  )}
                </div>
                <div className="w-44 space-y-1.5">
                  <Label htmlFor={`item-reason-${index}`}>Lý do</Label>
                  <Select
                    items={REASON_OPTIONS}
                    value={selectedReason}
                    onValueChange={(value) =>
                      form.setValue(
                        `items.${index}.reason`,
                        value as CreateSalesReturnFormValues['items'][number]['reason'],
                        { shouldDirty: true },
                      )
                    }
                  >
                    <SelectTrigger
                      id={`item-reason-${index}`}
                      className="w-full"
                      aria-label="Lý do"
                    >
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
                {selectedReason === 'OTHER' && (
                  <div className="w-56 space-y-1.5">
                    <Label htmlFor={`item-reason-note-${index}`}>Chi tiết lý do</Label>
                    <Input
                      id={`item-reason-note-${index}`}
                      {...form.register(`items.${index}.reasonNote`)}
                    />
                  </div>
                )}
                <div className="w-44 space-y-1.5">
                  <Label htmlFor={`item-warehouse-${index}`}>Kho nhận hàng trả (nếu cần)</Label>
                  <Select
                    items={warehouseOptions}
                    value={form.watch(`items.${index}.warehouseId`)}
                    onValueChange={(value) =>
                      form.setValue(`items.${index}.warehouseId`, value ?? '', {
                        shouldDirty: true,
                      })
                    }
                  >
                    <SelectTrigger
                      id={`item-warehouse-${index}`}
                      className="w-full"
                      aria-label="Kho nhận hàng trả"
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
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() =>
              itemsArray.append({
                invoiceItemId: '',
                quantity: 1,
                reason: 'DAMAGED',
                reasonNote: '',
                warehouseId: '',
              })
            }
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
        onConfirm={() => router.push('/sales-returns')}
      />
    </>
  );
}
