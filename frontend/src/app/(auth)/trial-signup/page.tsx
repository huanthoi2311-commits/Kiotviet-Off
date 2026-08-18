'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useTrialSignupControllerFinalize,
  useTrialSignupControllerRequestOtp,
  useTrialSignupControllerVerifyOtp,
} from '@/generated/trial-signup/trial-signup';
import { isNormalizedError } from '@/services/api-client';
import { useAuthStore } from '@/stores/auth-store';

/** `error` is already a `NormalizedError` — apiClient's interceptor normalized it (cùng quy ước
 * forgot-password/page.tsx, generated hooks đi qua ĐÚNG cùng apiClient/interceptor). */
function mutationErrorMessage(error: unknown): string {
  return isNormalizedError(error) ? error.message : 'Đã xảy ra lỗi không xác định';
}

/** Mirrors backend RequestSignupOtpDto. */
const requestSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
});

/** Mirrors backend VerifySignupOtpDto. */
const verifySchema = z.object({
  otp: z.string().length(6, 'OTP gồm 6 chữ số'),
});

/** Mirrors backend FinalizeTrialSignupDto — KHÔNG có trường plan/email nào ở đây (T053.04 D14). */
const setupSchema = z
  .object({
    displayName: z.string().min(3, 'Tên tổ chức tối thiểu 3 ký tự').max(150),
    slug: z
      .string()
      .max(60, 'Tối đa 60 ký tự')
      .regex(/^[a-z0-9-]*$/, 'Chỉ gồm chữ thường, số và dấu gạch ngang')
      .optional()
      .or(z.literal('')),
    fullName: z.string().min(1, 'Vui lòng nhập họ tên').max(150),
    password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
    confirmPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

type RequestFormValues = z.infer<typeof requestSchema>;
type VerifyFormValues = z.infer<typeof verifySchema>;
type SetupFormValues = z.infer<typeof setupSchema>;

type Step = 'request' | 'verify' | 'setup';

export default function TrialSignupPage() {
  const router = useRouter();
  const setAccessToken = useAuthStore((state) => state.setAccessToken);

  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [signupProofToken, setSignupProofToken] = useState('');

  const requestForm = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { email: '' },
  });
  const verifyForm = useForm<VerifyFormValues>({
    resolver: zodResolver(verifySchema),
    defaultValues: { otp: '' },
  });
  const setupForm = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      displayName: '',
      slug: '',
      fullName: '',
      password: '',
      confirmPassword: '',
    },
  });

  const requestMutation = useTrialSignupControllerRequestOtp({
    mutation: {
      onSuccess: (_data, variables) => {
        setEmail(variables.data.email);
        setStep('verify');
      },
    },
  });

  const verifyMutation = useTrialSignupControllerVerifyOtp({
    mutation: {
      onSuccess: (data) => {
        setSignupProofToken(data.signupProofToken);
        setStep('setup');
      },
    },
  });

  const finalizeMutation = useTrialSignupControllerFinalize({
    mutation: {
      onSuccess: (data) => {
        setAccessToken(data.accessToken);
        router.replace('/dashboard');
      },
    },
  });

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Đăng ký dùng thử</h1>
        <p className="text-muted-foreground text-sm">
          {step === 'request' && 'Nhập email để nhận mã xác thực'}
          {step === 'verify' && 'Nhập mã OTP đã gửi tới email của bạn'}
          {step === 'setup' && 'Thông tin tổ chức và tài khoản của bạn'}
        </p>
      </div>

      {step === 'request' && (
        <form
          className="space-y-4"
          noValidate
          onSubmit={requestForm.handleSubmit((values) => requestMutation.mutate({ data: values }))}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="owner@congty.vn"
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

      {step === 'verify' && (
        <form
          className="space-y-4"
          noValidate
          onSubmit={verifyForm.handleSubmit((values) =>
            verifyMutation.mutate({ data: { email, otp: values.otp } }),
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

      {step === 'setup' && (
        <form
          className="space-y-4"
          noValidate
          onSubmit={setupForm.handleSubmit((values) =>
            finalizeMutation.mutate({
              data: {
                signupProofToken,
                organization: {
                  displayName: values.displayName,
                  slug: values.slug ? values.slug : undefined,
                },
                owner: { fullName: values.fullName, password: values.password },
              },
            }),
          )}
        >
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Tên tổ chức</Label>
            <Input
              id="displayName"
              aria-invalid={Boolean(setupForm.formState.errors.displayName)}
              {...setupForm.register('displayName')}
            />
            {setupForm.formState.errors.displayName && (
              <p className="text-destructive text-sm">
                {setupForm.formState.errors.displayName.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">Mã tổ chức (tùy chọn)</Label>
            <Input
              id="slug"
              placeholder="Bỏ trống để hệ thống tự tạo"
              aria-invalid={Boolean(setupForm.formState.errors.slug)}
              {...setupForm.register('slug')}
            />
            {setupForm.formState.errors.slug && (
              <p className="text-destructive text-sm">{setupForm.formState.errors.slug.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fullName">Họ tên</Label>
            <Input
              id="fullName"
              aria-invalid={Boolean(setupForm.formState.errors.fullName)}
              {...setupForm.register('fullName')}
            />
            {setupForm.formState.errors.fullName && (
              <p className="text-destructive text-sm">
                {setupForm.formState.errors.fullName.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Mật khẩu</Label>
            <Input
              id="password"
              type="password"
              aria-invalid={Boolean(setupForm.formState.errors.password)}
              {...setupForm.register('password')}
            />
            {setupForm.formState.errors.password && (
              <p className="text-destructive text-sm">
                {setupForm.formState.errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
            <Input
              id="confirmPassword"
              type="password"
              aria-invalid={Boolean(setupForm.formState.errors.confirmPassword)}
              {...setupForm.register('confirmPassword')}
            />
            {setupForm.formState.errors.confirmPassword && (
              <p className="text-destructive text-sm">
                {setupForm.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          {finalizeMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{mutationErrorMessage(finalizeMutation.error)}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={finalizeMutation.isPending}>
            {finalizeMutation.isPending ? 'Đang tạo tổ chức...' : 'Hoàn tất đăng ký'}
          </Button>
        </form>
      )}

      <div className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground underline">
          Đã có tài khoản? Đăng nhập
        </Link>
      </div>
    </div>
  );
}
