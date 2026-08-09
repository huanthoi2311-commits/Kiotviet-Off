import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { PurchaseReturnTable } from './purchase-return-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pr-1',
    purchaseOrderId: 'po-1',
    supplierId: 'sup-1',
    code: 'PR0001',
    status: 'DRAFT',
    reason: 'DAMAGED',
    totalAmount: '100000',
    note: null,
    items: [
      {
        id: 'item-1',
        purchaseItemId: 'poi-1',
        productId: 'prod-1',
        warehouseId: 'wh-1',
        quantity: '2',
        unitCost: '50000',
        totalAmount: '100000',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/suppliers`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'sup-1', companyName: 'Công ty A' }]))),
    ),
  );
}

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PurchaseReturnTable />
    </QueryClientProvider>,
  );
}

describe('PurchaseReturnTable (T045 §7)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    stubRelationLists();
  });

  it('shows supplier name, reason, and status for each row', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns`, () =>
        HttpResponse.json(envelope(paginated([buildReturn()]))),
      ),
    );
    renderTable();

    await screen.findByText('PR0001');
    const row = screen.getByRole('row', { name: /PR0001/ });
    expect(within(row).getByText('Công ty A')).toBeInTheDocument();
    expect(within(row).getByText('Hư hỏng')).toBeInTheDocument();
    expect(within(row).getByText('Nháp')).toBeInTheDocument();
  });

  it('re-fetches with the selected status filter', async () => {
    let lastStatus: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns`, ({ request }) => {
        lastStatus = new URL(request.url).searchParams.get('status');
        return HttpResponse.json(envelope(paginated([buildReturn()])));
      }),
    );

    renderTable();
    await screen.findByText('PR0001');
    expect(lastStatus).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Đã duyệt' }));

    await waitFor(() => expect(lastStatus).toBe('APPROVED'));
  });

  it('re-fetches with the selected supplier filter', async () => {
    let lastSupplierId: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns`, ({ request }) => {
        lastSupplierId = new URL(request.url).searchParams.get('supplierId');
        return HttpResponse.json(envelope(paginated([buildReturn()])));
      }),
    );

    renderTable();
    await screen.findByText('PR0001');
    expect(lastSupplierId).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo nhà cung cấp' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Công ty A' }));

    await waitFor(() => expect(lastSupplierId).toBe('sup-1'));
  });

  it('renders the empty state when no returns exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns`, () =>
        HttpResponse.json(envelope(paginated([]))),
      ),
    );
    renderTable();
    expect(await screen.findByText('Chưa có phiếu trả hàng nào')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns`, () =>
        HttpResponse.json(envelope(paginated([buildReturn()]))),
      ),
    );
    const { container } = renderTable();
    await screen.findByText('PR0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
