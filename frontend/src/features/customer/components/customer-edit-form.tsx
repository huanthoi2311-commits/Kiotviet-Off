'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import {
  getCustomerControllerFindOneQueryKey,
  getCustomerControllerSearchQueryKey,
  useCustomerControllerFindOne,
  useCustomerControllerUpdate,
} from '@/generated/customer/customer';
import type { CustomerResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { CrudForm } from '@/components/common/crud-form';
import { EmptyState } from '@/components/common/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PermissionButton } from '@/components/common/permission-button';
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
import { editCustomerSchema, type EditCustomerFormValues } from '../edit-schema';
import { CustomerActionDialog, type CustomerActionDialogMode } from './customer-action-dialog';
import { CustomerPointSection } from './customer-point-section';

const CUSTOMER_TYPE_OPTIONS: {
  value: NonNullable<EditCustomerFormValues['customerType']>;
  label: string;
}[] = [
  { value: 'RETAIL', label: 'Khách lẻ' },
  { value: 'WHOLESALE', label: 'Khách sỉ' },
  { value: 'VIP', label: 'VIP' },
  { value: 'DEALER', label: 'Đại lý' },
  { value: 'COMPANY', label: 'Công ty' },
];

const GENDER_OPTIONS: { value: NonNullable<EditCustomerFormValues['gender']>; label: string }[] = [
  { value: 'MALE', label: 'Nam' },
  { value: 'FEMALE', label: 'Nữ' },
  { value: 'OTHER', label: 'Khác' },
];

const NO_GENDER_VALUE = '__none__';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Ngừng hoạt động',
  ARCHIVED: 'Đã lưu trữ',
};

/** Orval generates nullable string/number fields on `CustomerResponseDto` as
 * `{ [key: string]: unknown } | null` (a known codegen quirk, same as
 * `invoice-detail.tsx`/`purchase-order-detail.tsx`'s own local helpers). */
function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function toFormValues(customer: CustomerResponseDto): EditCustomerFormValues {
  const birthday = asNullableString(customer.birthday);
  const creditLimit = asNullableNumber(customer.creditLimit);
  return {
    version: customer.version,
    customerType: customer.customerType as EditCustomerFormValues['customerType'],
    fullName: customer.fullName,
    phone: asNullableString(customer.phone) ?? undefined,
    email: asNullableString(customer.email) ?? undefined,
    birthday: birthday ? birthday.slice(0, 10) : undefined,
    gender: (asNullableString(customer.gender) as EditCustomerFormValues['gender']) ?? undefined,
    taxCode: asNullableString(customer.taxCode) ?? undefined,
    companyName: asNullableString(customer.companyName) ?? undefined,
    contactName: asNullableString(customer.contactName) ?? undefined,
    address: asNullableString(customer.address) ?? undefined,
    province: asNullableString(customer.province) ?? undefined,
    district: asNullableString(customer.district) ?? undefined,
    ward: asNullableString(customer.ward) ?? undefined,
    note: asNullableString(customer.note) ?? undefined,
    creditLimit: creditLimit ?? undefined,
    paymentTermDays: asNullableNumber(customer.paymentTermDays) ?? undefined,
  };
}

/**
 * T048 Phase R — combined Detail/Edit (T048 spec §1, master-data precedent:
 * `category-edit-form.tsx`). Lifecycle (Activate/Deactivate/Archive/Restore)
 * is status-conditional and version-locked (§7); Customer Point is
 * read-only per Architect Decision AD-1 (§8).
 */
export function CustomerEditForm({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canUpdate = usePermission('customer:update');

  const {
    data: customer,
    isLoading,
    isError,
    error,
    refetch,
  } = useCustomerControllerFindOne<CustomerResponseDto, NormalizedError>(id);

  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [actionMode, setActionMode] = useState<CustomerActionDialogMode | null>(null);

  const formValues = useMemo(() => (customer ? toFormValues(customer) : undefined), [customer]);

  const form = useCrudForm({
    schema: editCustomerSchema,
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

  const updateMutation = useCustomerControllerUpdate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getCustomerControllerSearchQueryKey() });
        queryClient.invalidateQueries({ queryKey: getCustomerControllerFindOneQueryKey(id) });
        form.reset(toFormValues(response));
        toast.success('Đã cập nhật khách hàng');
      },
      onError: (err) => {
        if (err.kind === 'api-error') {
          if (err.code === 'CUSTOMER_005') {
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

  const onSubmit = (values: EditCustomerFormValues) => {
    setConflictMessage(null);
    updateMutation.mutate({
      id,
      data: {
        version: values.version,
        customerType: values.customerType,
        fullName: values.fullName,
        phone: values.phone || undefined,
        email: values.email || undefined,
        birthday: values.birthday || undefined,
        gender: values.gender,
        taxCode: values.taxCode || undefined,
        companyName: values.companyName || undefined,
        contactName: values.contactName || undefined,
        address: values.address || undefined,
        province: values.province || undefined,
        district: values.district || undefined,
        ward: values.ward || undefined,
        note: values.note || undefined,
        creditLimit: values.creditLimit,
        paymentTermDays: values.paymentTermDays,
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
    router.push('/customers');
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

  if (isError && error.kind === 'api-error' && error.code === 'CUSTOMER_001') {
    return (
      <EmptyState
        icon={Users}
        title="Không tìm thấy khách hàng"
        description="Khách hàng này có thể đã bị lưu trữ hoặc không tồn tại."
        action={<Button render={<Link href="/customers">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !customer) {
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
          <span className="font-medium">{STATUS_LABELS[customer.status] ?? customer.status}</span>
        </div>
        <div className="flex items-center gap-2">
          {customer.status === 'INACTIVE' && (
            <PermissionButton
              permission="customer:activate"
              variant="outline"
              size="sm"
              onClick={() => setActionMode('activate')}
            >
              Kích hoạt
            </PermissionButton>
          )}
          {customer.status === 'ACTIVE' && (
            <PermissionButton
              permission="customer:deactivate"
              variant="outline"
              size="sm"
              onClick={() => setActionMode('deactivate')}
            >
              Ngừng hoạt động
            </PermissionButton>
          )}
          {(customer.status === 'ACTIVE' || customer.status === 'INACTIVE') && (
            <PermissionButton
              permission="customer:delete"
              variant="outline"
              size="sm"
              onClick={() => setActionMode('archive')}
            >
              Lưu trữ
            </PermissionButton>
          )}
          {customer.status === 'ARCHIVED' && (
            <PermissionButton
              permission="customer:restore"
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
            <Label htmlFor="code">Mã khách hàng</Label>
            <Input id="code" value={customer.code} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Tên khách hàng</Label>
            <Input id="fullName" value={customer.fullName} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customerType">Loại khách hàng</Label>
            <Input id="customerType" value={customer.customerType} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Điện thoại</Label>
            <Input id="phone" value={asNullableString(customer.phone) ?? ''} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={asNullableString(customer.email) ?? ''} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Ghi chú</Label>
            <Input id="note" value={asNullableString(customer.note) ?? ''} disabled readOnly />
          </div>
        </div>
      ) : (
        <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Lưu">
          <div className="space-y-1.5">
            <Label htmlFor="code">Mã khách hàng</Label>
            <Input id="code" value={customer.code} disabled readOnly />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fullName">Tên khách hàng</Label>
            <Input
              id="fullName"
              aria-invalid={Boolean(form.formState.errors.fullName)}
              {...form.register('fullName')}
            />
            {form.formState.errors.fullName && (
              <p className="text-destructive text-sm">{form.formState.errors.fullName.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customerType">Loại khách hàng</Label>
            <Select
              items={CUSTOMER_TYPE_OPTIONS}
              value={form.watch('customerType')}
              onValueChange={(value) =>
                form.setValue('customerType', value as EditCustomerFormValues['customerType'], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger id="customerType" className="w-full" aria-label="Loại khách hàng">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            <Label htmlFor="birthday">Ngày sinh</Label>
            <Input id="birthday" type="date" {...form.register('birthday')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gender">Giới tính</Label>
            <Select
              items={GENDER_OPTIONS}
              value={form.watch('gender') ?? NO_GENDER_VALUE}
              onValueChange={(value) =>
                form.setValue(
                  'gender',
                  !value || value === NO_GENDER_VALUE
                    ? undefined
                    : (value as EditCustomerFormValues['gender']),
                  { shouldDirty: true },
                )
              }
            >
              <SelectTrigger id="gender" className="w-full" aria-label="Giới tính">
                <SelectValue placeholder="— Không chọn —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GENDER_VALUE}>— Không chọn —</SelectItem>
                {GENDER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="taxCode">Mã số thuế</Label>
            <Input id="taxCode" {...form.register('taxCode')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="companyName">Tên công ty</Label>
            <Input id="companyName" {...form.register('companyName')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contactName">Người liên hệ</Label>
            <Input id="contactName" {...form.register('contactName')} />
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
            <Label htmlFor="note">Ghi chú</Label>
            <Input id="note" {...form.register('note')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="creditLimit">Hạn mức công nợ</Label>
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
            <Label htmlFor="paymentTermDays">Hạn thanh toán (ngày)</Label>
            <Input
              id="paymentTermDays"
              type="number"
              aria-invalid={Boolean(form.formState.errors.paymentTermDays)}
              {...form.register('paymentTermDays')}
            />
            {form.formState.errors.paymentTermDays && (
              <p className="text-destructive text-sm">
                {form.formState.errors.paymentTermDays.message}
              </p>
            )}
          </div>
        </CrudForm>
      )}

      <div className="flex flex-col gap-2 border-t pt-4">
        <h2 className="text-sm font-semibold">Hóa đơn</h2>
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          render={
            <Link href={`/invoices?customerId=${customer.id}`}>Xem hóa đơn của khách hàng này</Link>
          }
        />
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <h2 className="text-sm font-semibold">Điểm tích lũy</h2>
        <CustomerPointSection customerId={customer.id} totalPoint={customer.totalPoint} />
      </div>

      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="Hủy các thay đổi chưa lưu?"
        description="Các thay đổi bạn đã nhập sẽ không được lưu."
        confirmLabel="Hủy thay đổi"
        cancelLabel="Tiếp tục chỉnh sửa"
        danger
        onConfirm={() => router.push('/customers')}
      />

      {actionMode && (
        <CustomerActionDialog
          open
          onOpenChange={(open) => {
            if (!open) setActionMode(null);
          }}
          customerId={customer.id}
          customerName={customer.fullName}
          version={customer.version}
          mode={actionMode}
          onVersionConflict={handleVersionConflict}
        />
      )}
    </div>
  );
}
