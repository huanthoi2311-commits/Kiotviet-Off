'use client';

import type { ReactNode } from 'react';
import { UnauthorizedState } from '@/components/common/unauthorized-state';
import { usePermission } from '@/hooks/use-permission';

/**
 * Shows/hides `children` based on a permission code (SPEC-T031 FR5). Never
 * the sole enforcement — the underlying API call remains independently
 * protected server-side regardless of what renders here (SR3).
 */
export function PermissionGate({ code, children }: { code: string; children: ReactNode }) {
  const allowed = usePermission(code);

  if (!allowed) {
    return <UnauthorizedState />;
  }

  return <>{children}</>;
}
