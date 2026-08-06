'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SessionExpiredState } from '@/components/common/session-expired-state';
import { SessionRestoreErrorState } from '@/components/common/session-restore-error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentOrganization } from '@/hooks/use-current-organization';
import { useSessionRestore } from '@/hooks/use-session-restore';
import { subscribeToAuthEvents } from '@/services/auth-coordination';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Composition point for the `(dashboard)` route group (SPEC-T031 §8): reads
 * the Auth Store (via session restoration) and the Organization Context,
 * and renders children within them. No sidebar/topbar visual design is
 * specified anywhere in the RFC or discovery evidence base — that is a
 * separate, disclosed gap (§8), not implemented here.
 *
 * Also owns the session-restore gate (redirect on a cold unauthenticated
 * load) and the session-expired state (logout/refresh-failure while the
 * user is already on a protected route) — §9 step 6, §19.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const sessionStatus = useSessionRestore();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [sessionExpired, setSessionExpired] = useState(false);
  useCurrentOrganization();

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.replace('/login');
    }
  }, [sessionStatus, router]);

  useEffect(() => {
    return subscribeToAuthEvents((message) => {
      if (message.type === 'logout' || message.type === 'refresh-failed') {
        setSessionExpired(true);
        toast.error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
      }
    });
  }, []);

  if (sessionExpired) {
    return <SessionExpiredState />;
  }

  if (sessionStatus === 'restore-error') {
    return <SessionRestoreErrorState />;
  }

  if (sessionStatus === 'restoring') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <div className="min-h-screen">{children}</div>;
}
