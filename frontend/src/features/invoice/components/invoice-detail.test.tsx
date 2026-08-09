import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { InvoiceDetail } from './invoice-detail';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const INVOICE_ID = 'inv-1';

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
        id: 'item-1',
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

function buildPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    branchId: 'branch-1',
    invoiceId: INVOICE_ID,
    customerId: null,
    method: 'CASH',
    amount: '150000',
    paidAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/branches`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'branch-1', name: 'Chi nhánh 1' }]))),
    ),
    http.get(`${API_BASE_URL}/payments`, () => HttpResponse.json(envelope([buildPayment()]))),
  );
}

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InvoiceDetail id={INVOICE_ID} />
    </QueryClientProvider>,
  );
}

describe('InvoiceDetail (T046 §6/§11)', () => {
  beforeEach(() => {
    stubRelationLists();
  });

  it('shows the "not found" empty state for INVOICE_001', async () => {
    server.use(
      http.get(`${API_BASE_URL}/invoices/${INVOICE_ID}`, () =>
        HttpResponse.json(errorEnvelope('INVOICE_001', 'Không tìm thấy hóa đơn'), { status: 404 }),
      ),
    );
    renderDetail();
    expect(await screen.findByText('Không tìm thấy hóa đơn')).toBeInTheDocument();
  });

  it('renders item snapshot fields directly, with no product relation lookup needed', async () => {
    server.use(
      http.get(`${API_BASE_URL}/invoices/${INVOICE_ID}`, () =>
        HttpResponse.json(envelope(buildInvoice())),
      ),
    );
    renderDetail();

    expect(await screen.findByText('Áo thun nam')).toBeInTheDocument();
    expect(screen.getByText('Cái')).toBeInTheDocument();
  });

  it('shows payment info fetched via GET /payments?invoiceId=', async () => {
    server.use(
      http.get(`${API_BASE_URL}/invoices/${INVOICE_ID}`, () =>
        HttpResponse.json(envelope(buildInvoice())),
      ),
    );
    renderDetail();

    expect(await screen.findByText('Tiền mặt')).toBeInTheDocument();
  });

  it('shows "Khách lẻ" when the invoice has no customer', async () => {
    server.use(
      http.get(`${API_BASE_URL}/invoices/${INVOICE_ID}`, () =>
        HttpResponse.json(envelope(buildInvoice())),
      ),
    );
    renderDetail();

    expect(await screen.findByText('Khách lẻ')).toBeInTheDocument();
  });

  it('has no accessibility violations once loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/invoices/${INVOICE_ID}`, () =>
        HttpResponse.json(envelope(buildInvoice())),
      ),
    );
    const { container } = renderDetail();
    await screen.findByText('HD0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
