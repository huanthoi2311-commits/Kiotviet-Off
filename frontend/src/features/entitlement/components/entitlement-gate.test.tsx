import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { PermissionGate } from '@/features/auth/components/permission-gate';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { EntitlementGate } from './entitlement-gate';

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

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function login(permissions: string[] = []) {
  const token = buildAccessToken({ sub: 'user-1', organizationId: 'org-1', permissions });
  useAuthStore.getState().setAccessToken(token);
}

describe('EntitlementGate (T053.03 §14/§15/§20 + Current Entitlement Context Defect fix)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('renders children when the Plan includes the feature', async () => {
    login(['user:view']);
    mockEntitlements(['USER_MANAGEMENT']);

    renderWithClient(
      <EntitlementGate feature="USER_MANAGEMENT">
        <div>Protected content</div>
      </EntitlementGate>,
    );

    await screen.findByText('Protected content');
  });

  it('renders "Không có trong gói hiện tại" (not the RBAC message) when the Plan excludes the feature', async () => {
    login(['user:view']);
    mockEntitlements([]);

    renderWithClient(
      <EntitlementGate feature="USER_MANAGEMENT">
        <div>Protected content</div>
      </EntitlementGate>,
    );

    await screen.findByText('Không có trong gói hiện tại');
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.queryByText('Bạn không có quyền truy cập')).not.toBeInTheDocument();
  });

  // Critical regression (Architect Decision) — a user with SOME RBAC permission but WITHOUT
  // organization:view must still resolve entitlement correctly. Previously this user was
  // incorrectly shown "Không có trong gói hiện tại" regardless of their plan.
  it('resolves entitlement correctly for a user WITHOUT organization:view — ENTERPRISE tenant + user:view → USER_MANAGEMENT passes, PermissionGate then decides', async () => {
    login(['user:view']);
    mockEntitlements(['USER_MANAGEMENT']);

    renderWithClient(
      <EntitlementGate feature="USER_MANAGEMENT">
        <PermissionGate code="user:view">
          <div>Protected content</div>
        </PermissionGate>
      </EntitlementGate>,
    );

    await screen.findByText('Protected content');
    expect(screen.queryByText('Không có trong gói hiện tại')).not.toBeInTheDocument();
  });

  // Companion negative case — same user (no organization:view), but WITHOUT user:view either:
  // denial must remain RBAC-related, never mislabeled as a plan restriction.
  it('user WITHOUT organization:view and WITHOUT user:view — denial stays RBAC, not mislabeled as plan restriction', async () => {
    login([]);
    mockEntitlements(['USER_MANAGEMENT']);

    renderWithClient(
      <EntitlementGate feature="USER_MANAGEMENT">
        <PermissionGate code="user:view">
          <div>Protected content</div>
        </PermissionGate>
      </EntitlementGate>,
    );

    await waitFor(() => {
      expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    });
    expect(screen.queryByText('Không có trong gói hiện tại')).not.toBeInTheDocument();
  });

  it('composes with PermissionGate — entitled but RBAC-denied still shows the RBAC message, not the plan message', async () => {
    login([]);
    mockEntitlements(['USER_MANAGEMENT']);

    renderWithClient(
      <EntitlementGate feature="USER_MANAGEMENT">
        <PermissionGate code="user:view">
          <div>Protected content</div>
        </PermissionGate>
      </EntitlementGate>,
    );

    await waitFor(() => {
      expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    });
    expect(screen.queryByText('Không có trong gói hiện tại')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('composes with PermissionGate — not entitled AND RBAC-denied shows the plan message (entitlement checked first)', async () => {
    login([]);
    mockEntitlements([]);

    renderWithClient(
      <EntitlementGate feature="USER_MANAGEMENT">
        <PermissionGate code="user:view">
          <div>Protected content</div>
        </PermissionGate>
      </EntitlementGate>,
    );

    await screen.findByText('Không có trong gói hiện tại');
    expect(screen.queryByText('Bạn không có quyền truy cập')).not.toBeInTheDocument();
  });

  it('has no accessibility violations in the not-in-plan state', async () => {
    login(['user:view']);
    mockEntitlements([]);

    const { container } = renderWithClient(
      <EntitlementGate feature="USER_MANAGEMENT">
        <div>Protected content</div>
      </EntitlementGate>,
    );

    await screen.findByText('Không có trong gói hiện tại');
    expect(await axe(container)).toHaveNoViolations();
  });
});
