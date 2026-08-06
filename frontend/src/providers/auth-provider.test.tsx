import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANNEL_NAME } from '@/services/auth-coordination';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { AuthProvider } from './auth-provider';

describe('AuthProvider — cross-tab propagation (SPEC-T031 §12, FR4)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('clears the local auth store when a logout message arrives from another tab', async () => {
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    useAuthStore.getState().setAccessToken(token);

    render(<AuthProvider>{null}</AuthProvider>);

    // Simulate a logout broadcast from another tab — an independent channel instance,
    // since BroadcastChannel never delivers a message back to the sending instance.
    const senderChannel = new BroadcastChannel(CHANNEL_NAME);
    senderChannel.postMessage({ type: 'logout' });
    senderChannel.close();

    await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('clears the local auth store when a refresh-failed message arrives from another tab', async () => {
    const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions: [] });
    useAuthStore.getState().setAccessToken(token);

    render(<AuthProvider>{null}</AuthProvider>);

    const senderChannel = new BroadcastChannel(CHANNEL_NAME);
    senderChannel.postMessage({ type: 'refresh-failed' });
    senderChannel.close();

    await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
  });

  it('adopts a new access token when a token-updated message arrives from another tab', async () => {
    render(<AuthProvider>{null}</AuthProvider>);

    const newToken = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['a:read'],
    });
    const senderChannel = new BroadcastChannel(CHANNEL_NAME);
    senderChannel.postMessage({ type: 'token-updated', accessToken: newToken });
    senderChannel.close();

    await vi.waitFor(() => expect(useAuthStore.getState().accessToken).toBe(newToken));
  });
});
