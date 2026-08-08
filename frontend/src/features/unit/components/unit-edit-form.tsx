'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ruler } from 'lucide-react';
import {
  getUnitControllerFindOneQueryKey,
  getUnitControllerSearchQueryKey,
  useUnitControllerFindOne,
  useUnitControllerUpdate,
} from '@/generated/unit/unit';
import type { UnitResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
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
import { editUnitSchema, type EditUnitFormValues } from '../edit-schema';

const STATUS_OPTIONS: { value: EditUnitFormValues['status']; label: string }[] = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'INACTIVE', label: 'Ngừng hoạt động' },
];

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

function toFormValues(unit: UnitResponseDto): EditUnitFormValues {
  return {
    version: unit.version,
    code: unit.code,
    name: unit.name,
    symbol: unit.symbol,
    status: unit.status as EditUnitFormValues['status'],
  };
}

/** T042 Phase E — Unit Edit. */
export function UnitEditForm({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canUpdate = usePermission('unit:update');

  const {
    data: unit,
    isLoading,
    isError,
    error,
    refetch,
  } = useUnitControllerFindOne<UnitResponseDto, NormalizedError>(id);

  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const formValues = useMemo(() => (unit ? toFormValues(unit) : undefined), [unit]);

  const form = useCrudForm({
    schema: editUnitSchema,
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

  const updateMutation = useUnitControllerUpdate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getUnitControllerSearchQueryKey() });
        queryClient.invalidateQueries({ queryKey: getUnitControllerFindOneQueryKey(id) });
        form.reset(toFormValues(response));
        toast.success('Đã cập nhật đơn vị tính');
      },
      onError: (err) => {
        if (err.kind === 'api-error') {
          if (err.code === 'UNIT_002') {
            form.setError('code', { type: 'server', message: err.message });
            return;
          }
          if (err.code === 'UNIT_004') {
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

  const onSubmit = (values: EditUnitFormValues) => {
    setConflictMessage(null);
    updateMutation.mutate({
      id,
      data: {
        version: values.version,
        code: values.code,
        name: values.name,
        symbol: values.symbol,
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
    router.push('/units');
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

  if (isError && error.kind === 'api-error' && error.code === 'UNIT_001') {
    return (
      <EmptyState
        icon={Ruler}
        title="Không tìm thấy đơn vị tính"
        description="Đơn vị tính này có thể đã bị xóa hoặc không tồn tại."
        action={<Button render={<Link href="/units">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !unit) {
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
          <Label htmlFor="code">Mã đơn vị tính</Label>
          <Input id="code" value={unit.code} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Tên đơn vị tính</Label>
          <Input id="name" value={unit.name} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="symbol">Ký hiệu</Label>
          <Input id="symbol" value={unit.symbol} disabled readOnly />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Trạng thái</Label>
          <Input id="status" value={STATUS_LABELS[unit.status] ?? unit.status} disabled readOnly />
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
          <Label htmlFor="code">Mã đơn vị tính</Label>
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
          <Label htmlFor="name">Tên đơn vị tính</Label>
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
          <Label htmlFor="symbol">Ký hiệu</Label>
          <Input
            id="symbol"
            aria-invalid={Boolean(form.formState.errors.symbol)}
            {...form.register('symbol')}
          />
          {form.formState.errors.symbol && (
            <p className="text-destructive text-sm">{form.formState.errors.symbol.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Trạng thái</Label>
          <Select
            items={STATUS_OPTIONS}
            value={form.watch('status')}
            onValueChange={(value) =>
              form.setValue('status', value as EditUnitFormValues['status'], { shouldDirty: true })
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
        onConfirm={() => router.push('/units')}
      />
    </>
  );
}
