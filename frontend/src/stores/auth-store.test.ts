import { beforeEach, describe, expect, it } from 'vitest';
import { buildAccessToken } from '@/test/build-access-token';
import { useAuthStore } from './auth-store';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('sets the access token and decodes its claims', () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['a:read'],
    });

    useAuthStore.getState().setAccessToken(token);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe(token);
    expect(state.claims?.organizationId).toBe('org-1');
  });

  it('clears all fields on logout', () => {
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    useAuthStore.getState().setAccessToken(token);

    useAuthStore.getState().clear();

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.claims).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
});
