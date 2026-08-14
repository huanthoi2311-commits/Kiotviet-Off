'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useUserControllerResetPassword } from '@/generated/user/user';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCrudForm } from '@/hooks/use-crud-form';
import type { NormalizedError } from '@/services/api-client';
import { resetUserPasswordSchema, type ResetUserPasswordFormValues } from '../edit-schema';

export interface UserResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

/**
 * T052.02C §11 (D4) — admin đặt mật khẩu mới cho nhân viên khác. Không hiển thị mật khẩu hiện tại
 * (không tồn tại — không lấy được), không tự sinh mật khẩu, không email, không mustChangePassword.
 * Form/dialog state được xóa sạch sau khi đóng (thành công hoặc hủy) — mật khẩu không bao giờ được
 * lưu lại/log lại ở phía client.
 */
export function UserResetPasswordDialog({
  open,
  onOpenChange,
  userId,
  userName,
}: UserResetPasswordDialogProps) {
  const form = useCrudForm({
    schema: resetUserPasswordSchema,
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const resetMutation = useUserControllerResetPassword<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        toast.success('Đã đặt lại mật khẩu — các phiên đăng nhập hiện tại của nhân viên đã bị hủy');
        onOpenChange(false);
      },
      onError: (error) => {
        if (error.kind === 'api-error') {
          form.setServerError(error);
          return;
        }
        form.setError('root', { type: 'server', message: error.message });
      },
    },
  });

  // Clear form state (incl. entered password values) whenever the dialog closes, success or not.
  useEffect(() => {
    if (!open) form.reset({ newPassword: '', confirmPassword: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only depends on `open`
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (!next) resetMutation.reset();
    onOpenChange(next);
  };

  const onSubmit = (values: ResetUserPasswordFormValues) => {
    resetMutation.mutate({ id: userId, data: { newPassword: values.newPassword } });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đặt lại mật khẩu</DialogTitle>
          <DialogDescription>
            Đặt mật khẩu mới cho nhân viên &quot;{userName}&quot;. Nhân viên này sẽ cần đăng nhập
            lại bằng mật khẩu mới trên mọi thiết bị.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          aria-label="Đặt lại mật khẩu"
        >
          {form.formState.errors.root && (
            <Alert variant="destructive">
              <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="newPassword">Mật khẩu mới</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.newPassword)}
              {...form.register('newPassword')}
            />
            {form.formState.errors.newPassword && (
              <p className="text-destructive text-sm" role="alert">
                {form.formState.errors.newPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.confirmPassword)}
              {...form.register('confirmPassword')}
            />
            {form.formState.errors.confirmPassword && (
              <p className="text-destructive text-sm" role="alert">
                {form.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              aria-disabled={resetMutation.isPending}
              className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
              onClick={() => {
                if (resetMutation.isPending) return;
                handleOpenChange(false);
              }}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              aria-disabled={resetMutation.isPending}
              className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
              Đặt lại mật khẩu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
