'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useFieldArray } from 'react-hook-form';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  getProductPriceControllerFindSetQueryKey,
  useProductPriceControllerFindSet,
  useProductPriceControllerReplaceSet,
} from '@/generated/product-price/product-price';
import type { ProductPriceSetResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useCrudForm } from '@/hooks/use-crud-form';
import { usePermission } from '@/hooks/use-permission';
import type { NormalizedError } from '@/services/api-client';
import { productPriceSetSchema, type ProductPriceSetFormValues } from '../edit-schema';

type ProductPriceType = 'RETAIL' | 'WHOLESALE' | 'VIP' | 'DEALER';

const PRICE_TYPE_LABELS: Record<string, string> = {
  RETAIL: 'Bán lẻ (RETAIL)',
  WHOLESALE: 'Bán sỉ (WHOLESALE)',
  VIP: 'VIP',
  DEALER: 'Đại lý (DEALER)',
};

const ALL_PRICE_TYPES: ProductPriceType[] = ['RETAIL', 'WHOLESALE', 'VIP', 'DEALER'];

/**
 * T043 Phase I — dedicated Product Price editor (T043.07 contract). Uses ONLY
 * `useProductPriceControllerFindSet`/`useProductPriceControllerReplaceSet` — never the Product core
 * update mutation. `priceVersion` is its own Optimistic Lock token, entirely separate from
 * `Product.version`: this component never reads or writes the core form's version, and the core
 * Edit form never reads or writes `priceVersion` — verified structurally by the two components not
 * sharing any mutation or form instance.
 */
export function ProductPriceEditor({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const canUpdate = usePermission('product:update');

  const {
    data: priceSet,
    isLoading,
    isError,
    error,
    refetch,
  } = useProductPriceControllerFindSet<ProductPriceSetResponseDto, NormalizedError>(productId);

  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const formValues = useMemo<ProductPriceSetFormValues | undefined>(
    () =>
      priceSet
        ? {
            priceVersion: priceSet.priceVersion,
            prices: priceSet.prices.map((p) => ({
              type: p.type as ProductPriceType,
              price: Number(p.price),
            })),
          }
        : undefined,
    [priceSet],
  );

  const form = useCrudForm({
    schema: productPriceSetSchema,
    values: formValues,
  });
  void form.formState.errors.root;

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'prices' });

  const usedTypes = new Set(form.watch('prices')?.map((p) => p.type) ?? []);
  const availableTypesToAdd = ALL_PRICE_TYPES.filter((t) => !usedTypes.has(t));

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form.formState.isDirty]);

  const replaceMutation = useProductPriceControllerReplaceSet<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({
          queryKey: getProductPriceControllerFindSetQueryKey(productId),
        });
        form.reset({
          priceVersion: response.priceVersion,
          prices: response.prices.map((p) => ({
            type: p.type as ProductPriceType,
            price: Number(p.price),
          })),
        });
        toast.success('Đã cập nhật bảng giá');
      },
      onError: (err) => {
        if (err.kind === 'api-error') {
          if (err.code === 'PRODUCT_PRICE_001') {
            setConflictMessage(err.message);
            return;
          }
          form.setServerError(err);
          return;
        }
        form.setError('root', { type: 'server', message: err.message });
      },
    },
  });

  const onSubmit = (values: ProductPriceSetFormValues) => {
    setConflictMessage(null);
    replaceMutation.mutate({
      productId,
      data: { priceVersion: values.priceVersion, prices: values.prices },
    });
  };

  const handleReload = () => {
    setConflictMessage(null);
    refetch();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !priceSet) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 text-center">
        <p className="text-destructive text-sm">
          {error?.kind === 'api-error' ? error.message : 'Không tải được bảng giá'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  if (!canUpdate) {
    return (
      <div className="flex flex-col gap-2">
        {priceSet.prices.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-4 text-sm">
            <span>{PRICE_TYPE_LABELS[p.type] ?? p.type}</span>
            <span>{p.price}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {conflictMessage && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{conflictMessage}</span>
            <Button type="button" variant="outline" size="sm" onClick={handleReload}>
              Tải lại
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        {form.formState.errors.root?.message ? (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        ) : null}
        {form.formState.errors.prices?.root?.message ? (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.prices.root.message}</AlertDescription>
          </Alert>
        ) : null}
        {form.formState.errors.prices?.message ? (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.prices.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`price-type-${index}`}>Loại giá</Label>
                <Select
                  items={ALL_PRICE_TYPES.map((t) => ({ value: t, label: PRICE_TYPE_LABELS[t] }))}
                  value={form.watch(`prices.${index}.type`)}
                  onValueChange={(value) =>
                    form.setValue(`prices.${index}.type`, value as ProductPriceType, {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger id={`price-type-${index}`} className="w-44" aria-label="Loại giá">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_PRICE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {PRICE_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`price-value-${index}`}>Giá</Label>
                <Input
                  id={`price-value-${index}`}
                  type="number"
                  min={0}
                  aria-invalid={Boolean(form.formState.errors.prices?.[index]?.price)}
                  {...form.register(`prices.${index}.price`)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Xóa mức giá này"
                onClick={() => remove(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        {availableTypesToAdd.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ type: availableTypesToAdd[0], price: 0 })}
          >
            <Plus className="size-4" />
            Thêm mức giá
          </Button>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={form.isSubmitting}>
            Lưu bảng giá
          </Button>
        </div>
      </form>
    </div>
  );
}
