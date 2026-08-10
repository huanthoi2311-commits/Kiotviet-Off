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
import { SupplierEditForm } from './supplier-edit-form';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const SUPPLIER_ID = 'sup-1';

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

function buildSupplier(overrides: Record<string, unknown> = {}) {
  return {
    id: SUPPLIER_ID,
    code: 'NCC000001',
    taxCode: null,
    companyName: 'Công ty Đức An',
    contactName: null,
    phone: '0987654321',
    email: null,
    website: null,
    address: null,
    province: null,
    district: null,
    ward: null,
    bankName: null,
    bankAccount: null,
    paymentTerm: null,
    creditLimit: null,
    status: 'ACTIVE',
    version: 1,
    note: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function buildDebt(overrides: Record<string, unknown> = {}) {
  return {
    supplierId: SUPPLIER_ID,
    supplierCode: 'NCC000001',
    supplierName: 'Công ty Đức An',
    totalDebt: '5000000',
    totalPaid: '2000000',
    balance: '3000000',
    ...overrides,
  };
}

function stubDebt(items: Record<string, unknown>[] = [buildDebt()]) {
  server.use(
    http.get(`${API_BASE_URL}/supplier-debt`, () =>
      HttpResponse.json(envelope({ items, total: items.length, page: 1, limit: 1 })),
    ),
  );
}

function stubSupplierProducts(items: Record<string, unknown>[] = []) {
  server.use(
    http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}/products`, () =>
      HttpResponse.json(envelope(items)),
    ),
  );
}

function stubProductSearch() {
  server.use(
    http.get(`${API_BASE_URL}/products`, () =>
      HttpResponse.json(
        envelope({
          items: [{ id: 'prod-1', name: 'Áo thun nam' }],
          total: 1,
          page: 1,
          limit: 100,
        }),
      ),
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
      <SupplierEditForm id={SUPPLIER_ID} />
    </QueryClientProvider>,
  );
}

describe('SupplierEditForm (T049 Phase T/U/W)', () => {
  beforeEach(async () => {
    useAuthStore.getState().clear();
    stubSupplierProducts();
    stubProductSearch();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the "not found" empty state for SUPPLIER_001', async () => {
    server.use(
      http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(errorEnvelope('SUPPLIER_001', 'Không tìm thấy nhà cung cấp'), {
          status: 404,
        }),
      ),
    );
    renderForm();
    expect(await screen.findByText('Không tìm thấy nhà cung cấp')).toBeInTheDocument();
  });

  it('renders a disabled read-only form for a user without supplier:update', async () => {
    server.use(
      http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(envelope(buildSupplier())),
      ),
    );
    renderForm();

    const companyNameInput = await screen.findByLabelText('Tên công ty');
    expect(companyNameInput).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
  });

  it('updates the supplier and sends the current version', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['supplier:update'],
    });
    useAuthStore.getState().setAccessToken(token);
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(envelope(buildSupplier({ version: 3 }))),
      ),
      http.patch(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildSupplier({ version: 4 })));
      }),
    );
    renderForm();

    await screen.findByDisplayValue('Công ty Đức An');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(capturedBody).toMatchObject({ version: 3 }));
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã cập nhật nhà cung cấp'));
  });

  it('a version conflict (SUPPLIER_009) on Edit shows the top-level "Tải lại" alert without discarding in-progress edits', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['supplier:update'],
    });
    useAuthStore.getState().setAccessToken(token);
    let getCallCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () => {
        getCallCount += 1;
        return HttpResponse.json(envelope(buildSupplier({ version: getCallCount })));
      }),
      http.patch(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(
          errorEnvelope('SUPPLIER_009', 'Nhà cung cấp vừa bị thay đổi bởi giao dịch khác'),
          { status: 409 },
        ),
      ),
    );
    renderForm();

    await screen.findByDisplayValue('Công ty Đức An');
    const companyNameInput = screen.getByLabelText('Tên công ty');
    await userEvent.clear(companyNameInput);
    await userEvent.type(companyNameInput, 'Tên đang gõ dở');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(
      await screen.findByText('Nhà cung cấp vừa bị thay đổi bởi giao dịch khác'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tên đang gõ dở')).toBeInTheDocument();

    const callsBeforeReload = getCallCount;
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại' }));

    await waitFor(() => expect(getCallCount).toBeGreaterThan(callsBeforeReload));
    expect(
      screen.queryByText('Nhà cung cấp vừa bị thay đổi bởi giao dịch khác'),
    ).not.toBeInTheDocument();
  });

  it('INACTIVE status shows only "Kích hoạt"', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: [
        'supplier:activate',
        'supplier:deactivate',
        'supplier:delete',
        'supplier:restore',
      ],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(envelope(buildSupplier({ status: 'INACTIVE' }))),
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
        'supplier:activate',
        'supplier:deactivate',
        'supplier:delete',
        'supplier:restore',
      ],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(envelope(buildSupplier({ status: 'ARCHIVED' }))),
      ),
    );
    renderForm();

    expect(await screen.findByRole('button', { name: 'Khôi phục' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kích hoạt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ngừng hoạt động' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu trữ' })).not.toBeInTheDocument();
  });

  it('clicking "Lưu trữ" that fails with SUPPLIER_004 (has Purchase Orders) shows the in-dialog guard message', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['supplier:delete'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(envelope(buildSupplier({ status: 'ACTIVE' }))),
      ),
      http.delete(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(
          errorEnvelope('SUPPLIER_004', 'Không thể lưu trữ nhà cung cấp đã có đơn nhập hàng'),
          { status: 422 },
        ),
      ),
    );
    renderForm();

    await userEvent.click(await screen.findByRole('button', { name: 'Lưu trữ' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu trữ' }));

    expect(
      await screen.findByText('Không thể lưu trữ nhà cung cấp đã có đơn nhập hàng'),
    ).toBeInTheDocument();
  });

  it('a version conflict (SUPPLIER_009) from a lifecycle action closes the dialog and shows the top-level alert', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['supplier:activate'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(envelope(buildSupplier({ status: 'INACTIVE' }))),
      ),
      http.post(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}/activate`, () =>
        HttpResponse.json(errorEnvelope('SUPPLIER_009', 'Phiên bản không khớp'), { status: 409 }),
      ),
    );
    renderForm();

    await userEvent.click(await screen.findByRole('button', { name: 'Kích hoạt' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Kích hoạt' }));

    expect(await screen.findByText('Phiên bản không khớp')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the Debt summary using backend-computed values directly, for a user with debt:view', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['debt:view'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(envelope(buildSupplier())),
      ),
    );
    stubDebt();
    renderForm();

    expect(await screen.findByText('5000000')).toBeInTheDocument();
    expect(screen.getByText('2000000')).toBeInTheDocument();
    expect(screen.getByText('3000000')).toBeInTheDocument();
  });

  it('hides the Debt section for a user without debt:view, without breaking the rest of Supplier Detail', async () => {
    server.use(
      http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(envelope(buildSupplier())),
      ),
    );
    renderForm();

    await screen.findByDisplayValue('Công ty Đức An');
    expect(screen.queryByText('Tổng phát sinh')).not.toBeInTheDocument();
  });

  it('lists Supplier-Product mappings, resolving product names via the Product search', async () => {
    server.use(
      http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(envelope(buildSupplier())),
      ),
    );
    stubSupplierProducts([
      {
        id: 'sp-1',
        supplierId: SUPPLIER_ID,
        productId: 'prod-1',
        supplierSku: 'SKU-01',
        priority: 0,
        defaultPrice: '9000',
        leadTime: null,
        minimumOrderQuantity: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    renderForm();

    expect(await screen.findByText('Áo thun nam')).toBeInTheDocument();
    expect(screen.getByText('SKU-01')).toBeInTheDocument();
  });

  it('assigning a product sends the expected payload', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['supplier:update'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(envelope(buildSupplier())),
      ),
    );
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}/products`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          envelope({
            id: 'sp-1',
            supplierId: SUPPLIER_ID,
            productId: 'prod-1',
            supplierSku: 'SKU-01',
            priority: null,
            defaultPrice: null,
            leadTime: null,
            minimumOrderQuantity: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          }),
          { status: 201 },
        );
      }),
    );
    renderForm();

    await screen.findByDisplayValue('Công ty Đức An');
    await userEvent.click(screen.getByRole('combobox', { name: 'Sản phẩm' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Áo thun nam' }));
    await userEvent.type(screen.getByLabelText('Mã NCC'), 'SKU-01');
    await userEvent.click(screen.getByRole('button', { name: 'Gán sản phẩm' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({ productId: 'prod-1', supplierSku: 'SKU-01' }),
    );
  });

  it('has no accessibility violations once loaded', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['supplier:update', 'debt:view'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/suppliers/${SUPPLIER_ID}`, () =>
        HttpResponse.json(envelope(buildSupplier())),
      ),
    );
    stubDebt();
    const { container } = renderForm();
    await screen.findByDisplayValue('Công ty Đức An');
    expect(await axe(container)).toHaveNoViolations();
  });
});
