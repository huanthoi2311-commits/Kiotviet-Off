'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Package } from 'lucide-react';
import {
  getProductControllerFindOneQueryKey,
  getProductControllerSearchQueryKey,
  useProductControllerFindOne,
  useProductControllerUpdate,
} from '@/generated/product/product';
import type { ProductResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { usePermission } from '@/hooks/use-permission';
import type { NormalizedError } from '@/services/api-client';
import { editProductSchema, type EditProductFormValues } from '../edit-schema';
import { useProductRelationOptions, useVariantParentOptions } from '../use-product-relations';
import { ProductPriceEditor } from './product-price-editor';

const TYPE_OPTIONS: { value: EditProductFormValues['type']; label: string }[] = [
  { value: 'STANDARD', label: 'Sản phẩm thường' },
  { value: 'SERVICE', label: 'Dịch vụ' },
  { value: 'VARIANT_PARENT', label: 'Sản phẩm cha (Variant Parent)' },
  { value: 'VARIANT_CHILD', label: 'Biến thể (Variant Child)' },
];

const STATUS_OPTIONS: { value: NonNullable<EditProductFormValues['status']>; label: string }[] = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Ngừng hoạt động' },
  { value: 'ARCHIVED', label: 'Đã lưu trữ' },
];

/**
 * Orval/NestJS Swagger quirk: nullable scalar fields (`@ApiProperty({ nullable: true })` without an
 * explicit `type`) generate as `{ [key: string]: unknown } | null` instead of `string | null` — the
 * runtime value is always a real string or `null`, only the generated TS type is imprecise.
 */
function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toFormValues(product: ProductResponseDto): EditProductFormValues {
  return {
    version: product.version,
    categoryId: product.categoryId,
    brandId: asNullableString(product.brandId) ?? '',
    unitId: product.unitId,
    type: product.type as EditProductFormValues['type'],
    parentProductId: asNullableString(product.parentProductId) ?? '',
    name: product.name,
    description: asNullableString(product.description) ?? '',
    costPrice: Number(product.costPrice),
    vat: product.vat ? Number(product.vat) : undefined,
    weight: product.weight ? Number(product.weight) : undefined,
    length: product.length ? Number(product.length) : undefined,
    width: product.width ? Number(product.width) : undefined,
    height: product.height ? Number(product.height) : undefined,
    status: product.status as EditProductFormValues['status'],
  };
}

/**
 * T043 Phase F — Product Edit. Core fields only: `Product.version` Optimistic Lock, PRODUCT_008
 * (type-change-blocked-after-transaction-history — now real, T043.05) surfaced as a field error on
 * `type` when the backend rejects it (no client-side prediction is possible — there's no endpoint
 * exposing "has this product had a transaction yet", so the Type field stays editable and reacts to
 * the real error, same principle as any other server-validated field). Barcodes/images are
 * read-only display only (T043 AD-2/AD-3). Price editing is delegated entirely to
 * `<ProductPriceEditor>` — a separate component with its own query/mutation/concurrency token,
 * never touching this form's `version` or vice versa.
 */
export function ProductEditForm({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canUpdate = usePermission('product:update');

  const {
    data: product,
    isLoading,
    isError,
    error,
    refetch,
  } = useProductControllerFindOne<ProductResponseDto, NormalizedError>(id);

  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { categoryOptions, brandOptions, unitOptions } = useProductRelationOptions();

  const formValues = useMemo(() => (product ? toFormValues(product) : undefined), [product]);

  const form = useCrudForm({
    schema: editProductSchema,
    values: formValues,
  });
  void form.formState.errors.root;

  const type = form.watch('type');
  const isVariantChild = type === 'VARIANT_CHILD';
  const { parentOptions } = useVariantParentOptions(isVariantChild);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form.formState.isDirty]);

  const updateMutation = useProductControllerUpdate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getProductControllerSearchQueryKey() });
        queryClient.invalidateQueries({ queryKey: getProductControllerFindOneQueryKey(id) });
        form.reset(toFormValues(response));
        toast.success('Đã cập nhật sản phẩm');
      },
      onError: (err) => {
        if (err.kind === 'api-error') {
          if (err.code === 'PRODUCT_013') {
            setConflictMessage(err.message);
            return;
          }
          if (err.code === 'PRODUCT_008') {
            form.setError('type', { type: 'server', message: err.message });
            return;
          }
          if (
            err.code === 'PRODUCT_009' ||
            err.code === 'PRODUCT_010' ||
            err.code === 'PRODUCT_014'
          ) {
            form.setError('parentProductId', { type: 'server', message: err.message });
            return;
          }
          form.setServerError(err);
          return;
        }
        form.setError('root', { type: 'server', message: err.message });
      },
    },
  });

  const onSubmit = (values: EditProductFormValues) => {
    setConflictMessage(null);
    updateMutation.mutate({
      id,
      data: {
        version: values.version,
        categoryId: values.categoryId,
        // Orval mistypes nullable scalar fields — see `asNullableString()` above.
        brandId: (values.brandId || undefined) as never,
        unitId: values.unitId,
        type: values.type,
        parentProductId: (values.type === 'VARIANT_CHILD' ? values.parentProductId : null) as never,
        name: values.name,
        description: values.description || undefined,
        costPrice: values.costPrice,
        vat: values.vat,
        weight: values.weight,
        length: values.length,
        width: values.width,
        height: values.height,
        status: values.status,
      },
    });
  };

  const handleReload = () => {
    setConflictMessage(null);
    refetch();
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/products');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isError && error.kind === 'api-error' && error.code === 'PRODUCT_001') {
    return (
      <EmptyState
        icon={Package}
        title="Không tìm thấy sản phẩm"
        description="Sản phẩm này có thể đã bị xóa hoặc không tồn tại."
        action={<Button render={<Link href="/products">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !product) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <p className="text-destructive text-sm">
          {error?.message ?? 'Đã xảy ra lỗi không xác định'}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Thông tin sản phẩm</h2>

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

        {!canUpdate ? (
          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Tên sản phẩm</Label>
              <Input id="name" value={product.name} disabled readOnly />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">Loại sản phẩm</Label>
              <Input id="type" value={product.type} disabled readOnly />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Trạng thái</Label>
              <Input id="status" value={product.status} disabled readOnly />
            </div>
          </div>
        ) : (
          <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Lưu">
            <div className="space-y-1.5">
              <Label htmlFor="name">Tên sản phẩm</Label>
              <Input
                id="name"
                aria-invalid={Boolean(form.formState.errors.name)}
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Mô tả</Label>
              <Input id="description" {...form.register('description')} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="categoryId">Danh mục</Label>
                <Select
                  items={categoryOptions}
                  value={form.watch('categoryId')}
                  onValueChange={(value) =>
                    form.setValue('categoryId', value ?? '', { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="categoryId" className="w-full" aria-label="Danh mục">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="brandId">Thương hiệu</Label>
                <Select
                  items={brandOptions}
                  value={form.watch('brandId')}
                  onValueChange={(value) =>
                    form.setValue('brandId', value ?? '', { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="brandId" className="w-full" aria-label="Thương hiệu">
                    <SelectValue placeholder="Không có" />
                  </SelectTrigger>
                  <SelectContent>
                    {brandOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="unitId">Đơn vị tính</Label>
                <Select
                  items={unitOptions}
                  value={form.watch('unitId')}
                  onValueChange={(value) =>
                    form.setValue('unitId', value ?? '', { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="unitId" className="w-full" aria-label="Đơn vị tính">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {unitOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="type">Loại sản phẩm</Label>
                <Select
                  items={TYPE_OPTIONS}
                  value={type}
                  onValueChange={(value) => {
                    form.setValue('type', value as EditProductFormValues['type'], {
                      shouldDirty: true,
                    });
                    if (value !== 'VARIANT_CHILD') form.setValue('parentProductId', '');
                  }}
                >
                  <SelectTrigger
                    id="type"
                    className="w-full"
                    aria-label="Loại sản phẩm"
                    aria-invalid={Boolean(form.formState.errors.type)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.type && (
                  <p className="text-destructive text-sm">{form.formState.errors.type.message}</p>
                )}
              </div>

              {isVariantChild && (
                <div className="space-y-1.5">
                  <Label htmlFor="parentProductId">Sản phẩm cha (Variant Parent)</Label>
                  <Select
                    items={parentOptions}
                    value={form.watch('parentProductId')}
                    onValueChange={(value) =>
                      form.setValue('parentProductId', value ?? '', { shouldDirty: true })
                    }
                  >
                    <SelectTrigger
                      id="parentProductId"
                      className="w-full"
                      aria-label="Sản phẩm cha"
                      aria-invalid={Boolean(form.formState.errors.parentProductId)}
                    >
                      <SelectValue placeholder="Chọn sản phẩm cha" />
                    </SelectTrigger>
                    <SelectContent>
                      {parentOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.parentProductId && (
                    <p className="text-destructive text-sm">
                      {form.formState.errors.parentProductId.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="costPrice">Giá vốn</Label>
                <Input
                  id="costPrice"
                  type="number"
                  min={0}
                  aria-invalid={Boolean(form.formState.errors.costPrice)}
                  {...form.register('costPrice')}
                />
                {form.formState.errors.costPrice && (
                  <p className="text-destructive text-sm">
                    {form.formState.errors.costPrice.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vat">% VAT</Label>
                <Input id="vat" type="number" min={0} max={100} {...form.register('vat')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">Trạng thái</Label>
                <Select
                  items={STATUS_OPTIONS}
                  value={form.watch('status') ?? 'ACTIVE'}
                  onValueChange={(value) =>
                    form.setValue('status', value as EditProductFormValues['status'], {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger id="status" className="w-full" aria-label="Trạng thái">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="weight">Khối lượng (kg)</Label>
                <Input id="weight" type="number" min={0} {...form.register('weight')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="length">Dài (cm)</Label>
                <Input id="length" type="number" min={0} {...form.register('length')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="width">Rộng (cm)</Label>
                <Input id="width" type="number" min={0} {...form.register('width')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="height">Cao (cm)</Label>
                <Input id="height" type="number" min={0} {...form.register('height')} />
              </div>
            </div>
          </CrudForm>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Bảng giá</h2>
        <ProductPriceEditor productId={id} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Mã vạch</h2>
        <p className="text-muted-foreground text-sm">
          Chỉ xem — quản lý mã vạch (sửa/lưu trữ/khôi phục) sẽ có ở module Mã vạch riêng.
        </p>
        {product.barcodes.length === 0 ? (
          <p className="text-muted-foreground text-sm">Chưa có mã vạch nào.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {product.barcodes.map((barcode) => (
              <li key={barcode.id} className="flex items-center gap-2 text-sm">
                <span>{barcode.code}</span>
                <span className="text-muted-foreground">({barcode.type})</span>
                {barcode.isDefault && <span className="text-muted-foreground">— Mặc định</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Hình ảnh</h2>
        <p className="text-muted-foreground text-sm">
          Chỉ xem — chỉnh sửa hình ảnh chưa được hỗ trợ ở phiên bản này.
        </p>
        {product.images.length === 0 ? (
          <p className="text-muted-foreground text-sm">Chưa có hình ảnh nào.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {product.images.map((image) => (
              <li key={image.id} className="text-sm break-all">
                {image.url}
                {image.isThumbnail && (
                  <span className="text-muted-foreground"> — Ảnh đại diện</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="Hủy các thay đổi chưa lưu?"
        description="Các thay đổi bạn đã nhập sẽ không được lưu."
        confirmLabel="Hủy thay đổi"
        cancelLabel="Tiếp tục chỉnh sửa"
        danger
        onConfirm={() => router.push('/products')}
      />
    </div>
  );
}
