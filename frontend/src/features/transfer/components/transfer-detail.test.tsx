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
import { TransferDetail } from './transfer-detail';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const TRANSFER_ID = 'tr-1';

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

function buildTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSFER_ID,
    fromWarehouseId: 'wh-1',
    toWarehouseId: 'wh-2',
    code: 'DC0001',
    status: 'PENDING',
    note: null,
    version: 1,
    items: [{ id: 'item-1', productId: 'prod-1', quantity: '10', unitCost: null }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () =>
      HttpResponse.json(
        envelope(
          paginated([
            { id: 'wh-1', name: 'Kho nguồn' },
            { id: 'wh-2', name: 'Kho đích' },
          ]),
        ),
      ),
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
      <TransferDetail id={TRANSFER_ID} />
    </QueryClientProvider>,
  );
}

describe('TransferDetail (T044 Phase L)', () => {
  beforeEach(async () => {
    stubRelationLists();
    useAuthStore.getState().clear();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the "not found" empty state for TRANSFER_001', async () => {
    server.use(
      http.get(`${API_BASE_URL}/transfers/${TRANSFER_ID}`, () =>
        HttpResponse.json(errorEnvelope('TRANSFER_001', 'Không tìm thấy phiếu điều chuyển'), {
          status: 404,
        }),
      ),
    );
    renderDetail();
    expect(await screen.findByText('Không tìm thấy phiếu điều chuyển')).toBeInTheDocument();
  });

  it('PENDING status shows Approve and Cancel, but not Receive, given both permissions', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['transfer:approve', 'transfer:receive', 'transfer:cancel'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/transfers/${TRANSFER_ID}`, () =>
        HttpResponse.json(envelope(buildTransfer({ status: 'PENDING' }))),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Duyệt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy phiếu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận nhận hàng' })).not.toBeInTheDocument();
  });

  it('APPROVED status shows Receive and Cancel, but not Approve', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['transfer:approve', 'transfer:receive', 'transfer:cancel'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/transfers/${TRANSFER_ID}`, () =>
        HttpResponse.json(envelope(buildTransfer({ status: 'APPROVED' }))),
      ),
    );
    renderDetail();

    expect(await screen.findByRole('button', { name: 'Xác nhận nhận hàng' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy phiếu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
  });

  it('RECEIVED status shows no action buttons at all', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['transfer:approve', 'transfer:receive', 'transfer:cancel'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/transfers/${TRANSFER_ID}`, () =>
        HttpResponse.json(envelope(buildTransfer({ status: 'RECEIVED' }))),
      ),
    );
    renderDetail();

    await screen.findByText('DC0001');
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận nhận hàng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hủy phiếu' })).not.toBeInTheDocument();
  });

  it('clicking Approve opens the confirm dialog and calls PATCH .../approve on confirm', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['transfer:approve'],
    });
    useAuthStore.getState().setAccessToken(token);
    let approveCalled = false;
    server.use(
      http.get(`${API_BASE_URL}/transfers/${TRANSFER_ID}`, () =>
        HttpResponse.json(envelope(buildTransfer({ status: 'PENDING' }))),
      ),
      http.patch(`${API_BASE_URL}/transfers/${TRANSFER_ID}/approve`, () => {
        approveCalled = true;
        return HttpResponse.json(envelope(buildTransfer({ status: 'APPROVED' })));
      }),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    expect(screen.getByText('Duyệt phiếu điều chuyển?')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duyệt' }));

    await waitFor(() => expect(approveCalled).toBe(true));
  });

  it('a stale-click race (TRANSFER_004 invalid transition) keeps the dialog open with the backend message', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['transfer:approve'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/transfers/${TRANSFER_ID}`, () =>
        HttpResponse.json(envelope(buildTransfer({ status: 'PENDING' }))),
      ),
      http.patch(`${API_BASE_URL}/transfers/${TRANSFER_ID}/approve`, () =>
        HttpResponse.json(
          errorEnvelope('TRANSFER_004', 'Phiếu đã được duyệt hoặc hủy bởi người khác'),
          { status: 422 },
        ),
      ),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duyệt' }));

    expect(
      await screen.findByText('Phiếu đã được duyệt hoặc hủy bởi người khác'),
    ).toBeInTheDocument();
  });

  it("T051.02: clicking Approve sends the transfer's current version in the request body", async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['transfer:approve'],
    });
    useAuthStore.getState().setAccessToken(token);
    let receivedBody: unknown;
    server.use(
      http.get(`${API_BASE_URL}/transfers/${TRANSFER_ID}`, () =>
        HttpResponse.json(envelope(buildTransfer({ status: 'PENDING', version: 5 }))),
      ),
      http.patch(`${API_BASE_URL}/transfers/${TRANSFER_ID}/approve`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(envelope(buildTransfer({ status: 'APPROVED', version: 6 })));
      }),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duyệt' }));

    await waitFor(() => expect(receivedBody).toEqual({ version: 5 }));
  });

  it('T051.02: a version conflict (TRANSFER_008) keeps the dialog open with the backend message and refetches the detail', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['transfer:approve'],
    });
    useAuthStore.getState().setAccessToken(token);
    let getCallCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/transfers/${TRANSFER_ID}`, () => {
        getCallCount += 1;
        return HttpResponse.json(envelope(buildTransfer({ status: 'PENDING', version: 1 })));
      }),
      http.patch(`${API_BASE_URL}/transfers/${TRANSFER_ID}/approve`, () =>
        HttpResponse.json(
          errorEnvelope('TRANSFER_008', 'Phiếu điều chuyển vừa bị thay đổi bởi giao dịch khác'),
          { status: 409 },
        ),
      ),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    const initialGetCount = getCallCount;
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duyệt' }));

    expect(
      await screen.findByText('Phiếu điều chuyển vừa bị thay đổi bởi giao dịch khác'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Duyệt' })).toBeInTheDocument();
    await waitFor(() => expect(getCallCount).toBeGreaterThan(initialGetCount));
  });

  it('has no accessibility violations once loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/transfers/${TRANSFER_ID}`, () =>
        HttpResponse.json(envelope(buildTransfer({ status: 'PENDING' }))),
      ),
    );
    const { container } = renderDetail();
    await screen.findByText('DC0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
