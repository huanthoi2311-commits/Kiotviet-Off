'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getCustomerControllerSearchQueryKey,
  useCustomerControllerCreate,
} from '@/generated/customer/customer';
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
import { createCustomerSchema, type CreateCustomerFormValues } from '../schema';

const CUSTOMER_TYPE_OPTIONS: {
  value: NonNullable<CreateCustomerFormValues['customerType']>;
  label: string;
}[] = [
  { value: 'RETAIL', label: 'Khách lẻ' },
  { value: 'WHOLESALE', label: 'Khách sỉ' },
  { value: 'VIP', label: 'VIP' },
  { value: 'DEALER', label: 'Đại lý' },
  { value: 'COMPANY', label: 'Công ty' },
];

const GENDER_OPTIONS: { value: NonNullable<CreateCustomerFormValues['gender']>; label: string }[] =
  [
    { value: 'MALE', label: 'Nam' },
    { value: 'FEMALE', label: 'Nữ' },
    { value: 'OTHER', label: 'Khác' },
  ];

const NO_GENDER_VALUE = '__none__';

/** T048 Phase Q — Create only. `code` optional (auto-generated CUSxxxxxx if omitted). */
export function CustomerCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const form = useCrudForm({
    schema: createCustomerSchema,
    defaultValues: {
      code: '',
      customerType: 'RETAIL',
      fullName: '',
      phone: '',
      email: '',
      birthday: '',
      gender: undefined,
      taxCode: '',
      companyName: '',
      contactName: '',
      address: '',
      province: '',
      district: '',
      ward: '',
      note: '',
      creditLimit: undefined,
      paymentTermDays: undefined,
    },
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

  const createMutation = useCustomerControllerCreate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getCustomerControllerSearchQueryKey() });
        toast.success('Đã tạo khách hàng');
        router.push(`/customers/${response.id}`);
      },
      onError: (error) => {
        if (error.kind === 'api-error') {
          if (error.code === 'CUSTOMER_002') {
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

  const onSubmit = (values: CreateCustomerFormValues) => {
    createMutation.mutate({
      data: {
        code: values.code || undefined,
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

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/customers');
  };

  return (
    <>
      <CrudForm
        form={form}
        onSubmit={onSubmit}
        onCancel={handleCancel}
        submitLabel="Tạo khách hàng"
      >
        <div className="space-y-1.5">
          <Label htmlFor="code">Mã khách hàng</Label>
          <Input
            id="code"
            placeholder="Để trống để tự sinh (CUS000001...)"
            aria-invalid={Boolean(form.formState.errors.code)}
            {...form.register('code')}
          />
          {form.formState.errors.code && (
            <p className="text-destructive text-sm">{form.formState.errors.code.message}</p>
          )}
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
              form.setValue('customerType', value as CreateCustomerFormValues['customerType'])
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
                  : (value as CreateCustomerFormValues['gender']),
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
            <p className="text-destructive text-sm">{form.formState.errors.creditLimit.message}</p>
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
    </>
  );
}
