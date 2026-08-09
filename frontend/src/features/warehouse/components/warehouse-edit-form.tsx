'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Warehouse as WarehouseIcon } from 'lucide-react';
import {
  getWarehouseControllerFindOneQueryKey,
  getWarehouseControllerSearchQueryKey,
  useWarehouseControllerFindOne,
  useWarehouseControllerUpdate,
} from '@/generated/warehouse/warehouse';
import type { WarehouseResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
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
import { editWarehouseSchema, type EditWarehouseFormValues } from '../edit-schema';
import { useBranchOptions } from '../../inventory/use-inventory-relations';

const TYPE_OPTIONS: { value: NonNullable<EditWarehouseFormValues['type']>; label: string }[] = [
  { value: 'MAIN', label: 'Kho chính' },
  { value: 'RETAIL', label: 'Kho bán lẻ' },
  { value: 'ONLINE', label: 'Kho online' },
  { value: 'RETURN', label: 'Kho hàng trả' },
  { value: 'DAMAGED', label: 'Kho hàng hỏng' },
  { value: 'TRANSIT', label: 'Kho trung chuyển' },
  { value: 'CUSTOM', label: 'Khác' },
];

const STATUS_OPTIONS: { value: NonNullable<EditWarehouseFormValues['status']>; label: string }[] = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Ngừng hoạt động' },
];

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toFormValues(warehouse: WarehouseResponseDto): EditWarehouseFormValues {
  return {
    branchId: warehouse.branchId,
    code: warehouse.code,
    name: warehouse.name,
    type: warehouse.type as EditWarehouseFormValues['type'],
    address: asNullableString(warehouse.address) ?? '',
    phone: asNullableString(warehouse.phone) ?? '',
    email: asNullableString(warehouse.email) ?? '',
    description: asNullableString(warehouse.description) ?? '',
    status: warehouse.status as EditWarehouseFormValues['status'],
  };
}

/** T044 Phase K — Warehouse Edit. No Optimistic Lock (Warehouse has no `version` field). */
export function WarehouseEditForm({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canUpdate = usePermission('warehouse:update');
  const { branchOptions } = useBranchOptions();

  const {
    data: warehouse,
    isLoading,
    isError,
    error,
    refetch,
  } = useWarehouseControllerFindOne<WarehouseResponseDto, NormalizedError>(id);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const formValues = useMemo(() => (warehouse ? toFormValues(warehouse) : undefined), [warehouse]);

  const form = useCrudForm({
    schema: editWarehouseSchema,
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

  const updateMutation = useWarehouseControllerUpdate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getWarehouseControllerSearchQueryKey() });
        queryClient.invalidateQueries({ queryKey: getWarehouseControllerFindOneQueryKey(id) });
        form.reset(toFormValues(response));
        toast.success('Đã cập nhật kho');
      },
      onError: (err) => {
        if (err.kind === 'api-error') {
          if (err.code === 'WAREHOUSE_002') {
            form.setError('code', { type: 'server', message: err.message });
            return;
          }
          form.setServerError(err);
          return;
        }
        form.setError('root', { type: 'server', message: err.message });
      },
    },
  });

  const onSubmit = (values: EditWarehouseFormValues) => {
    updateMutation.mutate({
      id,
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

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isError && error.kind === 'api-error' && error.code === 'WAREHOUSE_001') {
    return (
      <EmptyState
        icon={WarehouseIcon}
        title="Không tìm thấy kho"
        description="Kho này có thể đã bị xóa hoặc không tồn tại."
        action={<Button render={<Link href="/warehouses">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !warehouse) {
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
          <Label htmlFor="name">Tên kho</Label>
          <Input id="name" value={warehouse.name} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="code">Mã kho</Label>
          <Input id="code" value={warehouse.code} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Trạng thái</Label>
          <Input id="status" value={warehouse.status} disabled readOnly />
        </div>
      </div>
    );
  }

  return (
    <>
      <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Lưu">
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
              <SelectTrigger id="branchId" className="w-full" aria-label="Chi nhánh">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branchOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="type">Loại kho</Label>
            <Select
              items={TYPE_OPTIONS}
              value={form.watch('type') ?? 'MAIN'}
              onValueChange={(value) =>
                form.setValue('type', value as EditWarehouseFormValues['type'], {
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
                form.setValue('status', value as EditWarehouseFormValues['status'], {
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
