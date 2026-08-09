import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { StockCountTable } from './stock-count-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildStockCount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sc-1',
    warehouseId: 'wh-1',
    code: 'KK0001',
    status: 'DRAFT',
    note: null,
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        systemQty: '100',
        actualQty: null,
        difference: null,
        remark: null,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'wh-1', name: 'Kho trung tâm' }]))),
    ),
  );
}

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StockCountTable />
    </QueryClientProvider>,
  );
}

describe('StockCountTable (T044 Phase N)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    stubRelationLists();
  });

  it('shows warehouse name and status for each row', async () => {
    server.use(
      http.get(`${API_BASE_URL}/stock-count`, () =>
        HttpResponse.json(envelope(paginated([buildStockCount()]))),
      ),
    );
    renderTable();

    await screen.findByText('KK0001');
    const row = screen.getByRole('row', { name: /KK0001/ });
    expect(within(row).getByText('Kho trung tâm')).toBeInTheDocument();
    expect(within(row).getByText('Nháp')).toBeInTheDocument();
  });

  it('hides "Tạo phiếu kiểm kê" for a user without stock_count:create', async () => {
    server.use(
      http.get(`${API_BASE_URL}/stock-count`, () => HttpResponse.json(envelope(paginated([])))),
    );
    renderTable();
    await screen.findByText('Chưa có phiếu kiểm kê nào');
    expect(screen.queryByRole('link', { name: 'Tạo phiếu kiểm kê' })).not.toBeInTheDocument();
  });

  it('shows "Tạo phiếu kiểm kê" for a user with stock_count:create', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['stock_count:create'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/stock-count`, () => HttpResponse.json(envelope(paginated([])))),
    );
    renderTable();
    expect(await screen.findByRole('link', { name: 'Tạo phiếu kiểm kê' })).toHaveAttribute(
      'href',
      '/stock-count/new',
    );
  });

  it('re-fetches with the selected status filter', async () => {
    let lastStatus: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/stock-count`, ({ request }) => {
        lastStatus = new URL(request.url).searchParams.get('status');
        return HttpResponse.json(envelope(paginated([buildStockCount()])));
      }),
    );

    renderTable();
    await screen.findByText('KK0001');
    expect(lastStatus).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Đang kiểm kê' }));

    await waitFor(() => expect(lastStatus).toBe('COUNTING'));
  });

  it('renders the empty state when no stock counts exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/stock-count`, () => HttpResponse.json(envelope(paginated([])))),
    );
    renderTable();
    expect(await screen.findByText('Chưa có phiếu kiểm kê nào')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/stock-count`, () =>
        HttpResponse.json(envelope(paginated([buildStockCount()]))),
      ),
    );
    const { container } = renderTable();
    await screen.findByText('KK0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
