'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getBrandControllerSearchQueryKey,
  useBrandControllerCreate,
} from '@/generated/brand/brand';
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
import { createBrandSchema, type CreateBrandFormValues } from '../schema';

const STATUS_OPTIONS: { value: CreateBrandFormValues['status']; label: string }[] = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Ngừng hoạt động' },
];

/** T041 Phase D — Brand Create. No parentId/sortOrder/isActive: Brand has none of these (unlike Category). */
export function BrandCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const form = useCrudForm({
    schema: createBrandSchema,
    defaultValues: {
      code: '',
      name: '',
      logo: '',
      description: '',
      website: '',
      country: '',
      status: 'ACTIVE',
    },
  });
  // RHF's formState is a Proxy that only re-renders a subscriber once it has
  // *read* a given key during render — CrudForm reads `errors.root`
  // internally, but as a child receiving `form` by prop, that alone doesn't
  // register this component's own subscription (T036.10 finding, Category).
  void form.formState.errors.root;

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form.formState.isDirty]);

  const createMutation = useBrandControllerCreate<NormalizedError>({
    mutation: {
      // T038.08B pattern (Category) — every branch below already renders
      // the error in-context; without this flag the global mutation-error
      // toast would duplicate the same message.
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getBrandControllerSearchQueryKey() });
        toast.success('Đã tạo thương hiệu');
        router.push('/brands');
      },
      onError: (error) => {
        if (error.kind === 'api-error') {
          if (error.code === 'BRAND_002') {
            form.setError('code', { type: 'server', message: error.message });
            return;
          }
          form.setServerError(error);
          return;
        }
        form.setError('root', { type: 'server', message: error.message });
      },
    },
  });

  const onSubmit = (values: CreateBrandFormValues) => {
    createMutation.mutate({
      data: {
        code: values.code,
        name: values.name,
        logo: values.logo || undefined,
        description: values.description || undefined,
        website: values.website || undefined,
        country: values.country || undefined,
        status: values.status,
      },
    });
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/brands');
  };

  return (
    <>
      <CrudForm
        form={form}
        onSubmit={onSubmit}
        onCancel={handleCancel}
        submitLabel="Tạo thương hiệu"
      >
        <div className="space-y-1.5">
          <Label htmlFor="code">Mã thương hiệu</Label>
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
          <Label htmlFor="name">Tên thương hiệu</Label>
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
          <Label htmlFor="logo">Logo (URL)</Label>
          <Input id="logo" {...form.register('logo')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Mô tả</Label>
          <Input id="description" {...form.register('description')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            aria-invalid={Boolean(form.formState.errors.website)}
            {...form.register('website')}
          />
          {form.formState.errors.website && (
            <p className="text-destructive text-sm">{form.formState.errors.website.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="country">Quốc gia</Label>
          <Input id="country" {...form.register('country')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Trạng thái</Label>
          <Select
            items={STATUS_OPTIONS}
            value={form.watch('status')}
            onValueChange={(value) =>
              form.setValue('status', value as CreateBrandFormValues['status'])
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
      </CrudForm>
      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="Hủy các thay đổi chưa lưu?"
        description="Các thay đổi bạn đã nhập sẽ không được lưu."
        confirmLabel="Hủy thay đổi"
        cancelLabel="Tiếp tục chỉnh sửa"
        danger
        onConfirm={() => router.push('/brands')}
      />
    </>
  );
}
