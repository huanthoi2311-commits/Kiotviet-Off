'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getSupplierControllerSearchQueryKey,
  useSupplierControllerCreate,
} from '@/generated/supplier/supplier';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { CrudForm } from '@/components/common/crud-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCrudForm } from '@/hooks/use-crud-form';
import type { NormalizedError } from '@/services/api-client';
import { createSupplierSchema, type CreateSupplierFormValues } from '../schema';

/** T049 Phase S — Create only. `code` optional (auto-generated NCCxxxxxx if omitted). */
export function SupplierCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const form = useCrudForm({
    schema: createSupplierSchema,
    defaultValues: {
      code: '',
      taxCode: '',
      companyName: '',
      contactName: '',
      phone: '',
      email: '',
      website: '',
      address: '',
      province: '',
      district: '',
      ward: '',
      bankName: '',
      bankAccount: '',
      paymentTerm: undefined,
      creditLimit: undefined,
      note: '',
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

  const createMutation = useSupplierControllerCreate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getSupplierControllerSearchQueryKey() });
        toast.success('Đã tạo nhà cung cấp');
        router.push(`/suppliers/${response.id}`);
      },
      onError: (error) => {
        if (error.kind === 'api-error') {
          if (error.code === 'SUPPLIER_002') {
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

  const onSubmit = (values: CreateSupplierFormValues) => {
    createMutation.mutate({
      data: {
        code: values.code || undefined,
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

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/suppliers');
  };

  return (
    <>
      <CrudForm
        form={form}
        onSubmit={onSubmit}
        onCancel={handleCancel}
        submitLabel="Tạo nhà cung cấp"
      >
        <div className="space-y-1.5">
          <Label htmlFor="code">Mã nhà cung cấp</Label>
          <Input
            id="code"
            placeholder="Để trống để tự sinh (NCC000001...)"
            aria-invalid={Boolean(form.formState.errors.code)}
            {...form.register('code')}
          />
          {form.formState.errors.code && (
            <p className="text-destructive text-sm">{form.formState.errors.code.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="companyName">Tên công ty</Label>
          <Input
            id="companyName"
            aria-invalid={Boolean(form.formState.errors.companyName)}
            {...form.register('companyName')}
          />
          {form.formState.errors.companyName && (
            <p className="text-destructive text-sm">{form.formState.errors.companyName.message}</p>
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
            <p className="text-destructive text-sm">{form.formState.errors.paymentTerm.message}</p>
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
            <p className="text-destructive text-sm">{form.formState.errors.creditLimit.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note">Ghi chú</Label>
          <Input id="note" {...form.register('note')} />
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
        onConfirm={() => router.push('/suppliers')}
      />
    </>
  );
}
