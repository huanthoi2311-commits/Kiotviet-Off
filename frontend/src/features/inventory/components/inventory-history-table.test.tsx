import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { InventoryHistoryTable } from './inventory-history-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildMovement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mv-1',
    warehouseId: 'wh-1',
    productId: 'prod-1',
    movementType: 'PURCHASE',
    referenceType: 'PURCHASE',
    quantity: '10',
    beforeQuantity: '90',
    afterQuantity: '100',
    remark: null,
    createdAt: '2026-01-01T00:00:00.000Z',
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
      <InventoryHistoryTable />
    </QueryClientProvider>,
  );
}

describe('InventoryHistoryTable (T044 Phase J)', () => {
  beforeEach(() => {
    stubRelationLists();
  });

  it('shows a signed quantity delta and before/after columns', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory/history`, () =>
        HttpResponse.json(envelope(paginated([buildMovement()]))),
      ),
    );
    renderTable();

    expect(await screen.findByText('+10')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('re-fetches with the selected movement type filter', async () => {
    let lastMovementType: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/inventory/history`, ({ request }) => {
        lastMovementType = new URL(request.url).searchParams.get('movementType');
        return HttpResponse.json(envelope(paginated([buildMovement()])));
      }),
    );

    renderTable();
    await screen.findByText('+10');
    expect(lastMovementType).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo loại biến động' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Bán hàng' }));

    await waitFor(() => expect(lastMovementType).toBe('SALE'));
  });

  it('re-fetches with the selected reference type filter', async () => {
    let lastReferenceType: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/inventory/history`, ({ request }) => {
        lastReferenceType = new URL(request.url).searchParams.get('referenceType');
        return HttpResponse.json(envelope(paginated([buildMovement()])));
      }),
    );

    renderTable();
    await screen.findByText('+10');
    expect(lastReferenceType).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo nguồn' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Bán hàng (POS)' }));

    await waitFor(() => expect(lastReferenceType).toBe('POS'));
  });

  it('renders the empty state when no movements exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory/history`, () =>
        HttpResponse.json(envelope(paginated([]))),
      ),
    );
    renderTable();
    expect(await screen.findByText('Chưa có biến động tồn kho nào')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/inventory/history`, () =>
        HttpResponse.json(envelope(paginated([buildMovement()]))),
      ),
    );
    const { container } = renderTable();
    await screen.findByText('+10');
    expect(await axe(container)).toHaveNoViolations();
  });
});
