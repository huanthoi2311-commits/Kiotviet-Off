import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { useEntitlements } from './use-entitlements';

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
      plan: 'PRO',
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

function renderUseEntitlements() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useEntitlements(), { wrapper });
}

describe('useEntitlements (T053.03 §13/§20)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('resolves effectiveFeatures from GET /organizations/current for a user with organization:view', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['organization:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/organizations/current`, () =>
        HttpResponse.json(
          envelope(buildCurrentOrganization(['DASHBOARD', 'USER_MANAGEMENT', 'RBAC_MANAGEMENT'])),
        ),
      ),
    );

    const { result } = renderUseEntitlements();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasFeature('USER_MANAGEMENT')).toBe(true);
    expect(result.current.hasFeature('SUPPLIER')).toBe(false);
    expect(result.current.effectiveFeatures).toEqual(
      expect.arrayContaining(['DASHBOARD', 'USER_MANAGEMENT', 'RBAC_MANAGEMENT']),
    );
  });

  it('never calls the API for a user without organization:view — fails closed to no features', async () => {
    let called = false;
    server.use(
      http.get(`${API_BASE_URL}/organizations/current`, () => {
        called = true;
        return HttpResponse.json(envelope(buildCurrentOrganization(['DASHBOARD'])));
      }),
    );

    const { result } = renderUseEntitlements();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(called).toBe(false);
    expect(result.current.hasFeature('DASHBOARD')).toBe(false);
    expect(result.current.effectiveFeatures).toEqual([]);
  });
});
