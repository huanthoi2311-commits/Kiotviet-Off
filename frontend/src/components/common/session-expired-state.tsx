import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Rendered when a live session ends while the user is on a protected route
 * (logout in another tab, or a failed coordinated refresh — SPEC-T031 §9
 * step 6, §19). Distinct from the cold-load "never authenticated" case,
 * which redirects to `/login` directly without this interstitial.
 */
export function SessionExpiredState() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-lg font-semibold">Phiên đăng nhập đã hết hạn</h2>
      <p className="text-muted-foreground text-sm">Vui lòng đăng nhập lại để tiếp tục.</p>
      <Button size="sm" render={<Link href="/login">Đăng nhập lại</Link>} />
    </div>
  );
}
