import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import NewProductPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NewProductPage />
    </QueryClientProvider>,
  );
}

function emptyList() {
  return HttpResponse.json({
    success: true,
    data: { items: [], total: 0, page: 1, limit: 20 },
    meta: null,
    traceId: 't-1',
    timestamp: new Date().toISOString(),
  });
}

describe('NewProductPage (T043 Phase E)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    server.use(
      http.get(`${API_BASE_URL}/categories`, () => emptyList()),
      http.get(`${API_BASE_URL}/brands`, () => emptyList()),
      http.get(`${API_BASE_URL}/units`, () => emptyList()),
    );
  });

  it('renders the create form for a user with product:create', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['product:create'],
    });
    useAuthStore.getState().setAccessToken(token);

    renderPage();

    expect(screen.getByRole('heading', { name: 'Thêm sản phẩm' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Tên sản phẩm')).toBeInTheDocument();
  });

  it('shows the unauthorized state, not the form, for a user lacking product:create', () => {
    renderPage();

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tên sản phẩm')).not.toBeInTheDocument();
  });
});
