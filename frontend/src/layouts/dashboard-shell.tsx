'use client';

import { useSessionRestore } from '@/hooks/use-session-restore';
import { useCurrentOrganization } from '@/hooks/use-current-organization';

/**
 * Composition point for the `(dashboard)` route group (SPEC-T031 §8): reads
 * the Auth Store (via session restoration) and the Organization Context,
 * and renders children within them. No sidebar/topbar visual design is
 * specified anywhere in the RFC or discovery evidence base — that is a
 * separate, disclosed gap (§8), not implemented here.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const sessionStatus = useSessionRestore();
  useCurrentOrganization();

  if (sessionStatus === 'restoring') {
    return null;
  }

  return <div className="min-h-screen">{children}</div>;
}
