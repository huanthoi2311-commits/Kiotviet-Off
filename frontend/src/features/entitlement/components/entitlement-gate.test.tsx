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

function buildCurrentOrganization(effectiveFeatures: string[]) {
  return {
    id: 'org-1',
    code: 'ORG000001',
    displayName: 'Acme',
    legalName: null,
    slug: 'acme',
    taxCode: null,
    email: null,
    phone: null,
    website: null,
    logoUrl: null,
    address: null,
    province: null,
    district: null,
    ward: null,
    countryCode: 'VN',
    timezone: 'Asia/Ho_Chi_Minh',
    currencyCode: 'VND',
    languageCode: 'vi',
    status: 'ACTIVE',
    ownerUserId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    settings: {
      allowNegativeInventory: false,
      allowBackDate: false,
      decimalQuantity: 0,
      decimalPrice: 0,
      defaultWarehouseId: null,
      defaultBranchId: null,
      defaultLanguage: 'vi',
      defaultCurrency: 'VND',
    },
    subscription: {
      plan: 'BASIC',
      status: 'ACTIVE',
      startedAt: '2026-01-01T00:00:00.000Z',
      expiredAt: null,
      maxBranch: null,
      maxUser: null,
      maxWarehouse: null,
      maxProduct: null,
      maxCustomer: null,
      storageLimitGB: null,
      effectiveFeatures,
    },
  };
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function loginWithOrgView() {
  const token = buildAccessToken({
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: ['organization:view', 'user:view'],
  });
  useAuthStore.getState().setAccessToken(token);
}

describe('EntitlementGate (T053.03 §14/§15/§20)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('renders children when the Plan includes the feature', async () => {
    loginWithOrgView();
    server.use(
      http.get(`${API_BASE_URL}/organizations/current`, () =>
        HttpResponse.json(envelope(buildCurrentOrganization(['USER_MANAGEMENT']))),
      ),
    );

    renderWithClient(
      <EntitlementGate feature="USER_MANAGEMENT">
        <div>Protected content</div>
      </EntitlementGate>,
    );

    await screen.findByText('Protected content');
  });

  it('renders "Không có trong gói hiện tại" (not the RBAC message) when the Plan excludes the feature', async () => {
    loginWithOrgView();
    server.use(
      http.get(`${API_BASE_URL}/organizations/current`, () =>
        HttpResponse.json(envelope(buildCurrentOrganization([]))),
      ),
    );

    renderWithClient(
      <EntitlementGate feature="USER_MANAGEMENT">
        <div>Protected content</div>
      </EntitlementGate>,
    );

    await screen.findByText('Không có trong gói hiện tại');
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.queryByText('Bạn không có quyền truy cập')).not.toBeInTheDocument();
  });

  it('composes with PermissionGate — entitled but RBAC-denied still shows the RBAC message, not the plan message', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['organization:view'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/organizations/current`, () =>
        HttpResponse.json(envelope(buildCurrentOrganization(['USER_MANAGEMENT']))),
      ),
    );

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
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['organization:view'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/organizations/current`, () =>
        HttpResponse.json(envelope(buildCurrentOrganization([]))),
      ),
    );

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
    loginWithOrgView();
    server.use(
      http.get(`${API_BASE_URL}/organizations/current`, () =>
        HttpResponse.json(envelope(buildCurrentOrganization([]))),
      ),
    );

    const { container } = renderWithClient(
      <EntitlementGate feature="USER_MANAGEMENT">
        <div>Protected content</div>
      </EntitlementGate>,
    );

    await screen.findByText('Không có trong gói hiện tại');
    expect(await axe(container)).toHaveNoViolations();
  });
});
