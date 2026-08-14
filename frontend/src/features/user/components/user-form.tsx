'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getUserControllerSearchQueryKey, useUserControllerCreate } from '@/generated/user/user';
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
import { createUserSchema, type CreateUserFormValues } from '../schema';
import { useBranchOptions } from '../../inventory/use-inventory-relations';

const NO_BRANCH_VALUE = '__none__';

/** T052.02C — admin tạo nhân viên + đặt mật khẩu ban đầu (không self-service, D — Product Decision). */
export function UserCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const { branchOptions } = useBranchOptions();

  const form = useCrudForm({
    schema: createUserSchema,
    defaultValues: {
      username: '',
      fullName: '',
      email: '',
      phone: '',
      branchId: undefined,
      password: '',
      confirmPassword: '',
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

  const createMutation = useUserControllerCreate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getUserControllerSearchQueryKey() });
        toast.success('Đã tạo nhân viên');
        router.push(`/users/${response.id}`);
      },
      onError: (error) => {
        if (error.kind === 'api-error') {
          if (error.code === 'USER_002') {
            form.setError('username', { type: 'server', message: error.message });
            return;
          }
          if (error.code === 'USER_003') {
            form.setError('email', { type: 'server', message: error.message });
            return;
          }
          if (error.code === 'BRANCH_001') {
            form.setError('branchId', { type: 'server', message: error.message });
            return;
          }
          form.setServerError(error);
          return;
        }
        form.setError('root', { type: 'server', message: error.message });
      },
    },
  });

  const onSubmit = (values: CreateUserFormValues) => {
    createMutation.mutate({
      data: {
        username: values.username,
        fullName: values.fullName || undefined,
        email: values.email,
        phone: values.phone || undefined,
        branchId: values.branchId || undefined,
        password: values.password,
      },
    });
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/users');
  };

  return (
    <>
      <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Tạo nhân viên">
        <div className="space-y-1.5">
          <Label htmlFor="username">Tên đăng nhập</Label>
          <Input
            id="username"
            aria-invalid={Boolean(form.formState.errors.username)}
            {...form.register('username')}
          />
          {form.formState.errors.username && (
            <p className="text-destructive text-sm">{form.formState.errors.username.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fullName">Họ tên</Label>
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
          <Label htmlFor="branchId">Chi nhánh</Label>
          <Select
            items={branchOptions}
            value={form.watch('branchId') ?? NO_BRANCH_VALUE}
            onValueChange={(value) =>
              form.setValue('branchId', !value || value === NO_BRANCH_VALUE ? undefined : value, {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger
              id="branchId"
              className="w-full"
              aria-label="Chi nhánh"
              aria-invalid={Boolean(form.formState.errors.branchId)}
            >
              <SelectValue placeholder="— Không chọn —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_BRANCH_VALUE}>— Không chọn —</SelectItem>
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
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            aria-invalid={Boolean(form.formState.errors.password)}
            {...form.register('password')}
          />
          {form.formState.errors.password && (
            <p className="text-destructive text-sm">{form.formState.errors.password.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
          <Input
            id="confirmPassword"
            type="password"
            aria-invalid={Boolean(form.formState.errors.confirmPassword)}
            {...form.register('confirmPassword')}
          />
          {form.formState.errors.confirmPassword && (
            <p className="text-destructive text-sm">
              {form.formState.errors.confirmPassword.message}
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
        onConfirm={() => router.push('/users')}
      />
    </>
  );
}
