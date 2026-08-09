import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { PurchaseOrderDetail } from './purchase-order-detail';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const ORDER_ID = 'po-1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function errorEnvelope(code: string, message: string) {
  return {
    success: false,
    code,
    message,
    errors: [],
    traceId: 't-1',
    timestamp: new Date().toISOString(),
  };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
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
    http.get(`${API_BASE_URL}/warehouses`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'wh-1', name: 'Kho trung tâm' }]))),
    ),
    http.get(`${API_BASE_URL}/products`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'prod-1', name: 'Áo thun nam', sku: 'SP001' }]))),
    ),
  );
}

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PurchaseOrderDetail id={ORDER_ID} />
    </QueryClientProvider>,
  );
}

describe('PurchaseOrderDetail (T045 §5)', () => {
  beforeEach(async () => {
    stubRelationLists();
    useAuthStore.getState().clear();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the "not found" empty state for PURCHASE_ORDER_001', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders/${ORDER_ID}`, () =>
        HttpResponse.json(errorEnvelope('PURCHASE_ORDER_001', 'Không tìm thấy đơn nhập hàng'), {
          status: 404,
        }),
      ),
    );
    renderDetail();
    expect(await screen.findByText('Không tìm thấy đơn nhập hàng')).toBeInTheDocument();
  });

  it('DRAFT status shows Approve and Cancel, but not Receive or Trả hàng, given all permissions', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: [
        'purchase:approve',
        'purchase:receive',
        'purchase:cancel',
        'purchase_return:create',
      ],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders/${ORDER_ID}`, () =>
        HttpResponse.json(envelope(buildOrder({ status: 'DRAFT' }))),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Duyệt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy đơn' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận nhận hàng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Trả hàng nhà cung cấp' })).not.toBeInTheDocument();
  });

  it('APPROVED status shows Receive and Cancel, but not Approve', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['purchase:approve', 'purchase:receive', 'purchase:cancel'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders/${ORDER_ID}`, () =>
        HttpResponse.json(envelope(buildOrder({ status: 'APPROVED' }))),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Xác nhận nhận hàng' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy đơn' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
  });

  it('RECEIVED status shows no lifecycle action buttons, but shows the "Trả hàng nhà cung cấp" link given purchase_return:create', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: [
        'purchase:approve',
        'purchase:receive',
        'purchase:cancel',
        'purchase_return:create',
      ],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders/${ORDER_ID}`, () =>
        HttpResponse.json(envelope(buildOrder({ status: 'RECEIVED' }))),
      ),
    );
    renderDetail();

    await screen.findByText('PO0001');
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận nhận hàng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trả hàng nhà cung cấp' })).toHaveAttribute(
      'href',
      `/purchase-returns/new?purchaseOrderId=${ORDER_ID}`,
    );
  });

  it('clicking Approve opens the confirm dialog and calls PATCH .../approve on confirm', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['purchase:approve'],
    });
    useAuthStore.getState().setAccessToken(token);
    let approveCalled = false;
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders/${ORDER_ID}`, () =>
        HttpResponse.json(envelope(buildOrder({ status: 'DRAFT' }))),
      ),
      http.patch(`${API_BASE_URL}/purchase-orders/${ORDER_ID}/approve`, () => {
        approveCalled = true;
        return HttpResponse.json(envelope(buildOrder({ status: 'APPROVED' })));
      }),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duyệt' }));

    await waitFor(() => expect(approveCalled).toBe(true));
  });

  it('a stale-click race (PURCHASE_ORDER_003 invalid transition) keeps the dialog open with the backend message', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['purchase:receive'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders/${ORDER_ID}`, () =>
        HttpResponse.json(envelope(buildOrder({ status: 'APPROVED' }))),
      ),
      http.patch(`${API_BASE_URL}/purchase-orders/${ORDER_ID}/receive`, () =>
        HttpResponse.json(errorEnvelope('PURCHASE_ORDER_003', 'Đơn đã được xử lý bởi người khác'), {
          status: 422,
        }),
      ),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận nhận hàng' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận nhận hàng' }));

    expect(await screen.findByText('Đơn đã được xử lý bởi người khác')).toBeInTheDocument();
  });

  it('has no accessibility violations once loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-orders/${ORDER_ID}`, () =>
        HttpResponse.json(envelope(buildOrder({ status: 'DRAFT' }))),
      ),
    );
    const { container } = renderDetail();
    await screen.findByText('PO0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
