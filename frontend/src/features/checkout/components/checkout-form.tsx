'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getCartControllerGetCartQueryKey } from '@/generated/cart/cart';
import { getInvoiceControllerSearchQueryKey } from '@/generated/invoice/invoice';
import type { CheckoutDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
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
import {
  useBranchOptions,
  useProductOptions,
  useWarehouseOptions,
} from '../../inventory/use-inventory-relations';
import { useCustomerOptions } from '../use-checkout-relations';
import { useCheckoutMutation } from '../use-checkout-mutation';
import { checkoutSchema, type CheckoutFormOutput, type CheckoutFormValues } from '../schema';

const PAYMENT_METHOD_OPTIONS: { value: CheckoutFormValues['paymentMethod']; label: string }[] = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
  { value: 'CARD', label: 'Thẻ' },
  { value: 'E_WALLET', label: 'Ví điện tử' },
];

const MANUAL_DISCOUNT_TYPE_OPTIONS: {
  value: NonNullable<CheckoutFormValues['manualDiscountType']>;
  label: string;
}[] = [
  { value: 'PERCENT', label: 'Phần trăm (%)' },
  { value: 'AMOUNT', label: 'Số tiền' },
  { value: 'FIXED_PRICE', label: 'Giá cố định' },
  { value: 'BUY_X_GET_Y', label: 'Mua X tặng Y' },
];

interface CheckoutSuccessResult {
  invoiceCode: string;
  totalAmount: string;
  paymentMethod: string;
}

/**
 * T046 §5/§12 — Checkout form. Submits via the AD-2 `useCheckoutMutation` wrapper (the sole
 * approved exception to generated-hooks-only in this domain) because the mandatory
 * Idempotency-Key header cannot be expressed by any generated hook. No `items` field exists on
 * this form — Checkout reads the server Cart implicitly.
 */
export function CheckoutForm({ cartIsEmpty }: { cartIsEmpty: boolean }) {
  const queryClient = useQueryClient();
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [successResult, setSuccessResult] = useState<CheckoutSuccessResult | null>(null);

  const { branchOptions } = useBranchOptions();
  const { warehouseOptions } = useWarehouseOptions('ACTIVE');
  const { customerOptions } = useCustomerOptions('ACTIVE');
  const { productOptions } = useProductOptions();

  const form = useCrudForm<CheckoutFormValues, CheckoutFormOutput>({
    schema: checkoutSchema,
    defaultValues: {
      branchId: '',
      warehouseId: '',
      customerId: '',
      paymentMethod: 'CASH',
      voucherCode: '',
      pointsToUse: '',
      useManualDiscount: false,
      manualDiscountType: 'PERCENT',
      manualDiscountValue: '',
      manualDiscountProductId: '',
      manualDiscountBuyQuantity: '',
      manualDiscountGetQuantity: '',
    },
  });
  void form.formState.errors.root;

  const customerId = form.watch('customerId');
  const useManualDiscount = form.watch('useManualDiscount');
  const manualDiscountType = form.watch('manualDiscountType');

  const checkoutMutation = useCheckoutMutation({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getCartControllerGetCartQueryKey() });
        queryClient.invalidateQueries({ queryKey: getInvoiceControllerSearchQueryKey() });
        setSuccessResult({
          invoiceCode: result.invoice.code,
          totalAmount: result.invoice.totalAmount,
          paymentMethod: result.payment.method,
        });
        toast.success('Thanh toán thành công');
        setIdempotencyKey(crypto.randomUUID());
        form.reset();
      },
      onError: (error) => {
        if (error.kind === 'api-error') {
          if (error.code === 'CHECKOUT_VOUCHER_INVALID') {
            form.setError('voucherCode', { type: 'server', message: error.message });
            return;
          }
          if (error.code === 'CHECKOUT_POINTS_EXCEED_TOTAL') {
            form.setError('pointsToUse', { type: 'server', message: error.message });
            return;
          }
          form.setServerError(error);
          return;
        }
        form.setError('root', { type: 'server', message: error.message });
      },
    },
  });

  const onSubmit = (values: CheckoutFormOutput) => {
    const dto: CheckoutDto = {
      branchId: values.branchId,
      warehouseId: values.warehouseId,
      customerId: values.customerId || undefined,
      paymentMethod: values.paymentMethod,
      voucherCode: values.voucherCode || undefined,
      pointsToUse: values.pointsToUse ? Number(values.pointsToUse) : undefined,
      manualDiscount: values.useManualDiscount
        ? {
            type: values.manualDiscountType!,
            value: values.manualDiscountValue ? Number(values.manualDiscountValue) : undefined,
            productId: values.manualDiscountProductId || undefined,
            buyQuantity: values.manualDiscountBuyQuantity
              ? Number(values.manualDiscountBuyQuantity)
              : undefined,
            getQuantity: values.manualDiscountGetQuantity
              ? Number(values.manualDiscountGetQuantity)
              : undefined,
          }
        : undefined,
    };
    checkoutMutation.mutate({ data: dto, idempotencyKey });
  };

  const needsProductForDiscount = useMemo(
    () => manualDiscountType === 'FIXED_PRICE' || manualDiscountType === 'BUY_X_GET_Y',
    [manualDiscountType],
  );

  if (successResult) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border p-6">
        <h2 className="text-lg font-medium">Thanh toán thành công</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Mã hóa đơn</dt>
          <dd>{successResult.invoiceCode}</dd>
          <dt className="text-muted-foreground">Tổng tiền</dt>
          <dd>{successResult.totalAmount}</dd>
          <dt className="text-muted-foreground">Phương thức</dt>
          <dd>{successResult.paymentMethod}</dd>
        </dl>
        <Button type="button" onClick={() => setSuccessResult(null)} className="w-fit">
          Bán hàng mới
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {form.formState.errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="checkout-branch">Chi nhánh</Label>
          <Select
            items={branchOptions}
            value={form.watch('branchId')}
            onValueChange={(value) => form.setValue('branchId', value ?? '', { shouldDirty: true })}
          >
            <SelectTrigger
              id="checkout-branch"
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
          <Label htmlFor="checkout-warehouse">Kho xuất hàng</Label>
          <Select
            items={warehouseOptions}
            value={form.watch('warehouseId')}
            onValueChange={(value) =>
              form.setValue('warehouseId', value ?? '', { shouldDirty: true })
            }
          >
            <SelectTrigger
              id="checkout-warehouse"
              className="w-full"
              aria-label="Kho xuất hàng"
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
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="checkout-customer">Khách hàng</Label>
        <Select
          items={customerOptions}
          value={form.watch('customerId')}
          onValueChange={(value) => form.setValue('customerId', value ?? '', { shouldDirty: true })}
        >
          <SelectTrigger id="checkout-customer" className="w-full" aria-label="Khách hàng">
            <SelectValue placeholder="Khách lẻ (không bắt buộc)" />
          </SelectTrigger>
          <SelectContent>
            {customerOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="checkout-payment-method">Phương thức thanh toán</Label>
          <Select
            items={PAYMENT_METHOD_OPTIONS}
            value={form.watch('paymentMethod')}
            onValueChange={(value) =>
              form.setValue('paymentMethod', value as CheckoutFormValues['paymentMethod'], {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger
              id="checkout-payment-method"
              className="w-full"
              aria-label="Phương thức thanh toán"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="checkout-voucher">Mã giảm giá</Label>
          <Input
            id="checkout-voucher"
            aria-invalid={Boolean(form.formState.errors.voucherCode)}
            {...form.register('voucherCode')}
          />
          {form.formState.errors.voucherCode && (
            <p className="text-destructive text-sm">{form.formState.errors.voucherCode.message}</p>
          )}
        </div>
      </div>

      {customerId && (
        <div className="space-y-1.5">
          <Label htmlFor="checkout-points">Điểm tích lũy sử dụng</Label>
          <Input
            id="checkout-points"
            type="number"
            min={0}
            aria-invalid={Boolean(form.formState.errors.pointsToUse)}
            {...form.register('pointsToUse')}
          />
          {form.formState.errors.pointsToUse && (
            <p className="text-destructive text-sm">{form.formState.errors.pointsToUse.message}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          id="checkout-use-manual-discount"
          type="checkbox"
          className="size-4"
          checked={Boolean(useManualDiscount)}
          onChange={(e) =>
            form.setValue('useManualDiscount', e.target.checked, { shouldDirty: true })
          }
        />
        <Label htmlFor="checkout-use-manual-discount">Áp dụng giảm giá thủ công</Label>
      </div>

      {useManualDiscount && (
        <fieldset className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Giảm giá thủ công</legend>
          <div className="w-48 space-y-1.5">
            <Label htmlFor="checkout-discount-type">Loại</Label>
            <Select
              items={MANUAL_DISCOUNT_TYPE_OPTIONS}
              value={form.watch('manualDiscountType')}
              onValueChange={(value) =>
                form.setValue(
                  'manualDiscountType',
                  value as CheckoutFormValues['manualDiscountType'],
                  { shouldDirty: true },
                )
              }
            >
              <SelectTrigger
                id="checkout-discount-type"
                className="w-full"
                aria-label="Loại giảm giá"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_DISCOUNT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {manualDiscountType !== 'BUY_X_GET_Y' && (
            <div className="w-32 space-y-1.5">
              <Label htmlFor="checkout-discount-value">Giá trị</Label>
              <Input
                id="checkout-discount-value"
                type="number"
                {...form.register('manualDiscountValue')}
              />
            </div>
          )}

          {needsProductForDiscount && (
            <div className="w-56 space-y-1.5">
              <Label htmlFor="checkout-discount-product">Sản phẩm áp dụng</Label>
              <Select
                items={productOptions}
                value={form.watch('manualDiscountProductId')}
                onValueChange={(value) =>
                  form.setValue('manualDiscountProductId', value ?? '', { shouldDirty: true })
                }
              >
                <SelectTrigger
                  id="checkout-discount-product"
                  className="w-full"
                  aria-label="Sản phẩm áp dụng"
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
            </div>
          )}

          {manualDiscountType === 'BUY_X_GET_Y' && (
            <>
              <div className="w-24 space-y-1.5">
                <Label htmlFor="checkout-discount-buy-qty">Mua</Label>
                <Input
                  id="checkout-discount-buy-qty"
                  type="number"
                  min={1}
                  {...form.register('manualDiscountBuyQuantity')}
                />
              </div>
              <div className="w-24 space-y-1.5">
                <Label htmlFor="checkout-discount-get-qty">Tặng</Label>
                <Input
                  id="checkout-discount-get-qty"
                  type="number"
                  min={1}
                  {...form.register('manualDiscountGetQuantity')}
                />
              </div>
            </>
          )}
        </fieldset>
      )}

      <Button
        type="submit"
        disabled={cartIsEmpty || form.formState.isSubmitting || checkoutMutation.isPending}
        aria-disabled={cartIsEmpty || form.formState.isSubmitting || checkoutMutation.isPending}
      >
        Thanh toán
      </Button>
      {cartIsEmpty && <p className="text-muted-foreground text-sm">Giỏ hàng đang trống.</p>}
    </form>
  );
}
