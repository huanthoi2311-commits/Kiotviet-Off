import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import BrandEditPage from './page';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const BRAND_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildBrand(overrides: Record<string, unknown> = {}) {
  return {
    id: BRAND_ID,
    code: 'NIKE',
    name: 'Nike',
    logo: null,
    description: null,
    website: null,
    country: null,
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Page = await BrandEditPage({ params: Promise.resolve({ id: BRAND_ID }) });
  return render(<QueryClientProvider client={queryClient}>{Page}</QueryClientProvider>);
}

describe('BrandEditPage (T041 Phase E)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    server.use(
      http.get(`${API_BASE_URL}/brands/${BRAND_ID}`, () =>
        HttpResponse.json(envelope(buildBrand())),
      ),
    );
  });

  it('renders the page header and record for a user with brand:view', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['brand:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    await renderPage();

    expect(screen.getByRole('heading', { name: 'Chi tiết thương hiệu' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('NIKE')).toBeInTheDocument();
  });

  it('shows the unauthorized state, not the record, for a user lacking brand:view', async () => {
    await renderPage();

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chi tiết thương hiệu' })).not.toBeInTheDocument();
  });
});
