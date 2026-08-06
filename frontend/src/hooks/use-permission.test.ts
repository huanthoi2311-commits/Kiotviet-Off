import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { useIsPlatformAdmin, usePermission } from './use-permission';

describe('usePermission / useIsPlatformAdmin (FR5, FR6)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('returns false when no token is held', () => {
    const { result } = renderHook(() => usePermission('product:read'));
    expect(result.current).toBe(false);
  });

  it('returns true only for a permission code present on the decoded token', () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['product:read'],
    });
    useAuthStore.getState().setAccessToken(token);

    const { result: allowed } = renderHook(() => usePermission('product:read'));
    const { result: denied } = renderHook(() => usePermission('product:write'));

    expect(allowed.current).toBe(true);
    expect(denied.current).toBe(false);
  });

  it('reads isPlatformAdmin directly from the token, not from permissions[] (FR6)', () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: [],
      isPlatformAdmin: true,
    });
    useAuthStore.getState().setAccessToken(token);

    const { result } = renderHook(() => useIsPlatformAdmin());
    expect(result.current).toBe(true);
  });
});
