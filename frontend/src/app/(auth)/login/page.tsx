'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isNormalizedError, type NormalizedError } from '@/services/api-client';
import { login, type LoginResult } from '@/services/auth-actions';
import { useAuthStore } from '@/stores/auth-store';

/** Co-located with the form (SPEC-T031 §18), mirrors backend/src/modules/auth/application/dto/login.dto.ts. */
const loginSchema = z.object({
  organizationSlug: z
    .string()
    .min(1, 'Vui lòng nhập mã tổ chức')
    .regex(/^[a-z0-9-]+$/, 'Mã tổ chức chỉ gồm chữ thường, số và dấu gạch ngang'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const setAccessToken = useAuthStore((state) => state.setAccessToken);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { organizationSlug: '', email: '', password: '' },
  });

  const mutation = useMutation<LoginResult, NormalizedError, LoginFormValues>({
    mutationFn: login,
    onSuccess: (result) => {
      setAccessToken(result.accessToken);
      router.replace('/dashboard');
    },
  });

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Đăng nhập</h1>
        <p className="text-muted-foreground text-sm">POS ERP Enterprise</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        noValidate
      >
        <div className="space-y-1.5">
          <Label htmlFor="organizationSlug">Mã tổ chức</Label>
          <Input
            id="organizationSlug"
            placeholder="kiotviet-off"
            aria-invalid={Boolean(errors.organizationSlug)}
            {...register('organizationSlug')}
          />
          {errors.organizationSlug && (
            <p className="text-destructive text-sm">{errors.organizationSlug.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="owner@kiotviet-off.vn"
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
          {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
          {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
        </div>

        {mutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {isNormalizedError(mutation.error)
                ? mutation.error.message
                : 'Đã xảy ra lỗi không xác định'}
            </AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>

        <div className="text-center text-sm">
          <Link href="/forgot-password" className="text-muted-foreground underline">
            Quên mật khẩu?
          </Link>
        </div>
      </form>
    </div>
  );
}
