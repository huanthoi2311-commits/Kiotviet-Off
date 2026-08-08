import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import CategoriesPage from './page';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoriesPage />
    </QueryClientProvider>,
  );
}

describe('CategoriesPage (T035.10)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    server.use(
      http.get(`${API_BASE_URL}/categories`, () =>
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

  it('renders the page header and table for a user with category:view', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();

    expect(screen.getByRole('heading', { name: 'Danh mục' })).toBeInTheDocument();
    expect(await screen.findByText('Chưa có danh mục nào')).toBeInTheDocument();
  });

  it('shows the "Thêm danh mục" link for a user with category:create (T036.10)', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:view', 'category:create'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();
    await screen.findByText('Chưa có danh mục nào');

    expect(screen.getByRole('link', { name: 'Thêm danh mục' })).toHaveAttribute(
      'href',
      '/categories/new',
    );
  });

  it('shows the "Xem dạng cây" link to /categories/tree for any user with category:view (T040)', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();
    await screen.findByText('Chưa có danh mục nào');

    expect(screen.getByRole('link', { name: 'Xem dạng cây' })).toHaveAttribute(
      'href',
      '/categories/tree',
    );
  });

  it('hides the "Thêm danh mục" link for a user without category:create (T036.10)', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();
    await screen.findByText('Chưa có danh mục nào');

    expect(screen.queryByRole('link', { name: 'Thêm danh mục' })).not.toBeInTheDocument();
  });

  it('shows the unauthorized state, not the table, for a user lacking category:view', () => {
    renderPage();

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Danh mục' })).not.toBeInTheDocument();
  });
});
