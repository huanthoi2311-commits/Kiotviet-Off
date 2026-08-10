'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Truck } from 'lucide-react';
import {
  getSupplierControllerFindOneQueryKey,
  getSupplierControllerSearchQueryKey,
  useSupplierControllerFindOne,
  useSupplierControllerUpdate,
} from '@/generated/supplier/supplier';
import type { SupplierResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { CrudForm } from '@/components/common/crud-form';
import { EmptyState } from '@/components/common/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PermissionButton } from '@/components/common/permission-button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrudForm } from '@/hooks/use-crud-form';
import { usePermission } from '@/hooks/use-permission';
import type { NormalizedError } from '@/services/api-client';
import { editSupplierSchema, type EditSupplierFormValues } from '../edit-schema';
import { SupplierActionDialog, type SupplierActionDialogMode } from './supplier-action-dialog';
import { SupplierDebtSection } from './supplier-debt-section';
import { SupplierProductSection } from './supplier-product-section';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Ngừng hoạt động',
  ARCHIVED: 'Đã lưu trữ',
};

/** Orval generates nullable string/number fields on `SupplierResponseDto` as
 * `{ [key: string]: unknown } | null` — same codegen quirk documented in the Customer feature. */
function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function toFormValues(supplier: SupplierResponseDto): EditSupplierFormValues {
  return {
    version: supplier.version,
    taxCode: asNullableString(supplier.taxCode) ?? undefined,
    companyName: supplier.companyName,
    contactName: asNullableString(supplier.contactName) ?? undefined,
    phone: asNullableString(supplier.phone) ?? undefined,
    email: asNullableString(supplier.email) ?? undefined,
    website: asNullableString(supplier.website) ?? undefined,
    address: asNullableString(supplier.address) ?? undefined,
    province: asNullableString(supplier.province) ?? undefined,
    district: asNullableString(supplier.district) ?? undefined,
    ward: asNullableString(supplier.ward) ?? undefined,
    bankName: asNullableString(supplier.bankName) ?? undefined,
    bankAccount: asNullableString(supplier.bankAccount) ?? undefined,
    paymentTerm: asNullableNumber(supplier.paymentTerm) ?? undefined,
    creditLimit: asNullableNumber(supplier.creditLimit) ?? undefined,
    note: asNullableString(supplier.note) ?? undefined,
  };
}

/**
 * T049 Phase T — combined Detail/Edit (master-data precedent, mirrors `customer-edit-form.tsx`).
 * Lifecycle status-conditional and version-locked (§7); Debt read-only per AD-2 (§9);
 * Supplier-Product mapping embedded per §10.
 */
export function SupplierEditForm({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canUpdate = usePermission('supplier:update');

  const {
    data: supplier,
    isLoading,
    isError,
    error,
    refetch,
  } = useSupplierControllerFindOne<SupplierResponseDto, NormalizedError>(id);

  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [actionMode, setActionMode] = useState<SupplierActionDialogMode | null>(null);

  const formValues = useMemo(() => (supplier ? toFormValues(supplier) : undefined), [supplier]);

  const form = useCrudForm({
    schema: editSupplierSchema,
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

  const updateMutation = useSupplierControllerUpdate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getSupplierControllerSearchQueryKey() });
        queryClient.invalidateQueries({ queryKey: getSupplierControllerFindOneQueryKey(id) });
        form.reset(toFormValues(response));
        toast.success('Đã cập nhật nhà cung cấp');
      },
      onError: (err) => {
        if (err.kind === 'api-error') {
          if (err.code === 'SUPPLIER_009') {
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

  const onSubmit = (values: EditSupplierFormValues) => {
    setConflictMessage(null);
    updateMutation.mutate({
      id,
      data: {
        version: values.version,
        taxCode: values.taxCode || undefined,
        companyName: values.companyName,
        contactName: values.contactName || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        website: values.website || undefined,
        address: values.address || undefined,
        province: values.province || undefined,
        district: values.district || undefined,
        ward: values.ward || undefined,
        bankName: values.bankName || undefined,
        bankAccount: values.bankAccount || undefined,
        paymentTerm: values.paymentTerm,
        creditLimit: values.creditLimit,
        note: values.note || undefined,
      },
    });
  };

  const handleReload = () => {
    setConflictMessage(null);
    refetch();
  };

  const handleVersionConflict = (message: string) => {
    setConflictMessage(message);
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/suppliers');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isError && error.kind === 'api-error' && error.code === 'SUPPLIER_001') {
    return (
      <EmptyState
        icon={Truck}
        title="Không tìm thấy nhà cung cấp"
        description="Nhà cung cấp này có thể đã bị lưu trữ hoặc không tồn tại."
        action={<Button render={<Link href="/suppliers">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !supplier) {
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
    <div className="flex flex-col gap-6">
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

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Trạng thái</span>
          <span className="font-medium">{STATUS_LABELS[supplier.status] ?? supplier.status}</span>
        </div>
        <div className="flex items-center gap-2">
          {supplier.status === 'INACTIVE' && (
            <PermissionButton
              permission="supplier:activate"
              variant="outline"
              size="sm"
              onClick={() => setActionMode('activate')}
            >
              Kích hoạt
            </PermissionButton>
          )}
          {supplier.status === 'ACTIVE' && (
            <PermissionButton
              permission="supplier:deactivate"
              variant="outline"
              size="sm"
              onClick={() => setActionMode('deactivate')}
            >
              Ngừng hoạt động
            </PermissionButton>
          )}
          {(supplier.status === 'ACTIVE' || supplier.status === 'INACTIVE') && (
            <PermissionButton
              permission="supplier:delete"
              variant="outline"
              size="sm"
              onClick={() => setActionMode('archive')}
            >
              Lưu trữ
            </PermissionButton>
          )}
          {supplier.status === 'ARCHIVED' && (
            <PermissionButton
              permission="supplier:restore"
              variant="outline"
              size="sm"
              onClick={() => setActionMode('restore')}
            >
              Khôi phục
            </PermissionButton>
          )}
        </div>
      </div>

      {!canUpdate ? (
        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Mã nhà cung cấp</Label>
            <Input id="code" value={supplier.code} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="companyName">Tên công ty</Label>
            <Input id="companyName" value={supplier.companyName} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Điện thoại</Label>
            <Input id="phone" value={asNullableString(supplier.phone) ?? ''} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={asNullableString(supplier.email) ?? ''} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Ghi chú</Label>
            <Input id="note" value={asNullableString(supplier.note) ?? ''} disabled readOnly />
          </div>
        </div>
      ) : (
        <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Lưu">
          <div className="space-y-1.5">
            <Label htmlFor="code">Mã nhà cung cấp</Label>
            <Input id="code" value={supplier.code} disabled readOnly />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="companyName">Tên công ty</Label>
            <Input
              id="companyName"
              aria-invalid={Boolean(form.formState.errors.companyName)}
              {...form.register('companyName')}
            />
            {form.formState.errors.companyName && (
              <p className="text-destructive text-sm">
                {form.formState.errors.companyName.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="taxCode">Mã số thuế</Label>
            <Input id="taxCode" {...form.register('taxCode')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contactName">Người liên hệ</Label>
            <Input id="contactName" {...form.register('contactName')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Điện thoại</Label>
            <Input id="phone" {...form.register('phone')} />
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
            <Label htmlFor="address">Địa chỉ</Label>
            <Input id="address" {...form.register('address')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="province">Tỉnh/Thành phố</Label>
            <Input id="province" {...form.register('province')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="district">Quận/Huyện</Label>
            <Input id="district" {...form.register('district')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ward">Phường/Xã</Label>
            <Input id="ward" {...form.register('ward')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bankName">Ngân hàng</Label>
            <Input id="bankName" {...form.register('bankName')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bankAccount">Số tài khoản</Label>
            <Input id="bankAccount" {...form.register('bankAccount')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="paymentTerm">Công nợ (ngày)</Label>
            <Input
              id="paymentTerm"
              type="number"
              aria-invalid={Boolean(form.formState.errors.paymentTerm)}
              {...form.register('paymentTerm')}
            />
            {form.formState.errors.paymentTerm && (
              <p className="text-destructive text-sm">
                {form.formState.errors.paymentTerm.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="creditLimit">Hạn mức tín dụng</Label>
            <Input
              id="creditLimit"
              type="number"
              aria-invalid={Boolean(form.formState.errors.creditLimit)}
              {...form.register('creditLimit')}
            />
            {form.formState.errors.creditLimit && (
              <p className="text-destructive text-sm">
                {form.formState.errors.creditLimit.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Ghi chú</Label>
            <Input id="note" {...form.register('note')} />
          </div>
        </CrudForm>
      )}

      <div className="flex flex-col gap-2 border-t pt-4">
        <h2 className="text-sm font-semibold">Công nợ</h2>
        <SupplierDebtSection supplierId={supplier.id} />
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <h2 className="text-sm font-semibold">Sản phẩm cung cấp</h2>
        <SupplierProductSection supplierId={supplier.id} />
      </div>

      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="Hủy các thay đổi chưa lưu?"
        description="Các thay đổi bạn đã nhập sẽ không được lưu."
        confirmLabel="Hủy thay đổi"
        cancelLabel="Tiếp tục chỉnh sửa"
        danger
        onConfirm={() => router.push('/suppliers')}
      />

      {actionMode && (
        <SupplierActionDialog
          open
          onOpenChange={(open) => {
            if (!open) setActionMode(null);
          }}
          supplierId={supplier.id}
          supplierName={supplier.companyName}
          version={supplier.version}
          mode={actionMode}
          onVersionConflict={handleVersionConflict}
        />
      )}
    </div>
  );
}
