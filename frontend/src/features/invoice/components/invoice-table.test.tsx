import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { InvoiceTable } from './invoice-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
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
    items: [],
    ...overrides,
  };
}

function stubRelationLists() {
  server.use(
    http.get(`${API_BASE_URL}/customers`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'cust-1', fullName: 'Nguyễn Văn A' }]))),
    ),
  );
}

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InvoiceTable />
    </QueryClientProvider>,
  );
}

describe('InvoiceTable (T046 §6)', () => {
  beforeEach(() => {
    stubRelationLists();
  });

  it('shows the customerNameSnapshot directly, with no live customer lookup needed', async () => {
    server.use(
      http.get(`${API_BASE_URL}/invoices`, () =>
        HttpResponse.json(
          envelope(
            paginated([buildInvoice({ customerId: 'cust-1', customerNameSnapshot: 'Trần Thị B' })]),
          ),
        ),
      ),
    );
    renderTable();

    await screen.findByText('HD0001');
    const row = screen.getByRole('row', { name: /HD0001/ });
    expect(within(row).getByText('Trần Thị B')).toBeInTheDocument();
  });

  it('shows "Khách lẻ" when the invoice has no customer at all', async () => {
    server.use(
      http.get(`${API_BASE_URL}/invoices`, () =>
        HttpResponse.json(envelope(paginated([buildInvoice()]))),
      ),
    );
    renderTable();

    await screen.findByText('HD0001');
    const row = screen.getByRole('row', { name: /HD0001/ });
    expect(within(row).getByText('Khách lẻ')).toBeInTheDocument();
  });

  it('re-fetches with the selected customer filter', async () => {
    let lastCustomerId: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/invoices`, ({ request }) => {
        lastCustomerId = new URL(request.url).searchParams.get('customerId');
        return HttpResponse.json(envelope(paginated([buildInvoice()])));
      }),
    );

    renderTable();
    await screen.findByText('HD0001');
    expect(lastCustomerId).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo khách hàng' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Nguyễn Văn A' }));

    await waitFor(() => expect(lastCustomerId).toBe('cust-1'));
  });

  it('renders the empty state when no invoices exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/invoices`, () => HttpResponse.json(envelope(paginated([])))),
    );
    renderTable();
    expect(await screen.findByText('Chưa có hóa đơn nào')).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/invoices`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { success: false, code: 'INVOICE_500', message: 'Đã xảy ra lỗi hệ thống', errors: [] },
            { status: 500 },
          );
        }
        return HttpResponse.json(envelope(paginated([buildInvoice()])));
      }),
    );

    renderTable();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('HD0001')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/invoices`, () =>
        HttpResponse.json(envelope(paginated([buildInvoice()]))),
      ),
    );
    const { container } = renderTable();
    await screen.findByText('HD0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
