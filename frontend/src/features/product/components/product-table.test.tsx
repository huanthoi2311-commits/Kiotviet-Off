import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { ProductTable } from './product-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductTable />
    </QueryClientProvider>,
  );
}

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    sku: 'SP000001',
    slug: 'ao-thun-nam',
    name: 'Áo thun nam',
    description: null,
    categoryId: 'cat-1',
    brandId: null,
    unitId: 'unit-1',
    parentProductId: null,
    costPrice: '90000',
    vat: '8',
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

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/categories`, () => HttpResponse.json(envelope(paginated([])))),
    http.get(`${API_BASE_URL}/brands`, () => HttpResponse.json(envelope(paginated([])))),
    http.get(`${API_BASE_URL}/units`, () => HttpResponse.json(envelope(paginated([])))),
  );
}

describe('ProductTable (T043 Phase D)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    stubRelationLists();
  });

  it('shows a "Sửa" link per row for a user with product:update, pointing at /products/:id', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['product:update'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/products`, () =>
        HttpResponse.json(envelope(paginated([buildProduct()]))),
      ),
    );

    renderTable();
    await screen.findByText('Áo thun nam');

    expect(screen.getByRole('link', { name: 'Sửa' })).toHaveAttribute(
      'href',
      '/products/a1b2c3d4-0000-0000-0000-000000000001',
    );
  });

  it('hides the "Sửa" link for a user without product:update', async () => {
    server.use(
      http.get(`${API_BASE_URL}/products`, () =>
        HttpResponse.json(envelope(paginated([buildProduct()]))),
      ),
    );

    renderTable();
    await screen.findByText('Áo thun nam');

    expect(screen.queryByRole('link', { name: 'Sửa' })).not.toBeInTheDocument();
  });

  it('ARCHIVED rows show only "Khôi phục" — "Sửa" and "Lưu trữ" are hidden even with product:update/product:delete', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['product:update', 'product:delete', 'product:restore'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/products`, () =>
        HttpResponse.json(envelope(paginated([buildProduct({ status: 'ARCHIVED' })]))),
      ),
    );

    renderTable();
    await screen.findByText('Áo thun nam');

    expect(screen.queryByRole('link', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu trữ' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khôi phục' })).toBeInTheDocument();
  });

  it('clicking "Lưu trữ" opens the archive confirmation dialog for that row\'s product', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['product:delete'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/products`, () =>
        HttpResponse.json(envelope(paginated([buildProduct()]))),
      ),
    );

    renderTable();
    await screen.findByText('Áo thun nam');

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    expect(screen.getByText('Lưu trữ sản phẩm?')).toBeInTheDocument();
    expect(screen.getByText(/"Áo thun nam"/)).toBeInTheDocument();
  });

  it('shows the RETAIL price and category name columns (id→name lookup, not a raw UUID)', async () => {
    server.use(
      http.get(`${API_BASE_URL}/products`, () =>
        HttpResponse.json(envelope(paginated([buildProduct()]))),
      ),
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(
          envelope(paginated([{ id: 'cat-1', name: 'Áo', code: 'AO', slug: 'ao' }])),
        ),
      ),
    );

    renderTable();
    await screen.findByText('Áo thun nam');

    expect(await screen.findByText('Áo')).toBeInTheDocument();
    expect(screen.getByText('150000')).toBeInTheDocument();
    expect(screen.queryByText('cat-1')).not.toBeInTheDocument();
  });

  it('re-fetches with the selected status filter', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/products`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(envelope(paginated([buildProduct()])));
      }),
    );

    renderTable();
    await screen.findByText('Áo thun nam');
    expect(lastUrl?.searchParams.get('status')).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Đang hoạt động' }));

    await waitFor(() => expect(lastUrl?.searchParams.get('status')).toBe('ACTIVE'));
  });

  it('re-fetches with the selected type filter', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/products`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(envelope(paginated([buildProduct()])));
      }),
    );

    renderTable();
    await screen.findByText('Áo thun nam');

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo loại sản phẩm' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Dịch vụ' }));

    await waitFor(() => expect(lastUrl?.searchParams.get('type')).toBe('SERVICE'));
  });

  it('renders the "nothing exists yet" empty state when no products exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/products`, () => HttpResponse.json(envelope(paginated([])))),
    );

    renderTable();
    expect(await screen.findByText('Chưa có sản phẩm nào')).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/products`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { success: false, code: 'PRODUCT_500', message: 'Đã xảy ra lỗi hệ thống', errors: [] },
            { status: 500 },
          );
        }
        return HttpResponse.json(envelope(paginated([buildProduct()])));
      }),
    );

    renderTable();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Áo thun nam')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/products`, () =>
        HttpResponse.json(envelope(paginated([buildProduct()]))),
      ),
    );

    const { container } = renderTable();
    await screen.findByText('Áo thun nam');
    expect(await axe(container)).toHaveNoViolations();
  });
});
