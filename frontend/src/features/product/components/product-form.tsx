'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useFieldArray } from 'react-hook-form';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  getProductControllerSearchQueryKey,
  useProductControllerCreate,
} from '@/generated/product/product';
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
  createProductSchema,
  type CreateProductFormOutput,
  type CreateProductFormValues,
} from '../schema';
import { useProductRelationOptions, useVariantParentOptions } from '../use-product-relations';

const TYPE_OPTIONS: { value: CreateProductFormValues['type']; label: string }[] = [
  { value: 'STANDARD', label: 'Sản phẩm thường' },
  { value: 'SERVICE', label: 'Dịch vụ' },
  { value: 'VARIANT_PARENT', label: 'Sản phẩm cha (Variant Parent)' },
  { value: 'VARIANT_CHILD', label: 'Biến thể (Variant Child)' },
];

const STATUS_OPTIONS: { value: NonNullable<CreateProductFormValues['status']>; label: string }[] = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Ngừng hoạt động' },
];

const PRICE_TYPE_OPTIONS = [
  { value: 'RETAIL', label: 'Bán lẻ (RETAIL)' },
  { value: 'WHOLESALE', label: 'Bán sỉ (WHOLESALE)' },
  { value: 'VIP', label: 'VIP' },
  { value: 'DEALER', label: 'Đại lý (DEALER)' },
] as const;

const BARCODE_TYPE_OPTIONS = [
  { value: 'EAN13', label: 'EAN13' },
  { value: 'EAN8', label: 'EAN8' },
  { value: 'CODE128', label: 'CODE128' },
  { value: 'QR', label: 'QR' },
  { value: 'CUSTOM', label: 'Khác' },
] as const;

/**
 * T043 Phase E — Product Create. Initial `prices[]`/`barcodes[]`/`images[]` use exactly the
 * existing `CreateProductDto` array shape (T043 AD-2/AD-3: barcode/image lifecycle management is
 * out of scope here — only what Create already supports). `parentProductId` picker only renders
 * when `type=VARIANT_CHILD` (Decision 9/assertValidVariantRelationship).
 */
export function ProductCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { categoryOptions, brandOptions, unitOptions } = useProductRelationOptions();

  const form = useCrudForm<CreateProductFormValues, CreateProductFormOutput>({
    schema: createProductSchema,
    defaultValues: {
      categoryId: '',
      brandId: '',
      unitId: '',
      type: 'STANDARD',
      parentProductId: '',
      name: '',
      description: '',
      costPrice: 0,
      prices: [{ type: 'RETAIL', price: 0 }],
      images: [],
      barcodes: [],
    },
  });
  void form.formState.errors.root;

  const type = form.watch('type');
  const isVariantChild = type === 'VARIANT_CHILD';
  const { parentOptions } = useVariantParentOptions(isVariantChild);

  const pricesArray = useFieldArray({ control: form.control, name: 'prices' });
  const imagesArray = useFieldArray({ control: form.control, name: 'images' });
  const barcodesArray = useFieldArray({ control: form.control, name: 'barcodes' });

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form.formState.isDirty]);

  const createMutation = useProductControllerCreate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getProductControllerSearchQueryKey() });
        toast.success('Đã tạo sản phẩm');
        router.push('/products');
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

  const onSubmit = (values: CreateProductFormOutput) => {
    createMutation.mutate({
      data: {
        categoryId: values.categoryId,
        brandId: values.brandId || undefined,
        unitId: values.unitId,
        type: values.type,
        parentProductId: values.type === 'VARIANT_CHILD' ? values.parentProductId : undefined,
        name: values.name,
        description: values.description || undefined,
        costPrice: values.costPrice,
        vat: values.vat,
        weight: values.weight,
        length: values.length,
        width: values.width,
        height: values.height,
        status: values.status,
        prices: values.prices,
        images: values.images?.length ? values.images : undefined,
        barcodes: values.barcodes?.length ? values.barcodes : undefined,
      },
    });
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/products');
  };

  return (
    <>
      <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Tạo sản phẩm">
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
              <SelectTrigger
                id="categoryId"
                className="w-full"
                aria-label="Danh mục"
                aria-invalid={Boolean(form.formState.errors.categoryId)}
              >
                <SelectValue placeholder="Chọn danh mục" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.categoryId && (
              <p className="text-destructive text-sm">{form.formState.errors.categoryId.message}</p>
            )}
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
                <SelectValue placeholder="Chọn thương hiệu (không bắt buộc)" />
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
              onValueChange={(value) => form.setValue('unitId', value ?? '', { shouldDirty: true })}
            >
              <SelectTrigger
                id="unitId"
                className="w-full"
                aria-label="Đơn vị tính"
                aria-invalid={Boolean(form.formState.errors.unitId)}
              >
                <SelectValue placeholder="Chọn đơn vị tính" />
              </SelectTrigger>
              <SelectContent>
                {unitOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.unitId && (
              <p className="text-destructive text-sm">{form.formState.errors.unitId.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="type">Loại sản phẩm</Label>
            <Select
              items={TYPE_OPTIONS}
              value={type}
              onValueChange={(value) => {
                form.setValue('type', value as CreateProductFormValues['type'], {
                  shouldDirty: true,
                });
                if (value !== 'VARIANT_CHILD') form.setValue('parentProductId', '');
              }}
            >
              <SelectTrigger id="type" className="w-full" aria-label="Loại sản phẩm">
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
              <p className="text-destructive text-sm">{form.formState.errors.costPrice.message}</p>
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
                form.setValue('status', value as CreateProductFormValues['status'], {
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

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Bảng giá</legend>
          {form.formState.errors.prices?.message && (
            <p className="text-destructive text-sm">{form.formState.errors.prices.message}</p>
          )}
          {form.formState.errors.prices?.root?.message && (
            <p className="text-destructive text-sm">{form.formState.errors.prices.root.message}</p>
          )}
          {pricesArray.fields.map((field, index) => (
            <div key={field.id} className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`create-price-type-${index}`}>Loại giá</Label>
                <Select
                  items={PRICE_TYPE_OPTIONS}
                  value={form.watch(`prices.${index}.type`)}
                  onValueChange={(value) =>
                    form.setValue(`prices.${index}.type`, value as never, { shouldDirty: true })
                  }
                >
                  <SelectTrigger
                    id={`create-price-type-${index}`}
                    className="w-44"
                    aria-label="Loại giá"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`create-price-value-${index}`}>Giá</Label>
                <Input
                  id={`create-price-value-${index}`}
                  type="number"
                  min={0}
                  {...form.register(`prices.${index}.price`)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Xóa mức giá này"
                onClick={() => pricesArray.remove(index)}
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
            onClick={() => pricesArray.append({ type: 'RETAIL', price: 0 })}
          >
            <Plus className="size-4" />
            Thêm mức giá
          </Button>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Mã vạch ban đầu (không bắt buộc)</legend>
          {barcodesArray.fields.map((field, index) => (
            <div key={field.id} className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`barcode-code-${index}`}>Mã vạch</Label>
                <Input id={`barcode-code-${index}`} {...form.register(`barcodes.${index}.code`)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`barcode-type-${index}`}>Loại mã vạch</Label>
                <Select
                  items={BARCODE_TYPE_OPTIONS}
                  value={form.watch(`barcodes.${index}.type`)}
                  onValueChange={(value) =>
                    form.setValue(`barcodes.${index}.type`, value as never, { shouldDirty: true })
                  }
                >
                  <SelectTrigger
                    id={`barcode-type-${index}`}
                    className="w-36"
                    aria-label="Loại mã vạch"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BARCODE_TYPE_OPTIONS.map((option) => (
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
                aria-label="Xóa mã vạch này"
                onClick={() => barcodesArray.remove(index)}
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
            onClick={() => barcodesArray.append({ code: '', type: 'EAN13' })}
          >
            <Plus className="size-4" />
            Thêm mã vạch
          </Button>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">Hình ảnh ban đầu (không bắt buộc)</legend>
          {imagesArray.fields.map((field, index) => (
            <div key={field.id} className="flex items-end gap-2">
              <div className="grow space-y-1.5">
                <Label htmlFor={`image-url-${index}`}>URL hình ảnh</Label>
                <Input id={`image-url-${index}`} {...form.register(`images.${index}.url`)} />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Xóa hình ảnh này"
                onClick={() => imagesArray.remove(index)}
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
            onClick={() => imagesArray.append({ url: '' })}
          >
            <Plus className="size-4" />
            Thêm hình ảnh
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
        onConfirm={() => router.push('/products')}
      />
    </>
  );
}
