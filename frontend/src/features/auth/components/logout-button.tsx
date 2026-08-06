'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { broadcastLogout } from '@/services/auth-coordination';
import { logout as logoutRequest } from '@/services/auth-actions';
import { useAuthStore } from '@/stores/auth-store';

/** Current-device logout (SPEC-T031 FR4) — clears local state even if the network call fails. */
export function LogoutButton() {
  const router = useRouter();
  const clear = useAuthStore((state) => state.clear);
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);
    try {
      await logoutRequest();
    } catch {
      // Best-effort server-side revoke — the client session is cleared regardless.
    } finally {
      clear();
      broadcastLogout();
      router.replace('/login');
    }
  }

  return (
    <Button variant="outline" onClick={handleLogout} disabled={isPending}>
      {isPending ? 'Đang đăng xuất...' : 'Đăng xuất'}
    </Button>
  );
}
