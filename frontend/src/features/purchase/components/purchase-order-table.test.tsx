import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { PurchaseOrderTable } from './purchase-order-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'po-1',
    branchId: 'branch-1',
    supplierId: 'sup-1',
    code: 'PO0001',
    status: 'DRAFT',
    totalAmount: '500000',
    paidAmount: '0',
    expectedAt: null,
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        warehouseId: 'wh-1',
        quantity: '10',
        receivedQuantity: '0',
        unitCost: '50000',
        discount: '0',
        taxAmount: '0',
        totalAmount: '500000',
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
    http.get(`${API_BASE_URL}/branches`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'branch-1', name: 'Chi nhánh 1' }]))),
    ),
  );
}

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PurchaseOrderTable />
    </QueryClientProvider>,
  );
}

describe('PurchaseOrderTable (T045 §5)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    stubRelationLists();
  });

  it('shows supplier/branch names (id→name lookup) and status for each row', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders`, () =>
        HttpResponse.json(envelope(paginated([buildOrder()]))),
      ),
    );
    renderTable();

    await screen.findByText('PO0001');
    const row = screen.getByRole('row', { name: /PO0001/ });
    expect(within(row).getByText('Công ty A')).toBeInTheDocument();
    expect(within(row).getByText('Chi nhánh 1')).toBeInTheDocument();
    expect(within(row).getByText('Nháp')).toBeInTheDocument();
  });

  it('hides "Tạo đơn nhập hàng" for a user without purchase:create', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders`, () => HttpResponse.json(envelope(paginated([])))),
    );
    renderTable();
    await screen.findByText('Chưa có đơn nhập hàng nào');
    expect(screen.queryByRole('link', { name: 'Tạo đơn nhập hàng' })).not.toBeInTheDocument();
  });

  it('shows "Tạo đơn nhập hàng" for a user with purchase:create', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['purchase:create'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders`, () => HttpResponse.json(envelope(paginated([])))),
    );
    renderTable();
    expect(await screen.findByRole('link', { name: 'Tạo đơn nhập hàng' })).toHaveAttribute(
      'href',
      '/purchase-orders/new',
    );
  });

  it('re-fetches with the selected status filter', async () => {
    let lastStatus: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders`, ({ request }) => {
        lastStatus = new URL(request.url).searchParams.get('status');
        return HttpResponse.json(envelope(paginated([buildOrder()])));
      }),
    );

    renderTable();
    await screen.findByText('PO0001');
    expect(lastStatus).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Đã duyệt' }));

    await waitFor(() => expect(lastStatus).toBe('APPROVED'));
  });

  it('re-fetches with the selected supplier filter', async () => {
    let lastSupplierId: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders`, ({ request }) => {
        lastSupplierId = new URL(request.url).searchParams.get('supplierId');
        return HttpResponse.json(envelope(paginated([buildOrder()])));
      }),
    );

    renderTable();
    await screen.findByText('PO0001');
    expect(lastSupplierId).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo nhà cung cấp' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Công ty A' }));

    await waitFor(() => expect(lastSupplierId).toBe('sup-1'));
  });

  it('renders the empty state when no orders exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders`, () => HttpResponse.json(envelope(paginated([])))),
    );
    renderTable();
    expect(await screen.findByText('Chưa có đơn nhập hàng nào')).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            {
              success: false,
              code: 'PURCHASE_ORDER_500',
              message: 'Đã xảy ra lỗi hệ thống',
              errors: [],
            },
            { status: 500 },
          );
        }
        return HttpResponse.json(envelope(paginated([buildOrder()])));
      }),
    );

    renderTable();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('PO0001')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders`, () =>
        HttpResponse.json(envelope(paginated([buildOrder()]))),
      ),
    );
    const { container } = renderTable();
    await screen.findByText('PO0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
