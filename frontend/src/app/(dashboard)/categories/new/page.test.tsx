import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import NewCategoryPage from './page';

const API_BASE_URL = 'http://localhost:3000/api/v1';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NewCategoryPage />
    </QueryClientProvider>,
  );
}

describe('NewCategoryPage (T036.10)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    server.use(
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 100 },
          meta: null,
          traceId: 't-1',
          timestamp: new Date().toISOString(),
        }),
      ),
    );
  });

  it('renders the create form for a user with category:create', () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:create'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();

    expect(screen.getByRole('heading', { name: 'Thêm danh mục' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mã danh mục')).toBeInTheDocument();
  });

  it('shows the unauthorized state, not the form, for a user lacking category:create', () => {
    renderPage();

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mã danh mục')).not.toBeInTheDocument();
  });
});
