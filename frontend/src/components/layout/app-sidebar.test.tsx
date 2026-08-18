import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { AppSidebarProvider } from './app-sidebar';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function mockEntitlements(effectiveFeatures: string[]) {
  server.use(
    http.get(`${API_BASE_URL}/entitlements/current`, () =>
      HttpResponse.json(envelope({ effectiveFeatures })),
    ),
  );
}

function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppSidebarProvider>
        <div>page content</div>
      </AppSidebarProvider>
    </QueryClientProvider>,
  );
}

function loginWithPermissions(permissions: string[]) {
  const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions });
  useAuthStore.getState().setAccessToken(token);
}

describe('AppSidebar nav gating (T053.03 §14/§20 + Current Entitlement Context Defect fix)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('hides "Nhân viên" nav item when the Plan does not include USER_MANAGEMENT, even with user:view permission', async () => {
    loginWithPermissions(['user:view']);
    mockEntitlements(['DASHBOARD']);

    renderSidebar();

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Nhân viên/i })).not.toBeInTheDocument();
    });
  });

  it('shows "Nhân viên" nav item when both entitlement and permission are present', async () => {
    loginWithPermissions(['user:view']);
    mockEntitlements(['USER_MANAGEMENT']);

    renderSidebar();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Nhân viên/i })).toBeInTheDocument();
    });
  });

  it('still hides "Vai trò" nav item without role:view even when RBAC_MANAGEMENT is entitled (permission still required)', async () => {
    loginWithPermissions([]);
    mockEntitlements(['RBAC_MANAGEMENT']);

    renderSidebar();

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Vai trò/i })).not.toBeInTheDocument();
    });
  });

  // Critical regression (Architect Decision) — a user without organization:view (here, without
  // ANY permissions beyond user:view) must still see nav items their plan genuinely entitles them
  // to, once RBAC also permits it. Previously this user's entitlement query never even fired.
  it('shows "Nhân viên" nav item for a user WITHOUT organization:view once entitlement + RBAC both permit it', async () => {
    loginWithPermissions(['user:view']);
    mockEntitlements(['USER_MANAGEMENT']);

    renderSidebar();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Nhân viên/i })).toBeInTheDocument();
    });
  });
});
