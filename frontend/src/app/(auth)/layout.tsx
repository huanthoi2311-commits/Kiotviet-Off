import { AuthShell } from '@/layouts/auth-shell';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
