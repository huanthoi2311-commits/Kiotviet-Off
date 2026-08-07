'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getCategoryControllerListQueryKey,
  useCategoryControllerCreate,
  useCategoryControllerList,
} from '@/generated/category/category';
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
import { createCategorySchema, type CreateCategoryFormValues } from '../schema';

const STATUS_OPTIONS: { value: CreateCategoryFormValues['status']; label: string }[] = [
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Ngừng hoạt động' },
];

const NO_PARENT_VALUE = '__none__';

/**
 * T036.10 — Create only. `parentId` options come from `GET /categories`
 * with no status filter: the endpoint's own `deletedAt: null` guard
 * already excludes every archived category (SPEC-T036 §6), so no
 * client-side status filtering is needed here.
 */
export function CategoryCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { data: parentOptions } = useCategoryControllerList({ limit: 100 });
  const parentItems = [
    { value: NO_PARENT_VALUE, label: '— Không có danh mục cha —' },
    ...(parentOptions?.items ?? []).map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  const form = useCrudForm({
    schema: createCategorySchema,
    defaultValues: {
      code: '',
      name: '',
      description: '',
      imageUrl: '',
      parentId: undefined,
      status: 'ACTIVE',
      isActive: true,
      sortOrder: undefined,
    },
  });
  // RHF's formState is a Proxy that only re-renders a subscriber once it has
  // *read* a given key during render (same gotcha documented in
  // use-crud-form.test.ts). CrudForm reads `errors.root` internally, but as
  // a child receiving `form` by prop, that read alone doesn't register this
  // component's own subscription — without reading it here too, a root
  // error set via setServerError/setError('root', ...) would silently never
  // reach CrudForm's Alert.
  void form.formState.errors.root;

  // Unsaved-changes guard (SPEC-T037 §20 AD-4, retroactive fix for T036.10 —
  // Create originally shipped without this despite T033.02 §4 calling for
  // it). beforeunload only — internal navigation blocking is out of scope,
  // matching category-edit-form.tsx's own documented reasoning.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form.formState.isDirty]);

  const createMutation = useCategoryControllerCreate<NormalizedError>({
    mutation: {
      onSuccess: () => {
        // SPEC-T037 §11/§20 AD-6 — retroactive fix: T036.10 never invalidated
        // the list cache, so a user landing back on /categories within the
        // 30s staleTime saw the pre-creation list. Orval-generated factory,
        // no custom query key.
        queryClient.invalidateQueries({ queryKey: getCategoryControllerListQueryKey() });
        toast.success('Đã tạo danh mục');
        router.push('/categories');
      },
      onError: (error) => {
        if (error.kind === 'api-error') {
          if (error.code === 'CATEGORY_002') {
            form.setError('code', { type: 'server', message: error.message });
            return;
          }
          if (error.code === 'CATEGORY_006') {
            form.setError('parentId', { type: 'server', message: error.message });
            return;
          }
          form.setServerError(error);
          return;
        }
        form.setError('root', { type: 'server', message: error.message });
      },
    },
  });

  const onSubmit = (values: CreateCategoryFormValues) => {
    createMutation.mutate({
      data: {
        code: values.code,
        name: values.name,
        description: values.description || undefined,
        imageUrl: values.imageUrl || undefined,
        parentId: values.parentId || undefined,
        status: values.status,
        isActive: values.isActive,
        sortOrder: values.sortOrder,
      },
    });
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/categories');
  };

  return (
    <>
      <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Tạo danh mục">
        <div className="space-y-1.5">
          <Label htmlFor="code">Mã danh mục</Label>
          <Input
            id="code"
            aria-invalid={Boolean(form.formState.errors.code)}
            {...form.register('code')}
          />
          {form.formState.errors.code && (
            <p className="text-destructive text-sm">{form.formState.errors.code.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Tên danh mục</Label>
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
          <Label htmlFor="parentId">Danh mục cha</Label>
          <Select
            items={parentItems}
            value={form.watch('parentId') ?? NO_PARENT_VALUE}
            onValueChange={(value) =>
              form.setValue('parentId', !value || value === NO_PARENT_VALUE ? undefined : value)
            }
          >
            <SelectTrigger id="parentId" className="w-full" aria-label="Danh mục cha">
              <SelectValue placeholder="— Không có danh mục cha —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PARENT_VALUE}>— Không có danh mục cha —</SelectItem>
              {(parentOptions?.items ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.parentId && (
            <p className="text-destructive text-sm">{form.formState.errors.parentId.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Mô tả</Label>
          <Input id="description" {...form.register('description')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="imageUrl">Ảnh (URL)</Label>
          <Input id="imageUrl" {...form.register('imageUrl')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sortOrder">Thứ tự</Label>
          <Input
            id="sortOrder"
            type="number"
            aria-invalid={Boolean(form.formState.errors.sortOrder)}
            {...form.register('sortOrder')}
          />
          {form.formState.errors.sortOrder && (
            <p className="text-destructive text-sm">{form.formState.errors.sortOrder.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Trạng thái</Label>
          <Select
            items={STATUS_OPTIONS}
            value={form.watch('status')}
            onValueChange={(value) =>
              form.setValue('status', value as CreateCategoryFormValues['status'])
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

        <div className="flex items-center gap-2">
          <input id="isActive" type="checkbox" className="size-4" {...form.register('isActive')} />
          <Label htmlFor="isActive">Đang hoạt động</Label>
        </div>
      </CrudForm>
      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="Hủy các thay đổi chưa lưu?"
        description="Các thay đổi bạn đã nhập sẽ không được lưu."
        confirmLabel="Hủy thay đổi"
        cancelLabel="Tiếp tục chỉnh sửa"
        danger
        onConfirm={() => router.push('/categories')}
      />
    </>
  );
}
