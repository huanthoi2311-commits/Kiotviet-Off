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
import { RefundPanel } from './refund-panel';

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

function buildRefund(overrides: Record<string, unknown> = {}) {
  return {
    id: 'refund-1',
    salesReturnId: RETURN_ID,
    amount: '50000',
    method: 'CASH',
    status: 'PENDING',
    externalReference: null,
    failureReason: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

function renderPanel(props: {
  salesReturnStatus: string;
  refunds?: ReturnType<typeof buildRefund>[];
  onVersionConflict?: (message: string) => void;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RefundPanel
        salesReturnId={RETURN_ID}
        salesReturnStatus={props.salesReturnStatus}
        refunds={props.refunds ?? []}
        onVersionConflict={props.onVersionConflict ?? vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('RefundPanel (T047 §9)', () => {
  beforeEach(async () => {
    useAuthStore.getState().clear();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('hides the create-refund form when the return is not RECEIVED/COMPLETED', () => {
    renderPanel({ salesReturnStatus: 'DRAFT' });
    expect(screen.queryByLabelText('Số tiền hoàn')).not.toBeInTheDocument();
  });

  it('shows the create-refund form when the return is RECEIVED', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['sales_return:refund'],
    });
    useAuthStore.getState().setAccessToken(token);
    renderPanel({ salesReturnStatus: 'RECEIVED' });
    expect(screen.getByLabelText('Số tiền hoàn')).toBeInTheDocument();
  });

  it('submits the expected payload (kèm header Idempotency-Key) khi tạo hoàn tiền', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['sales_return:refund'],
    });
    useAuthStore.getState().setAccessToken(token);
    let capturedBody: Record<string, unknown> | undefined;
    let capturedKey: string | null = null;
    server.use(
      http.post(`${API_BASE_URL}/sales-returns/${RETURN_ID}/refunds`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        capturedKey = request.headers.get('idempotency-key');
        return HttpResponse.json(envelope(buildRefund()), { status: 201 });
      }),
    );
    renderPanel({ salesReturnStatus: 'RECEIVED' });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Số tiền hoàn'), '50000');
    await user.click(screen.getByRole('button', { name: 'Tạo hoàn tiền' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ amount: 50000, method: 'CASH' }));
    expect(capturedKey).toBeTruthy();
  });

  // T053.06E §17 — end-to-end wiring proof (not just the isolated hook test): a failed attempt
  // followed by a changed amount must send a DIFFERENT Idempotency-Key on retry, while an
  // unchanged retry sends the SAME one.
  it('gửi Idempotency-Key MỚI khi amount đổi sau lần thất bại, nhưng GIỮ NGUYÊN key khi retry không đổi', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['sales_return:refund'],
    });
    useAuthStore.getState().setAccessToken(token);
    const capturedKeys: (string | null)[] = [];
    let shouldFail = true;
    server.use(
      http.post(`${API_BASE_URL}/sales-returns/${RETURN_ID}/refunds`, ({ request }) => {
        capturedKeys.push(request.headers.get('idempotency-key'));
        if (shouldFail) {
          return HttpResponse.json(
            errorEnvelope('SALES_RETURN_011', 'Vượt quá hạn mức hoàn tiền'),
            { status: 422 },
          );
        }
        return HttpResponse.json(envelope(buildRefund({ amount: '99999' })), { status: 201 });
      }),
    );
    renderPanel({ salesReturnStatus: 'RECEIVED' });

    const user = userEvent.setup();
    const amountInput = screen.getByLabelText('Số tiền hoàn');
    await user.type(amountInput, '50000');
    await user.click(screen.getByRole('button', { name: 'Tạo hoàn tiền' }));
    await waitFor(() => expect(capturedKeys).toHaveLength(1));

    // Unchanged retry (same amount) — same key.
    await user.click(screen.getByRole('button', { name: 'Tạo hoàn tiền' }));
    await waitFor(() => expect(capturedKeys).toHaveLength(2));
    expect(capturedKeys[1]).toBe(capturedKeys[0]);

    // Changed intent (amount edited) — new key.
    await user.clear(amountInput);
    await user.type(amountInput, '99999');
    shouldFail = false;
    await user.click(screen.getByRole('button', { name: 'Tạo hoàn tiền' }));
    await waitFor(() => expect(capturedKeys).toHaveLength(3));
    expect(capturedKeys[2]).not.toBe(capturedKeys[1]);
  });

  it('shows Process/Cancel actions for a PENDING refund', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['sales_return:refund'],
    });
    useAuthStore.getState().setAccessToken(token);
    renderPanel({ salesReturnStatus: 'RECEIVED', refunds: [buildRefund({ status: 'PENDING' })] });

    expect(screen.getByRole('button', { name: 'Xử lý' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tất' })).not.toBeInTheDocument();
  });

  it('shows Complete/Fail actions for a PROCESSING refund', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['sales_return:refund'],
    });
    useAuthStore.getState().setAccessToken(token);
    renderPanel({
      salesReturnStatus: 'RECEIVED',
      refunds: [buildRefund({ status: 'PROCESSING' })],
    });

    expect(screen.getByRole('button', { name: 'Hoàn tất' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đánh dấu thất bại' })).toBeInTheDocument();
  });

  it('processing a refund sends the current version', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['sales_return:refund'],
    });
    useAuthStore.getState().setAccessToken(token);
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE_URL}/sales-returns/refunds/refund-1/process`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildRefund({ status: 'PROCESSING', version: 2 })));
      }),
    );
    renderPanel({
      salesReturnStatus: 'RECEIVED',
      refunds: [buildRefund({ status: 'PENDING', version: 5 })],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Xử lý' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xử lý' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ version: 5 }));
  });

  it('failing a refund requires a reason before submitting', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['sales_return:refund'],
    });
    useAuthStore.getState().setAccessToken(token);
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/sales-returns/refunds/refund-1/fail`, () => {
        called = true;
        return HttpResponse.json(envelope(buildRefund({ status: 'FAILED' })));
      }),
    );
    renderPanel({
      salesReturnStatus: 'RECEIVED',
      refunds: [buildRefund({ status: 'PROCESSING' })],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Đánh dấu thất bại' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Đánh dấu thất bại' }));

    expect(await screen.findByText('Vui lòng nhập lý do thất bại')).toBeInTheDocument();
    expect(called).toBe(false);

    await userEvent.type(within(dialog).getByLabelText('Lý do thất bại'), 'Ngân hàng từ chối');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Đánh dấu thất bại' }));

    await waitFor(() => expect(called).toBe(true));
  });

  it('a refund version conflict (SALES_RETURN_013) calls onVersionConflict', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['sales_return:refund'],
    });
    useAuthStore.getState().setAccessToken(token);
    const onVersionConflict = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/sales-returns/refunds/refund-1/process`, () =>
        HttpResponse.json(errorEnvelope('SALES_RETURN_013', 'Hoàn tiền đã bị thay đổi'), {
          status: 409,
        }),
      ),
    );
    renderPanel({
      salesReturnStatus: 'RECEIVED',
      refunds: [buildRefund({ status: 'PENDING' })],
      onVersionConflict,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Xử lý' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xử lý' }));

    await waitFor(() => expect(onVersionConflict).toHaveBeenCalledWith('Hoàn tiền đã bị thay đổi'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has no accessibility violations with a refund list and create form', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['sales_return:refund'],
    });
    useAuthStore.getState().setAccessToken(token);
    const { container } = renderPanel({
      salesReturnStatus: 'RECEIVED',
      refunds: [buildRefund()],
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});
