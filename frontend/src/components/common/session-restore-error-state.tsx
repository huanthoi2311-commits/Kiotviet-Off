'use client';

import { Button } from '@/components/ui/button';

/**
 * Rendered when cross-tab refresh coordination times out on a cold load
 * (T031.08A): another tab's refresh completed, but its result never
 * arrived in time. The backend has not reported anything wrong — this is
 * distinct from `SessionExpiredState` (a confirmed logout/refresh
 * failure) and must never claim the session is invalid. Retrying reloads
 * the page, which starts a fresh, fully-coordinated attempt (requirement 4)
 * rather than bypassing coordination.
 */
export function SessionRestoreErrorState() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-lg font-semibold">Không thể xác minh phiên đăng nhập</h2>
      <p className="text-muted-foreground text-sm">
        Vui lòng thử lại — tài khoản của bạn có thể vẫn đang đăng nhập.
      </p>
      <Button size="sm" onClick={() => window.location.reload()}>
        Thử lại
      </Button>
    </div>
  );
}
