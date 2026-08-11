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
import { PurchaseReturnDetail } from './purchase-return-detail';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const RETURN_ID = 'pr-1';

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

function buildReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: RETURN_ID,
    purchaseOrderId: 'po-1',
    supplierId: 'sup-1',
    code: 'PR0001',
    status: 'DRAFT',
    reason: 'DAMAGED',
    totalAmount: '100000',
    note: null,
    version: 1,
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
      <PurchaseReturnDetail id={RETURN_ID} />
    </QueryClientProvider>,
  );
}

describe('PurchaseReturnDetail (T045 §7)', () => {
  beforeEach(async () => {
    stubRelationLists();
    useAuthStore.getState().clear();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the "not found" empty state for PURCHASE_RETURN_001', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns/${RETURN_ID}`, () =>
        HttpResponse.json(errorEnvelope('PURCHASE_RETURN_001', 'Không tìm thấy phiếu trả hàng'), {
          status: 404,
        }),
      ),
    );
    renderDetail();
    expect(await screen.findByText('Không tìm thấy phiếu trả hàng')).toBeInTheDocument();
  });

  it('links to the referenced Purchase Order', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildReturn())),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('link', { name: 'Xem đơn nhập hàng' })).toHaveAttribute(
      'href',
      '/purchase-orders/po-1',
    );
  });

  it('DRAFT status shows Approve and Cancel, but not Complete', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: [
        'purchase_return:approve',
        'purchase_return:complete',
        'purchase_return:cancel',
      ],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildReturn({ status: 'DRAFT' }))),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Duyệt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy phiếu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tất' })).not.toBeInTheDocument();
  });

  it('APPROVED status shows Complete and Cancel, but not Approve', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: [
        'purchase_return:approve',
        'purchase_return:complete',
        'purchase_return:cancel',
      ],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildReturn({ status: 'APPROVED' }))),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Hoàn tất' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy phiếu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
  });

  it('COMPLETED status shows no action buttons', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildReturn({ status: 'COMPLETED' }))),
      ),
    );
    renderDetail();

    await screen.findByText('PR0001');
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tất' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy phiếu' })).not.toBeInTheDocument();
  });

  it('clicking Complete opens the confirm dialog and calls PATCH .../complete on confirm', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['purchase_return:complete'],
    });
    useAuthStore.getState().setAccessToken(token);
    let completeCalled = false;
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildReturn({ status: 'APPROVED' }))),
      ),
      http.patch(`${API_BASE_URL}/purchase-returns/${RETURN_ID}/complete`, () => {
        completeCalled = true;
        return HttpResponse.json(envelope(buildReturn({ status: 'COMPLETED' })));
      }),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Hoàn tất' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hoàn tất' }));

    await waitFor(() => expect(completeCalled).toBe(true));
  });

  it("T051.02: clicking Complete sends the return's current version in the request body", async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['purchase_return:complete'],
    });
    useAuthStore.getState().setAccessToken(token);
    let receivedBody: unknown;
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildReturn({ status: 'APPROVED', version: 2 }))),
      ),
      http.patch(`${API_BASE_URL}/purchase-returns/${RETURN_ID}/complete`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(envelope(buildReturn({ status: 'COMPLETED', version: 3 })));
      }),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Hoàn tất' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hoàn tất' }));

    await waitFor(() => expect(receivedBody).toEqual({ version: 2 }));
  });

  it('T051.02: a version conflict (PURCHASE_RETURN_010) keeps the dialog open with the backend message and refetches the detail', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['purchase_return:complete'],
    });
    useAuthStore.getState().setAccessToken(token);
    let getCallCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns/${RETURN_ID}`, () => {
        getCallCount += 1;
        return HttpResponse.json(envelope(buildReturn({ status: 'APPROVED', version: 1 })));
      }),
      http.patch(`${API_BASE_URL}/purchase-returns/${RETURN_ID}/complete`, () =>
        HttpResponse.json(
          errorEnvelope('PURCHASE_RETURN_010', 'Phiếu trả hàng vừa bị thay đổi bởi giao dịch khác'),
          { status: 409 },
        ),
      ),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Hoàn tất' }));
    const initialGetCount = getCallCount;
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hoàn tất' }));

    expect(
      await screen.findByText('Phiếu trả hàng vừa bị thay đổi bởi giao dịch khác'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Hoàn tất' })).toBeInTheDocument();
    await waitFor(() => expect(getCallCount).toBeGreaterThan(initialGetCount));
  });

  it('has no accessibility violations once loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/purchase-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildReturn({ status: 'DRAFT' }))),
      ),
    );
    const { container } = renderDetail();
    await screen.findByText('PR0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
