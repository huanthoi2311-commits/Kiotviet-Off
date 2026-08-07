'use client';

import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/use-permission';

export interface PermissionButtonProps extends React.ComponentProps<typeof Button> {
  /** Permission code required for this button to render at all. */
  permission: string;
}

/**
 * T034.01 §6/§11 — renders nothing (absent, not disabled) when the current
 * user lacks `permission`. Built directly on `usePermission`, not
 * `PermissionGate`: `PermissionGate` renders a full `UnauthorizedState` on
 * denial, correct for gating a whole page/section but wrong for a single
 * button, which must simply not appear (T033.02 §3's own established
 * convention — hidden, never a visible-but-disabled control).
 */
export function PermissionButton({ permission, ...props }: PermissionButtonProps) {
  const allowed = usePermission(permission);

  if (!allowed) {
    return null;
  }

  return <Button {...props} />;
}
