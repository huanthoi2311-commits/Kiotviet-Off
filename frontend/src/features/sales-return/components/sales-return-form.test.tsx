import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { SalesReturnCreateForm } from './sales-return-form';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const INVOICE_ID = 'inv-1';

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

function buildInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    branchId: 'branch-1',
    orderId: null,
    customerId: null,
    code: 'HD0001',
    status: 'PAID',
    totalAmount: '150000',
    paidAmount: '150000',
    dueAmount: '0',
    dueDate: null,
    customerCodeSnapshot: null,
    customerNameSnapshot: null,
    customerPhoneSnapshot: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    items: [
      {
        id: 'invitem-1',
        productId: 'prod-1',
        quantity: '2',
        unitPrice: '75000',
        discount: '0',
        taxAmount: '0',
        totalAmount: '150000',
        productCodeSnapshot: 'SP001',
        productNameSnapshot: 'Áo thun nam',
        unitNameSnapshot: 'Cái',
        barcodeId: null,
        barcodeSnapshot: null,
      },
    ],
    ...overrides,
  };
}

function buildEligibility(overrides: Record<string, unknown> = {}) {
  return [
    { invoiceItemId: 'invitem-1', soldQty: '2', returnedQty: '0', eligibleQty: '2', ...overrides },
  ];
}

function buildSalesReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sr-new-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    invoiceId: INVOICE_ID,
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
    items: [],
    refunds: [],
    ...overrides,
  };
}

function stubInvoiceAndEligibility(invoice = buildInvoice(), eligibility = buildEligibility()) {
  server.use(
    http.get(`${API_BASE_URL}/invoices/${INVOICE_ID}`, () => HttpResponse.json(envelope(invoice))),
    http.get(`${API_BASE_URL}/sales-returns/eligibility`, () =>
      HttpResponse.json(envelope(eligibility)),
    ),
  );
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'wh-1', name: 'Kho trung tâm' }]))),
    ),
  );
}

function renderForm(invoiceId: string | undefined) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SalesReturnCreateForm invoiceId={invoiceId} />
    </QueryClientProvider>,
  );
}

describe('SalesReturnCreateForm (T047 §6/§7)', () => {
  beforeEach(async () => {
    push.mockClear();
    stubRelationLists();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows a guidance empty state when no invoiceId is provided', () => {
    renderForm(undefined);
    expect(screen.getByText('Chưa chọn hóa đơn')).toBeInTheDocument();
  });

  it('shows a "invoice cancelled" empty state for a CANCELLED invoice', async () => {
    stubInvoiceAndEligibility(buildInvoice({ status: 'CANCELLED' }));
    renderForm(INVOICE_ID);
    expect(await screen.findByText('Hóa đơn đã hủy')).toBeInTheDocument();
  });

  it('renders the invoice code and the eligible-quantity hint from the advisory endpoint', async () => {
    stubInvoiceAndEligibility();
    renderForm(INVOICE_ID);

    expect(await screen.findByDisplayValue('HD0001')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Dòng hàng' }));
    expect(
      await screen.findByRole('option', { name: /Áo thun nam — còn có thể trả 2/ }),
    ).toBeInTheDocument();
  });

  it('submits the expected payload and navigates to the detail page on success', async () => {
    stubInvoiceAndEligibility();
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API_BASE_URL}/sales-returns`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(envelope(buildSalesReturn()), { status: 201 });
      }),
    );

    renderForm(INVOICE_ID);
    await screen.findByDisplayValue('HD0001');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Dòng hàng' }));
    await user.click(await screen.findByRole('option', { name: /Áo thun nam/ }));
    await user.clear(screen.getByLabelText('Số lượng trả'));
    await user.type(screen.getByLabelText('Số lượng trả'), '1');
    await user.click(screen.getByRole('button', { name: 'Tạo phiếu trả hàng' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        invoiceId: INVOICE_ID,
        items: [{ invoiceItemId: 'invitem-1', quantity: 1, reason: 'DAMAGED' }],
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sales-returns/sr-new-1'));
  }, 20000);

  it('requires a reason note when reason is "Khác"', async () => {
    stubInvoiceAndEligibility();
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/sales-returns`, () => {
        called = true;
        return HttpResponse.json(envelope(buildSalesReturn()), { status: 201 });
      }),
    );

    renderForm(INVOICE_ID);
    await screen.findByDisplayValue('HD0001');
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Dòng hàng' }));
    await user.click(await screen.findByRole('option', { name: /Áo thun nam/ }));
    await user.click(screen.getByRole('combobox', { name: 'Lý do' }));
    await user.click(await screen.findByRole('option', { name: 'Khác' }));
    await user.click(screen.getByRole('button', { name: 'Tạo phiếu trả hàng' }));

    expect(await screen.findByText('Vui lòng nhập lý do khi chọn "Khác"')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('SALES_RETURN_004 (qty exceeded, server-side) surfaces as a root-level error', async () => {
    stubInvoiceAndEligibility();
    server.use(
      http.post(`${API_BASE_URL}/sales-returns`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'SALES_RETURN_004',
            message: 'Số lượng trả vượt quá số lượng còn có thể trả',
            errors: [],
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 422 },
        ),
      ),
    );

    renderForm(INVOICE_ID);
    await screen.findByDisplayValue('HD0001');
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Dòng hàng' }));
    await user.click(await screen.findByRole('option', { name: /Áo thun nam/ }));
    await user.click(screen.getByRole('button', { name: 'Tạo phiếu trả hàng' }));

    expect(
      await screen.findByText('Số lượng trả vượt quá số lượng còn có thể trả'),
    ).toBeInTheDocument();
  });

  it('has no accessibility violations once loaded', async () => {
    stubInvoiceAndEligibility();
    const { container } = renderForm(INVOICE_ID);
    await screen.findByDisplayValue('HD0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
