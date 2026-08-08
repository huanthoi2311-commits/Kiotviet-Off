'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Tag } from 'lucide-react';
import {
  getBrandControllerFindOneQueryKey,
  getBrandControllerSearchQueryKey,
  useBrandControllerFindOne,
  useBrandControllerUpdate,
} from '@/generated/brand/brand';
import type { BrandResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
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
import { editBrandSchema, type EditBrandFormValues } from '../edit-schema';

const STATUS_OPTIONS: { value: EditBrandFormValues['status']; label: string }[] = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Ngừng hoạt động' },
];

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

function toFormValues(brand: BrandResponseDto): EditBrandFormValues {
  return {
    version: brand.version,
    code: brand.code,
    name: brand.name,
    logo: brand.logo ?? '',
    description: brand.description ?? '',
    website: brand.website ?? '',
    country: brand.country ?? '',
    status: brand.status as EditBrandFormValues['status'],
  };
}

/** T041 Phase E — Brand Edit. No parentId/isActive/Tree: none apply to Brand (unlike Category). */
export function BrandEditForm({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canUpdate = usePermission('brand:update');

  const {
    data: brand,
    isLoading,
    isError,
    error,
    refetch,
  } = useBrandControllerFindOne<BrandResponseDto, NormalizedError>(id);

  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Memoized on `brand`'s own reference (Category's category-edit-form.tsx
  // precedent) — RHF's `values` option resets the form whenever the object
  // it's given changes reference, so an unmemoized call here would discard
  // the user's in-progress edit on every keystroke's own re-render.
  const formValues = useMemo(() => (brand ? toFormValues(brand) : undefined), [brand]);

  const form = useCrudForm({
    schema: editBrandSchema,
    values: formValues,
  });
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

  const updateMutation = useBrandControllerUpdate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getBrandControllerSearchQueryKey() });
        queryClient.invalidateQueries({ queryKey: getBrandControllerFindOneQueryKey(id) });
        form.reset(toFormValues(response));
        toast.success('Đã cập nhật thương hiệu');
      },
      onError: (err) => {
        if (err.kind === 'api-error') {
          if (err.code === 'BRAND_002') {
            form.setError('code', { type: 'server', message: err.message });
            return;
          }
          if (err.code === 'BRAND_004') {
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

  const onSubmit = (values: EditBrandFormValues) => {
    setConflictMessage(null);
    updateMutation.mutate({
      id,
      data: {
        version: values.version,
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

  const handleReload = () => {
    setConflictMessage(null);
    refetch();
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/brands');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isError && error.kind === 'api-error' && error.code === 'BRAND_001') {
    return (
      <EmptyState
        icon={Tag}
        title="Không tìm thấy thương hiệu"
        description="Thương hiệu này có thể đã bị xóa hoặc không tồn tại."
        action={<Button render={<Link href="/brands">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !brand) {
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

  if (!canUpdate) {
    return (
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="code">Mã thương hiệu</Label>
          <Input id="code" value={brand.code} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Tên thương hiệu</Label>
          <Input id="name" value={brand.name} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="logo">Logo (URL)</Label>
          <Input id="logo" value={brand.logo ?? ''} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Mô tả</Label>
          <Input id="description" value={brand.description ?? ''} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="website">Website</Label>
          <Input id="website" value={brand.website ?? ''} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="country">Quốc gia</Label>
          <Input id="country" value={brand.country ?? ''} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Trạng thái</Label>
          <Input
            id="status"
            value={STATUS_LABELS[brand.status] ?? brand.status}
            disabled
            readOnly
          />
        </div>
      </div>
    );
  }

  return (
    <>
      {conflictMessage && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{conflictMessage}</span>
            <Button type="button" variant="outline" size="sm" onClick={handleReload}>
              Tải lại
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Lưu">
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
              form.setValue('status', value as EditBrandFormValues['status'], { shouldDirty: true })
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
