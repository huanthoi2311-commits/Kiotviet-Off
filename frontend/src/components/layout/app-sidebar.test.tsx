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

describe('AppSidebar nav gating (T053.03 §14/§20 — entitlement composes with permission)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('hides "Nhân viên" nav item when the Plan does not include USER_MANAGEMENT, even with user:view permission', async () => {
    loginWithPermissions(['organization:view', 'user:view']);
    server.use(
      http.get(`${API_BASE_URL}/organizations/current`, () =>
        HttpResponse.json(envelope(buildCurrentOrganization(['DASHBOARD']))),
      ),
    );

    renderSidebar();

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Nhân viên/i })).not.toBeInTheDocument();
    });
  });

  it('shows "Nhân viên" nav item when both entitlement and permission are present', async () => {
    loginWithPermissions(['organization:view', 'user:view']);
    server.use(
      http.get(`${API_BASE_URL}/organizations/current`, () =>
        HttpResponse.json(envelope(buildCurrentOrganization(['USER_MANAGEMENT']))),
      ),
    );

    renderSidebar();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Nhân viên/i })).toBeInTheDocument();
    });
  });

  it('still hides "Vai trò" nav item without role:view even when RBAC_MANAGEMENT is entitled (permission still required)', async () => {
    loginWithPermissions(['organization:view']);
    server.use(
      http.get(`${API_BASE_URL}/organizations/current`, () =>
        HttpResponse.json(envelope(buildCurrentOrganization(['RBAC_MANAGEMENT']))),
      ),
    );

    renderSidebar();

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Vai trò/i })).not.toBeInTheDocument();
    });
  });
});
