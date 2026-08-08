import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import UnitsPage from './page';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UnitsPage />
    </QueryClientProvider>,
  );
}

describe('UnitsPage (T042 Phase C)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    server.use(
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

  it('renders the page header and table for a user with unit:view', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['unit:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();

    expect(screen.getByRole('heading', { name: 'Đơn vị tính' })).toBeInTheDocument();
    expect(await screen.findByText('Chưa có đơn vị tính nào')).toBeInTheDocument();
  });

  it('shows the "Thêm đơn vị tính" link for a user with unit:create', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['unit:view', 'unit:create'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();
    await screen.findByText('Chưa có đơn vị tính nào');

    expect(screen.getByRole('link', { name: 'Thêm đơn vị tính' })).toHaveAttribute(
      'href',
      '/units/new',
    );
  });

  it('hides the "Thêm đơn vị tính" link for a user without unit:create', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['unit:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();
    await screen.findByText('Chưa có đơn vị tính nào');

    expect(screen.queryByRole('link', { name: 'Thêm đơn vị tính' })).not.toBeInTheDocument();
  });

  it('shows the unauthorized state, not the table, for a user lacking unit:view', () => {
    renderPage();

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Đơn vị tính' })).not.toBeInTheDocument();
  });
});
