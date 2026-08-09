'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getWarehouseControllerSearchQueryKey,
  useWarehouseControllerCreate,
} from '@/generated/warehouse/warehouse';
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
import { createWarehouseSchema, type CreateWarehouseFormValues } from '../schema';
import { useBranchOptions } from '../../inventory/use-inventory-relations';

const TYPE_OPTIONS: { value: NonNullable<CreateWarehouseFormValues['type']>; label: string }[] = [
  { value: 'MAIN', label: 'Kho chính' },
  { value: 'RETAIL', label: 'Kho bán lẻ' },
  { value: 'ONLINE', label: 'Kho online' },
  { value: 'RETURN', label: 'Kho hàng trả' },
  { value: 'DAMAGED', label: 'Kho hàng hỏng' },
  { value: 'TRANSIT', label: 'Kho trung chuyển' },
  { value: 'CUSTOM', label: 'Khác' },
];

const STATUS_OPTIONS: { value: NonNullable<CreateWarehouseFormValues['status']>; label: string }[] =
  [
    { value: 'ACTIVE', label: 'Đang hoạt động' },
    { value: 'INACTIVE', label: 'Ngừng hoạt động' },
  ];

/** T044 Phase K — Warehouse Create. */
export function WarehouseCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const { branchOptions } = useBranchOptions();

  const form = useCrudForm({
    schema: createWarehouseSchema,
    defaultValues: { branchId: '', code: '', name: '', type: 'MAIN', status: 'ACTIVE' },
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

  const createMutation = useWarehouseControllerCreate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getWarehouseControllerSearchQueryKey() });
        toast.success('Đã tạo kho');
        router.push('/warehouses');
      },
      onError: (error) => {
        if (error.kind === 'api-error') {
          if (error.code === 'WAREHOUSE_002') {
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

  const onSubmit = (values: CreateWarehouseFormValues) => {
    createMutation.mutate({
      data: {
        branchId: values.branchId,
        code: values.code,
        name: values.name,
        type: values.type,
        address: values.address || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        description: values.description || undefined,
        status: values.status,
      },
    });
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/warehouses');
  };

  return (
    <>
      <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Tạo kho">
        <div className="space-y-1.5">
          <Label htmlFor="code">Mã kho</Label>
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
          <Label htmlFor="name">Tên kho</Label>
          <Input
            id="name"
            aria-invalid={Boolean(form.formState.errors.name)}
            {...form.register('name')}
          />
          {form.formState.errors.name && (
            <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Label htmlFor="type">Loại kho</Label>
            <Select
              items={TYPE_OPTIONS}
              value={form.watch('type') ?? 'MAIN'}
              onValueChange={(value) =>
                form.setValue('type', value as CreateWarehouseFormValues['type'], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger id="type" className="w-full" aria-label="Loại kho">
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
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">Địa chỉ</Label>
          <Input id="address" {...form.register('address')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Điện thoại</Label>
            <Input
              id="phone"
              aria-invalid={Boolean(form.formState.errors.phone)}
              {...form.register('phone')}
            />
            {form.formState.errors.phone && (
              <p className="text-destructive text-sm">{form.formState.errors.phone.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register('email')}
            />
            {form.formState.errors.email && (
              <p className="text-destructive text-sm">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Trạng thái</Label>
            <Select
              items={STATUS_OPTIONS}
              value={form.watch('status') ?? 'ACTIVE'}
              onValueChange={(value) =>
                form.setValue('status', value as CreateWarehouseFormValues['status'], {
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

        <div className="space-y-1.5">
          <Label htmlFor="description">Mô tả</Label>
          <Input id="description" {...form.register('description')} />
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
        onConfirm={() => router.push('/warehouses')}
      />
    </>
  );
}
