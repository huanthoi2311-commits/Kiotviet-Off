import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import ProductEditPage from './page';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const PRODUCT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function emptyList() {
  return HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 }));
}

function buildProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    sku: 'SP000001',
    slug: 'ao-thun-nam',
    name: 'Áo thun nam',
    description: null,
    categoryId: 'cat-1',
    brandId: null,
    unitId: 'unit-1',
    parentProductId: null,
    costPrice: '90000',
    vat: null,
    weight: null,
    length: null,
    width: null,
    height: null,
    type: 'STANDARD',
    allowSale: true,
    status: 'ACTIVE',
    isActive: true,
    version: 1,
    prices: [{ id: 'price-1', type: 'RETAIL', price: '150000' }],
    images: [],
    barcodes: [],
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
  const Page = await ProductEditPage({ params: Promise.resolve({ id: PRODUCT_ID }) });
  return render(<QueryClientProvider client={queryClient}>{Page}</QueryClientProvider>);
}

describe('ProductEditPage (T043 Phase F/I)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    server.use(
      http.get(`${API_BASE_URL}/products/${PRODUCT_ID}`, () =>
        HttpResponse.json(envelope(buildProduct())),
      ),
      http.get(`${API_BASE_URL}/products/${PRODUCT_ID}/prices`, () =>
        HttpResponse.json(
          envelope({
            productId: PRODUCT_ID,
            priceVersion: 1,
            prices: [{ id: 'price-1', type: 'RETAIL', price: '150000' }],
          }),
        ),
      ),
      http.get(`${API_BASE_URL}/categories`, () => emptyList()),
      http.get(`${API_BASE_URL}/brands`, () => emptyList()),
      http.get(`${API_BASE_URL}/units`, () => emptyList()),
    );
  });

  it('renders the page header and record for a user with product:view', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['product:view'],
    });
    useAuthStore.getState().setAccessToken(token);

    await renderPage();

    expect(screen.getByRole('heading', { name: 'Chi tiết sản phẩm' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Áo thun nam')).toBeInTheDocument();
  });

  it('shows the unauthorized state, not the record, for a user lacking product:view', async () => {
    await renderPage();

    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chi tiết sản phẩm' })).not.toBeInTheDocument();
  });
});
