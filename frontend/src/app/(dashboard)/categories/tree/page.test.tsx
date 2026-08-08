import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import CategoryTreePage from './page';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoryTreePage />
    </QueryClientProvider>,
  );
}

describe('CategoryTreePage (T040)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    server.use(http.get(`${API_BASE_URL}/categories/tree`, () => HttpResponse.json(envelope([]))));
  });

  it('renders the page header and tree for a user with category:view', async () => {
    useAuthStore
      .getState()
      .setAccessToken(
        buildAccessToken({
          sub: 'user-1',
          organizationId: 'org-1',
          permissions: ['category:view'],
        }),
      );

    renderPage();

    expect(screen.getByRole('heading', { name: 'Cây danh mục' })).toBeInTheDocument();
    expect(await screen.findByText('Chưa có danh mục nào')).toBeInTheDocument();
  });

  it('shows the unauthorized state, not the tree, for a user lacking category:view', async () => {
    renderPage();

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cây danh mục' })).not.toBeInTheDocument();
  });
});
