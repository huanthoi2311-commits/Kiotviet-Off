'use client';

import type { ReactNode } from 'react';
import type { CommercialFeature } from '../commercial-feature';
import { useEntitlements } from '../use-entitlements';
import { NotInPlanState } from './not-in-plan-state';

/**
 * T053.03 §14/§15 — Shows/hides `children` based on a CommercialFeature. Never the sole
 * enforcement — the underlying API call remains independently protected by `EntitlementGuard`
 * server-side regardless of what renders here.
 *
 * Compose with `PermissionGate` (do not replace it) — both layers apply independently, same
 * as the backend's `EntitlementGuard → PermissionsGuard` order:
 *
 * ```tsx
 * <EntitlementGate feature="USER_MANAGEMENT">
 *   <PermissionGate code="user:view">...</PermissionGate>
 * </EntitlementGate>
 * ```
 */
export function EntitlementGate({
  feature,
  children,
}: {
  feature: CommercialFeature;
  children: ReactNode;
}) {
  const { hasFeature, isLoading } = useEntitlements();

  if (isLoading) {
    return null;
  }

  if (!hasFeature(feature)) {
    return <NotInPlanState />;
  }

  return <>{children}</>;
}
