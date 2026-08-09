import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { InventoryTable } from './inventory-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildInventory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    warehouseId: 'wh-1',
    productId: 'prod-1',
    quantity: '100',
    reservedQty: '10',
    availableQty: '90',
    avgCost: '50000',
    ...overrides,
  };
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'wh-1', name: 'Kho trung tâm' }]))),
    ),
    http.get(`${API_BASE_URL}/products`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'prod-1', name: 'Áo thun nam', sku: 'SP001' }]))),
    ),
  );
}

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InventoryTable />
    </QueryClientProvider>,
  );
}

describe('InventoryTable (T044 Phase J)', () => {
  beforeEach(() => {
    stubRelationLists();
  });

  it('renders no search text box — InventoryQueryDto has no `search` param', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory`, () => HttpResponse.json(envelope(paginated([])))),
    );
    renderTable();
    await screen.findByText('Chưa có dữ liệu tồn kho');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows product/warehouse names (id→name lookup) and quantity columns', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory`, () =>
        HttpResponse.json(envelope(paginated([buildInventory()]))),
      ),
    );
    renderTable();

    expect(await screen.findByText('Áo thun nam (SP001)')).toBeInTheDocument();
    expect(screen.getByText('Kho trung tâm')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
  });

  it('re-fetches with the selected warehouse filter', async () => {
    let lastWarehouseId: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/inventory`, ({ request }) => {
        lastWarehouseId = new URL(request.url).searchParams.get('warehouseId');
        return HttpResponse.json(envelope(paginated([buildInventory()])));
      }),
    );

    renderTable();
    await screen.findByText('Áo thun nam (SP001)');
    expect(lastWarehouseId).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo kho' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Kho trung tâm' }));

    await waitFor(() => expect(lastWarehouseId).toBe('wh-1'));
  });

  it('renders the empty state when no inventory exists and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory`, () => HttpResponse.json(envelope(paginated([])))),
    );
    renderTable();
    expect(await screen.findByText('Chưa có dữ liệu tồn kho')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory`, () =>
        HttpResponse.json(envelope(paginated([buildInventory()]))),
      ),
    );
    const { container } = renderTable();
    await screen.findByText('Áo thun nam (SP001)');
    expect(await axe(container)).toHaveNoViolations();
  });
});
