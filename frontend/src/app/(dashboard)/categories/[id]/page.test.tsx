import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import CategoryEditPage from './page';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const CATEGORY_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: CATEGORY_ID,
    parentId: null,
    code: 'THOI-TRANG',
    name: 'Thời trang',
    slug: 'thoi-trang',
    description: null,
    imageUrl: null,
    sortOrder: 0,
    isActive: true,
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

async function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Page = await CategoryEditPage({ params: Promise.resolve({ id: CATEGORY_ID }) });
  return render(<QueryClientProvider client={queryClient}>{Page}</QueryClientProvider>);
}

describe('CategoryEditPage (T037.10)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    server.use(
      http.get(`${API_BASE_URL}/categories/${CATEGORY_ID}`, () =>
        HttpResponse.json(envelope(buildCategory())),
      ),
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(envelope({ items: [buildCategory()], total: 1, page: 1, limit: 100 })),
      ),
    );
  });

  it('renders the page header and record for a user with category:view', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    await renderPage();

    expect(screen.getByRole('heading', { name: 'Chi tiết danh mục' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('THOI-TRANG')).toBeInTheDocument();
  });

  it('shows the unauthorized state, not the record, for a user lacking category:view', async () => {
    await renderPage();

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chi tiết danh mục' })).not.toBeInTheDocument();
  });
});
