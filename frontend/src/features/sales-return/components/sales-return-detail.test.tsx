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
import { SalesReturnDetail } from './sales-return-detail';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const RETURN_ID = 'sr-1';

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

function buildSalesReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: RETURN_ID,
    organizationId: 'org-1',
    branchId: 'branch-1',
    invoiceId: 'inv-1',
    customerId: null,
    code: 'TH0001',
    status: 'DRAFT',
    totalAmount: '75000',
    note: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
    items: [
      {
        id: 'sritem-1',
        invoiceItemId: 'invitem-1',
        productId: 'prod-1',
        warehouseId: null,
        quantity: '1',
        unitPrice: '75000',
        discount: '0',
        taxAmount: '0',
        totalAmount: '75000',
        productCodeSnapshot: 'SP001',
        productNameSnapshot: 'Áo thun nam',
        unitNameSnapshot: 'Cái',
        reason: 'DAMAGED',
        reasonNote: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    refunds: [],
    ...overrides,
  };
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/customers`, () => HttpResponse.json(envelope(paginated([])))),
  );
}

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SalesReturnDetail id={RETURN_ID} />
    </QueryClientProvider>,
  );
}

describe('SalesReturnDetail (T047 §4/§16)', () => {
  beforeEach(async () => {
    stubRelationLists();
    useAuthStore.getState().clear();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the "not found" empty state for SALES_RETURN_001', async () => {
    server.use(
      http.get(`${API_BASE_URL}/sales-returns/${RETURN_ID}`, () =>
        HttpResponse.json(errorEnvelope('SALES_RETURN_001', 'Không tìm thấy phiếu trả hàng'), {
          status: 404,
        }),
      ),
    );
    renderDetail();
    expect(await screen.findByText('Không tìm thấy phiếu trả hàng')).toBeInTheDocument();
  });

  it('links to the source Invoice', async () => {
    server.use(
      http.get(`${API_BASE_URL}/sales-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildSalesReturn())),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('link', { name: 'Xem hóa đơn' })).toHaveAttribute(
      'href',
      '/invoices/inv-1',
    );
  });

  it('DRAFT status shows Submit and Cancel, but not Approve/Receive/Complete', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: [
        'sales_return:submit',
        'sales_return:approve',
        'sales_return:receive',
        'sales_return:complete',
        'sales_return:cancel',
      ],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/sales-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildSalesReturn({ status: 'DRAFT' }))),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Gửi duyệt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy phiếu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận nhận hàng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tất' })).not.toBeInTheDocument();
  });

  it('RECEIVED status shows only Complete', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['sales_return:complete', 'sales_return:cancel'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/sales-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildSalesReturn({ status: 'RECEIVED' }))),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Hoàn tất' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy phiếu' })).not.toBeInTheDocument();
  });

  it('COMPLETED status shows no lifecycle action buttons', async () => {
    server.use(
      http.get(`${API_BASE_URL}/sales-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildSalesReturn({ status: 'COMPLETED' }))),
      ),
    );
    renderDetail();

    await screen.findByText('TH0001');
    expect(screen.queryByRole('button', { name: 'Gửi duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tất' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy phiếu' })).not.toBeInTheDocument();
  });

  it('clicking Submit opens the dialog and sends the current version in the request body', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['sales_return:submit'],
    });
    useAuthStore.getState().setAccessToken(token);
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${API_BASE_URL}/sales-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildSalesReturn({ status: 'DRAFT', version: 3 }))),
      ),
      http.post(`${API_BASE_URL}/sales-returns/${RETURN_ID}/submit`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildSalesReturn({ status: 'SUBMITTED', version: 4 })));
      }),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Gửi duyệt' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi duyệt' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ version: 3 }));
  });

  it('a stale-click race (SALES_RETURN_005 invalid transition) shows an in-dialog error', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['sales_return:submit'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/sales-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildSalesReturn({ status: 'DRAFT' }))),
      ),
      http.post(`${API_BASE_URL}/sales-returns/${RETURN_ID}/submit`, () =>
        HttpResponse.json(
          errorEnvelope('SALES_RETURN_005', 'Trạng thái không hợp lệ để chuyển đổi'),
          {
            status: 422,
          },
        ),
      ),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Gửi duyệt' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi duyệt' }));

    expect(await screen.findByText('Trạng thái không hợp lệ để chuyển đổi')).toBeInTheDocument();
  });

  it('a version conflict (SALES_RETURN_006) closes the dialog and shows the top-level "Tải lại" alert', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['sales_return:submit'],
    });
    useAuthStore.getState().setAccessToken(token);
    let getCallCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/sales-returns/${RETURN_ID}`, () => {
        getCallCount += 1;
        return HttpResponse.json(
          envelope(buildSalesReturn({ status: 'DRAFT', version: getCallCount })),
        );
      }),
      http.post(`${API_BASE_URL}/sales-returns/${RETURN_ID}/submit`, () =>
        HttpResponse.json(
          errorEnvelope(
            'SALES_RETURN_006',
            'Phiếu đã được thay đổi bởi người khác, vui lòng tải lại',
          ),
          { status: 409 },
        ),
      ),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Gửi duyệt' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi duyệt' }));

    expect(
      await screen.findByText('Phiếu đã được thay đổi bởi người khác, vui lòng tải lại'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const callsBeforeReload = getCallCount;
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại' }));

    await waitFor(() => expect(getCallCount).toBeGreaterThan(callsBeforeReload));
    expect(
      screen.queryByText('Phiếu đã được thay đổi bởi người khác, vui lòng tải lại'),
    ).not.toBeInTheDocument();
  });

  it('has no accessibility violations once loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/sales-returns/${RETURN_ID}`, () =>
        HttpResponse.json(envelope(buildSalesReturn({ status: 'DRAFT' }))),
      ),
    );
    const { container } = renderDetail();
    await screen.findByText('TH0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
