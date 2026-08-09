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
import { CustomerEditForm } from './customer-edit-form';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const CUSTOMER_ID = 'cus-1';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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

function buildCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: CUSTOMER_ID,
    code: 'CUS000001',
    customerType: 'RETAIL',
    fullName: 'Nguyễn Văn A',
    phone: '0987654321',
    email: null,
    birthday: null,
    gender: null,
    taxCode: null,
    companyName: null,
    contactName: null,
    address: null,
    province: null,
    district: null,
    ward: null,
    avatar: null,
    note: null,
    creditLimit: null,
    paymentTermDays: null,
    currentDebt: '0',
    totalRevenue: '0',
    totalOrder: 0,
    totalPoint: 150,
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function stubPointHistory(items: Record<string, unknown>[] = []) {
  server.use(
    http.get(`${API_BASE_URL}/customer-point/history`, () =>
      HttpResponse.json(envelope(paginated(items))),
    ),
  );
}

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomerEditForm id={CUSTOMER_ID} />
    </QueryClientProvider>,
  );
}

describe('CustomerEditForm (T048 Phase R/S/T)', () => {
  beforeEach(async () => {
    useAuthStore.getState().clear();
    stubPointHistory();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the "not found" empty state for CUSTOMER_001', async () => {
    server.use(
      http.get(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(errorEnvelope('CUSTOMER_001', 'Không tìm thấy khách hàng'), {
          status: 404,
        }),
      ),
    );
    renderForm();
    expect(await screen.findByText('Không tìm thấy khách hàng')).toBeInTheDocument();
  });

  it('renders a disabled read-only form for a user without customer:update', async () => {
    server.use(
      http.get(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(envelope(buildCustomer())),
      ),
    );
    renderForm();

    const fullNameInput = await screen.findByLabelText('Tên khách hàng');
    expect(fullNameInput).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
  });

  it('updates the customer and sends the current version', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['customer:update'],
    });
    useAuthStore.getState().setAccessToken(token);
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(envelope(buildCustomer({ version: 3 }))),
      ),
      http.patch(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildCustomer({ version: 4 })));
      }),
    );
    renderForm();

    await screen.findByDisplayValue('Nguyễn Văn A');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ version: 3 }));
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã cập nhật khách hàng'));
  });

  it('a version conflict (CUSTOMER_005) on Edit shows the top-level "Tải lại" alert without discarding in-progress edits', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['customer:update'],
    });
    useAuthStore.getState().setAccessToken(token);
    let getCallCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () => {
        getCallCount += 1;
        return HttpResponse.json(envelope(buildCustomer({ version: getCallCount })));
      }),
      http.patch(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(
          errorEnvelope('CUSTOMER_005', 'Khách hàng vừa bị thay đổi bởi giao dịch khác'),
          { status: 409 },
        ),
      ),
    );
    renderForm();

    await screen.findByDisplayValue('Nguyễn Văn A');
    const fullNameInput = screen.getByLabelText('Tên khách hàng');
    await userEvent.clear(fullNameInput);
    await userEvent.type(fullNameInput, 'Tên đang gõ dở');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(
      await screen.findByText('Khách hàng vừa bị thay đổi bởi giao dịch khác'),
    ).toBeInTheDocument();
    // Edits are preserved until the user explicitly reloads (Brand's own precedent).
    expect(screen.getByDisplayValue('Tên đang gõ dở')).toBeInTheDocument();

    const callsBeforeReload = getCallCount;
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại' }));

    await waitFor(() => expect(getCallCount).toBeGreaterThan(callsBeforeReload));
    expect(
      screen.queryByText('Khách hàng vừa bị thay đổi bởi giao dịch khác'),
    ).not.toBeInTheDocument();
  });

  it('INACTIVE status shows only "Kích hoạt"', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: [
        'customer:activate',
        'customer:deactivate',
        'customer:delete',
        'customer:restore',
      ],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(envelope(buildCustomer({ status: 'INACTIVE' }))),
      ),
    );
    renderForm();

    expect(await screen.findByRole('button', { name: 'Kích hoạt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ngừng hoạt động' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Khôi phục' })).not.toBeInTheDocument();
  });

  it('ARCHIVED status shows only "Khôi phục"', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: [
        'customer:activate',
        'customer:deactivate',
        'customer:delete',
        'customer:restore',
      ],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(envelope(buildCustomer({ status: 'ARCHIVED' }))),
      ),
    );
    renderForm();

    expect(await screen.findByRole('button', { name: 'Khôi phục' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kích hoạt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ngừng hoạt động' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu trữ' })).not.toBeInTheDocument();
  });

  it('clicking "Kích hoạt" opens the dialog and sends the current version', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['customer:activate'],
    });
    useAuthStore.getState().setAccessToken(token);
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(envelope(buildCustomer({ status: 'INACTIVE', version: 5 }))),
      ),
      http.post(`${API_BASE_URL}/customers/${CUSTOMER_ID}/activate`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildCustomer({ status: 'ACTIVE', version: 6 })));
      }),
    );
    renderForm();

    await userEvent.click(await screen.findByRole('button', { name: 'Kích hoạt' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Kích hoạt' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ version: 5 }));
  });

  it('a version conflict (CUSTOMER_005) from a lifecycle action closes the dialog and shows the top-level alert', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['customer:delete'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(envelope(buildCustomer({ status: 'ACTIVE' }))),
      ),
      http.delete(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(errorEnvelope('CUSTOMER_005', 'Phiên bản không khớp'), { status: 409 }),
      ),
    );
    renderForm();

    await userEvent.click(await screen.findByRole('button', { name: 'Lưu trữ' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu trữ' }));

    expect(await screen.findByText('Phiên bản không khớp')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows Customer.totalPoint as the current balance for a user with point:view', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['point:view'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(envelope(buildCustomer({ totalPoint: 150 }))),
      ),
    );
    renderForm();

    expect(await screen.findByText('150')).toBeInTheDocument();
  });

  it('shows point history for a user with point:view', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['point:view'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(envelope(buildCustomer())),
      ),
    );
    stubPointHistory([
      {
        id: 'ledger-1',
        customerId: CUSTOMER_ID,
        referenceType: 'CHECKOUT',
        referenceId: null,
        point: -50,
        balance: 150,
        expiredAt: null,
        createdAt: '2026-01-05T00:00:00.000Z',
      },
    ]);
    renderForm();

    expect(await screen.findByText('-50')).toBeInTheDocument();
    expect(screen.getByText('CHECKOUT')).toBeInTheDocument();
  });

  it('hides the point history section for a user without point:view, without breaking the rest of Customer Detail', async () => {
    server.use(
      http.get(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(envelope(buildCustomer())),
      ),
    );
    renderForm();

    await screen.findByDisplayValue('Nguyễn Văn A');
    expect(screen.queryByText('Chưa có lịch sử điểm')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('links to the filtered Invoice list for this customer', async () => {
    server.use(
      http.get(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(envelope(buildCustomer())),
      ),
    );
    renderForm();

    expect(
      await screen.findByRole('link', { name: 'Xem hóa đơn của khách hàng này' }),
    ).toHaveAttribute('href', `/invoices?customerId=${CUSTOMER_ID}`);
  });

  it('has no accessibility violations once loaded', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['customer:update', 'point:view'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/customers/${CUSTOMER_ID}`, () =>
        HttpResponse.json(envelope(buildCustomer())),
      ),
    );
    const { container } = renderForm();
    await screen.findByDisplayValue('Nguyễn Văn A');
    expect(await axe(container)).toHaveNoViolations();
  });
});
