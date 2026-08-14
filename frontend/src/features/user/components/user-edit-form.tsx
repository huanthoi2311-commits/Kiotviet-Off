'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UsersRound } from 'lucide-react';
import {
  getUserControllerFindOneQueryKey,
  getUserControllerSearchQueryKey,
  useUserControllerFindOne,
  useUserControllerUpdate,
} from '@/generated/user/user';
import type { UserDetailResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
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
import { editUserSchema, type EditUserFormValues } from '../edit-schema';
import { useBranchOptions } from '../../inventory/use-inventory-relations';
import { UserActionDialog, type UserActionDialogMode } from './user-action-dialog';
import { UserResetPasswordDialog } from './user-reset-password-dialog';

const NO_BRANCH_VALUE = '__none__';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Ngừng hoạt động',
  LOCKED: 'Đã khóa',
};

/** Orval generates nullable string fields on `UserDetailResponseDto` as
 * `{ [key: string]: unknown } | null` (same known codegen quirk as `customer-edit-form.tsx`'s
 * own local helper). */
function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toFormValues(user: UserDetailResponseDto): EditUserFormValues {
  return {
    fullName: asNullableString(user.fullName) ?? undefined,
    phone: asNullableString(user.phone) ?? undefined,
    avatar: asNullableString(user.avatar) ?? undefined,
    branchId: asNullableString(user.branchId) ?? undefined,
  };
}

/**
 * T052.02C §7/§8 — combined Detail/Edit (master-data precedent: `customer-edit-form.tsx`).
 * Editable whitelist limited to fullName/phone/avatar/branchId (D — UPDATE USER); username/email/
 * status/password are read-only here, each with its own dedicated action. Role codes (§8) are
 * READ-ONLY — no assign/remove UI (T052.03 owns that). No `version`/CAS (D6).
 */
export function UserEditForm({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canUpdate = usePermission('user:update');
  const { branchOptions } = useBranchOptions();

  const branchNameById = useMemo(
    () => new Map(branchOptions.map((option) => [option.value, option.label])),
    [branchOptions],
  );

  const {
    data: user,
    isLoading,
    isError,
    error,
    refetch,
  } = useUserControllerFindOne<UserDetailResponseDto, NormalizedError>(id);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [actionMode, setActionMode] = useState<UserActionDialogMode | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);

  const formValues = useMemo(() => (user ? toFormValues(user) : undefined), [user]);

  const form = useCrudForm({
    schema: editUserSchema,
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

  const updateMutation = useUserControllerUpdate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getUserControllerSearchQueryKey() });
        queryClient.invalidateQueries({ queryKey: getUserControllerFindOneQueryKey(id) });
        form.reset(toFormValues({ ...user, ...response } as UserDetailResponseDto));
        toast.success('Đã cập nhật nhân viên');
      },
      onError: (err) => {
        if (err.kind === 'api-error') {
          if (err.code === 'BRANCH_001') {
            form.setError('branchId', { type: 'server', message: err.message });
            return;
          }
          form.setServerError(err);
          return;
        }
        form.setError('root', { type: 'server', message: err.message });
      },
    },
  });

  const onSubmit = (values: EditUserFormValues) => {
    updateMutation.mutate({
      id,
      data: {
        fullName: values.fullName || undefined,
        phone: values.phone || undefined,
        avatar: values.avatar || undefined,
        branchId: values.branchId || undefined,
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

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isError && error.kind === 'api-error' && error.code === 'USER_001') {
    return (
      <EmptyState
        icon={UsersRound}
        title="Không tìm thấy nhân viên"
        description="Nhân viên này có thể đã bị xóa hoặc không tồn tại."
        action={<Button render={<Link href="/users">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !user) {
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

  const branchId = asNullableString(user.branchId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Trạng thái</span>
          <span className="font-medium">{STATUS_LABELS[user.status] ?? user.status}</span>
        </div>
        <div className="flex items-center gap-2">
          {user.status === 'INACTIVE' && (
            <PermissionButton
              permission="user:activate"
              variant="outline"
              size="sm"
              onClick={() => setActionMode('reactivate')}
            >
              Kích hoạt lại
            </PermissionButton>
          )}
          {user.status === 'ACTIVE' && (
            <PermissionButton
              permission="user:deactivate"
              variant="outline"
              size="sm"
              onClick={() => setActionMode('deactivate')}
            >
              Vô hiệu hóa
            </PermissionButton>
          )}
          <PermissionButton
            permission="user:update"
            variant="outline"
            size="sm"
            onClick={() => setShowResetPassword(true)}
          >
            Đặt lại mật khẩu
          </PermissionButton>
        </div>
      </div>

      {!canUpdate ? (
        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Tên đăng nhập</Label>
            <Input id="username" value={user.username} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user.email} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Họ tên</Label>
            <Input id="fullName" value={asNullableString(user.fullName) ?? ''} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Điện thoại</Label>
            <Input id="phone" value={asNullableString(user.phone) ?? ''} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branch">Chi nhánh</Label>
            <Input
              id="branch"
              value={branchId ? (branchNameById.get(branchId) ?? branchId) : ''}
              disabled
              readOnly
            />
          </div>
        </div>
      ) : (
        <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Lưu">
          <div className="space-y-1.5">
            <Label htmlFor="username">Tên đăng nhập</Label>
            <Input id="username" value={user.username} disabled readOnly />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user.email} disabled readOnly />
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
        </CrudForm>
      )}

      <div className="flex flex-col gap-2 border-t pt-4">
        <h2 className="text-sm font-semibold">Vai trò</h2>
        {user.roleCodes.length === 0 ? (
          <p className="text-muted-foreground text-sm">Chưa có vai trò nào được gán.</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Danh sách vai trò hiện tại">
            {user.roleCodes.map((code) => (
              <li
                key={code}
                className="bg-muted rounded-md px-2 py-1 text-sm"
                aria-label={`Vai trò: ${code}`}
              >
                {code}
              </li>
            ))}
          </ul>
        )}
      </div>

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

      {actionMode && (
        <UserActionDialog
          open
          onOpenChange={(open) => {
            if (!open) setActionMode(null);
          }}
          userId={user.id}
          userName={
            user.fullName && typeof user.fullName === 'string' ? user.fullName : user.username
          }
          mode={actionMode}
        />
      )}

      <UserResetPasswordDialog
        open={showResetPassword}
        onOpenChange={setShowResetPassword}
        userId={user.id}
        userName={
          user.fullName && typeof user.fullName === 'string' ? user.fullName : user.username
        }
      />
    </div>
  );
}
