import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import ProductsPage from './page';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductsPage />
    </QueryClientProvider>,
  );
}

describe('ProductsPage (T043 Phase D)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    server.use(
      http.get(`${API_BASE_URL}/products`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 20 },
          meta: null,
          traceId: 't-1',
          timestamp: new Date().toISOString(),
        }),
      ),
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 20 },
          meta: null,
          traceId: 't-1',
          timestamp: new Date().toISOString(),
        }),
      ),
      http.get(`${API_BASE_URL}/brands`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 20 },
          meta: null,
          traceId: 't-1',
          timestamp: new Date().toISOString(),
        }),
      ),
      http.get(`${API_BASE_URL}/units`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 20 },
          meta: null,
          traceId: 't-1',
          timestamp: new Date().toISOString(),
        }),
      ),
    );
  });

  it('renders the page header and table for a user with product:view', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['product:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();

    expect(screen.getByRole('heading', { name: 'Sản phẩm' })).toBeInTheDocument();
    expect(await screen.findByText('Chưa có sản phẩm nào')).toBeInTheDocument();
  });

  it('shows the "Thêm sản phẩm" link for a user with product:create', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['product:view', 'product:create'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();
    await screen.findByText('Chưa có sản phẩm nào');

    expect(screen.getByRole('link', { name: 'Thêm sản phẩm' })).toHaveAttribute(
      'href',
      '/products/new',
    );
  });

  it('hides the "Thêm sản phẩm" link for a user without product:create', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['product:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();
    await screen.findByText('Chưa có sản phẩm nào');

    expect(screen.queryByRole('link', { name: 'Thêm sản phẩm' })).not.toBeInTheDocument();
  });

  it('shows the unauthorized state, not the table, for a user lacking product:view', () => {
    renderPage();

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sản phẩm' })).not.toBeInTheDocument();
  });
});
