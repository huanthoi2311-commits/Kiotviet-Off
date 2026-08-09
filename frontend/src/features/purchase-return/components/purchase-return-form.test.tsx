import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { PurchaseReturnCreateForm } from './purchase-return-form';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const ORDER_ID = 'po-1';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
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
    status: 'RECEIVED',
    totalAmount: '500000',
    paidAmount: '0',
    expectedAt: null,
    items: [
      {
        id: 'poi-1',
        productId: 'prod-1',
        warehouseId: 'wh-1',
        quantity: '10',
        receivedQuantity: '10',
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

function buildReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pr-new-1',
    purchaseOrderId: ORDER_ID,
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
    http.get(`${API_BASE_URL}/products`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'prod-1', name: 'Áo thun nam', sku: 'SP001' }]))),
    ),
  );
}

function stubOrder(order = buildOrder()) {
  server.use(
    http.get(`${API_BASE_URL}/purchase-orders/${ORDER_ID}`, () =>
      HttpResponse.json(envelope(order)),
    ),
  );
}

function renderForm(purchaseOrderId: string | undefined) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PurchaseReturnCreateForm purchaseOrderId={purchaseOrderId} />
    </QueryClientProvider>,
  );
}

describe('PurchaseReturnCreateForm (T045 §7)', () => {
  beforeEach(async () => {
    push.mockClear();
    stubRelationLists();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows a guidance empty state when no purchaseOrderId is provided', () => {
    renderForm(undefined);
    expect(screen.getByText('Chưa chọn đơn nhập hàng')).toBeInTheDocument();
  });

  it('shows a "not returnable" empty state for a DRAFT (not yet received) order', async () => {
    stubOrder(buildOrder({ status: 'DRAFT' }));
    renderForm(ORDER_ID);
    expect(await screen.findByText('Đơn nhập hàng chưa thể trả hàng')).toBeInTheDocument();
  });

  it('renders the locked order code and a purchase-item picker for a RECEIVED order', async () => {
    stubOrder();
    renderForm(ORDER_ID);

    expect(await screen.findByDisplayValue('PO0001')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Dòng hàng' })).toBeInTheDocument();
  });

  it('submits the expected payload and navigates to the detail page on success', async () => {
    stubOrder();
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE_URL}/purchase-returns`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildReturn()), { status: 201 });
      }),
    );

    renderForm(ORDER_ID);
    await screen.findByDisplayValue('PO0001');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Dòng hàng' }));
    await user.click(await screen.findByRole('option', { name: /Áo thun nam \(SP001\)/ }));
    await user.clear(screen.getByLabelText('Số lượng trả'));
    await user.type(screen.getByLabelText('Số lượng trả'), '2');
    await user.click(screen.getByRole('button', { name: 'Tạo phiếu trả hàng' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        purchaseOrderId: ORDER_ID,
        reason: 'DAMAGED',
        items: [{ purchaseItemId: 'poi-1', quantity: 2 }],
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/purchase-returns/pr-new-1'));
  }, 20000);

  it('blocks submission and makes zero network calls when required fields are missing', async () => {
    stubOrder();
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/purchase-returns`, () => {
        called = true;
        return HttpResponse.json(envelope(buildReturn()), { status: 201 });
      }),
    );

    renderForm(ORDER_ID);
    await screen.findByDisplayValue('PO0001');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo phiếu trả hàng' }));

    expect(await screen.findByText('Vui lòng chọn dòng hàng')).toBeInTheDocument();
    expect(called).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('PURCHASE_RETURN_006 (exceeds received) surfaces as a root-level error, not a fabricated client-side cap', async () => {
    stubOrder();
    server.use(
      http.post(`${API_BASE_URL}/purchase-returns`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'PURCHASE_RETURN_006',
            message: 'Số lượng trả vượt quá số lượng đã nhận',
            errors: [],
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 422 },
        ),
      ),
    );

    renderForm(ORDER_ID);
    await screen.findByDisplayValue('PO0001');
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Dòng hàng' }));
    await user.click(await screen.findByRole('option', { name: /Áo thun nam \(SP001\)/ }));
    await user.clear(screen.getByLabelText('Số lượng trả'));
    await user.type(screen.getByLabelText('Số lượng trả'), '999');
    await user.click(screen.getByRole('button', { name: 'Tạo phiếu trả hàng' }));

    expect(await screen.findByText('Số lượng trả vượt quá số lượng đã nhận')).toBeInTheDocument();
  });

  it('has no accessibility violations once loaded', async () => {
    stubOrder();
    const { container } = renderForm(ORDER_ID);
    await screen.findByDisplayValue('PO0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
