import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import BrandsPage from './page';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrandsPage />
    </QueryClientProvider>,
  );
}

describe('BrandsPage (T041 Phase C)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    server.use(
      http.get(`${API_BASE_URL}/brands`, () =>
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

  it('renders the page header and table for a user with brand:view', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['brand:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();

    expect(screen.getByRole('heading', { name: 'Thương hiệu' })).toBeInTheDocument();
    expect(await screen.findByText('Chưa có thương hiệu nào')).toBeInTheDocument();
  });

  it('shows the "Thêm thương hiệu" link for a user with brand:create', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['brand:view', 'brand:create'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();
    await screen.findByText('Chưa có thương hiệu nào');

    expect(screen.getByRole('link', { name: 'Thêm thương hiệu' })).toHaveAttribute(
      'href',
      '/brands/new',
    );
  });

  it('hides the "Thêm thương hiệu" link for a user without brand:create', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['brand:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();
    await screen.findByText('Chưa có thương hiệu nào');

    expect(screen.queryByRole('link', { name: 'Thêm thương hiệu' })).not.toBeInTheDocument();
  });

  it('shows the unauthorized state, not the table, for a user lacking brand:view', () => {
    renderPage();

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Thương hiệu' })).not.toBeInTheDocument();
  });
});
