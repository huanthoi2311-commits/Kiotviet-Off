'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isNormalizedError } from '@/services/api-client';
import {
  requestPasswordResetOtp,
  resetPassword,
  verifyPasswordResetOtp,
  type ForgotPasswordPayload,
} from '@/services/auth-actions';

/** `error` is already a `NormalizedError` — apiClient's interceptor normalized it (FR9). */
function mutationErrorMessage(error: unknown): string {
  return isNormalizedError(error) ? error.message : 'Đã xảy ra lỗi không xác định';
}

/** Mirrors backend/src/modules/auth/application/dto/forgot-password.dto.ts. */
const requestSchema = z.object({
  organizationSlug: z
    .string()
    .min(1, 'Vui lòng nhập mã tổ chức')
    .regex(/^[a-z0-9-]+$/, 'Mã tổ chức chỉ gồm chữ thường, số và dấu gạch ngang'),
  email: z.string().email('Email không hợp lệ'),
});

/** Mirrors backend/src/modules/auth/application/dto/verify-otp.dto.ts. */
const verifySchema = z.object({
  otp: z.string().length(6, 'OTP gồm 6 chữ số'),
});

/**
 * Mirrors backend/src/modules/auth/application/dto/reset-password.dto.ts — the backend
 * does not require re-submitting the OTP here; verification state is tracked server-side.
 */
const resetSchema = z
  .object({
    newPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
    confirmPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

type RequestFormValues = z.infer<typeof requestSchema>;
type VerifyFormValues = z.infer<typeof verifySchema>;
type ResetFormValues = z.infer<typeof resetSchema>;

type Step = 'request' | 'verify' | 'reset' | 'done';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [identity, setIdentity] = useState<ForgotPasswordPayload | null>(null);

  const requestForm = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { organizationSlug: '', email: '' },
  });
  const verifyForm = useForm<VerifyFormValues>({
    resolver: zodResolver(verifySchema),
    defaultValues: { otp: '' },
  });
  const resetForm = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const requestMutation = useMutation({
    mutationFn: requestPasswordResetOtp,
    onSuccess: (_data, variables) => {
      setIdentity(variables);
      setStep('verify');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: verifyPasswordResetOtp,
    onSuccess: () => setStep('reset'),
  });

  const resetMutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => setStep('done'),
  });

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Quên mật khẩu</h1>
        <p className="text-muted-foreground text-sm">
          {step === 'request' && 'Nhập thông tin tài khoản để nhận mã OTP'}
          {step === 'verify' && 'Nhập mã OTP đã gửi tới email của bạn'}
          {step === 'reset' && 'Đặt mật khẩu mới'}
          {step === 'done' && 'Hoàn tất'}
        </p>
      </div>

      {step === 'request' && (
        <form
          className="space-y-4"
          noValidate
          onSubmit={requestForm.handleSubmit((values) => requestMutation.mutate(values))}
        >
          <div className="space-y-1.5">
            <Label htmlFor="organizationSlug">Mã tổ chức</Label>
            <Input
              id="organizationSlug"
              placeholder="kiotviet-off"
              aria-invalid={Boolean(requestForm.formState.errors.organizationSlug)}
              {...requestForm.register('organizationSlug')}
            />
            {requestForm.formState.errors.organizationSlug && (
              <p className="text-destructive text-sm">
                {requestForm.formState.errors.organizationSlug.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="owner@kiotviet-off.vn"
              aria-invalid={Boolean(requestForm.formState.errors.email)}
              {...requestForm.register('email')}
            />
            {requestForm.formState.errors.email && (
              <p className="text-destructive text-sm">
                {requestForm.formState.errors.email.message}
              </p>
            )}
          </div>

          {requestMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{mutationErrorMessage(requestMutation.error)}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={requestMutation.isPending}>
            {requestMutation.isPending ? 'Đang gửi...' : 'Gửi mã OTP'}
          </Button>
        </form>
      )}

      {step === 'verify' && identity && (
        <form
          className="space-y-4"
          noValidate
          onSubmit={verifyForm.handleSubmit((values) =>
            verifyMutation.mutate({ ...identity, otp: values.otp }),
          )}
        >
          <div className="space-y-1.5">
            <Label htmlFor="otp">Mã OTP</Label>
            <Input
              id="otp"
              inputMode="numeric"
              maxLength={6}
              aria-invalid={Boolean(verifyForm.formState.errors.otp)}
              {...verifyForm.register('otp')}
            />
            {verifyForm.formState.errors.otp && (
              <p className="text-destructive text-sm">{verifyForm.formState.errors.otp.message}</p>
            )}
          </div>

          {verifyMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{mutationErrorMessage(verifyMutation.error)}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={verifyMutation.isPending}>
            {verifyMutation.isPending ? 'Đang xác thực...' : 'Xác thực OTP'}
          </Button>
        </form>
      )}

      {step === 'reset' && identity && (
        <form
          className="space-y-4"
          noValidate
          onSubmit={resetForm.handleSubmit((values) =>
            resetMutation.mutate({ ...identity, newPassword: values.newPassword }),
          )}
        >
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">Mật khẩu mới</Label>
            <Input
              id="newPassword"
              type="password"
              aria-invalid={Boolean(resetForm.formState.errors.newPassword)}
              {...resetForm.register('newPassword')}
            />
            {resetForm.formState.errors.newPassword && (
              <p className="text-destructive text-sm">
                {resetForm.formState.errors.newPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
            <Input
              id="confirmPassword"
              type="password"
              aria-invalid={Boolean(resetForm.formState.errors.confirmPassword)}
              {...resetForm.register('confirmPassword')}
            />
            {resetForm.formState.errors.confirmPassword && (
              <p className="text-destructive text-sm">
                {resetForm.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          {resetMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{mutationErrorMessage(resetMutation.error)}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={resetMutation.isPending}>
            {resetMutation.isPending ? 'Đang đặt lại...' : 'Đặt lại mật khẩu'}
          </Button>
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-4 text-center">
          <Alert>
            <AlertDescription>
              Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập bằng mật khẩu mới.
            </AlertDescription>
          </Alert>
          <Button className="w-full" render={<Link href="/login">Về trang đăng nhập</Link>} />
        </div>
      )}

      {step !== 'done' && (
        <div className="text-center text-sm">
          <Link href="/login" className="text-muted-foreground underline">
            Quay lại đăng nhập
          </Link>
        </div>
      )}
    </div>
  );
}
