import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { SalesReturnTable } from './sales-return-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function buildSalesReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sr-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    invoiceId: 'inv-1',
    customerId: null,
    code: 'TH0001',
    status: 'DRAFT',
    totalAmount: '50000',
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
      <SalesReturnTable />
    </QueryClientProvider>,
  );
}

describe('SalesReturnTable (T047 §4)', () => {
  beforeEach(() => {
    stubRelationLists();
  });

  it('shows the customer name (resolved via lookup) and status for each row', async () => {
    server.use(
      http.get(`${API_BASE_URL}/sales-returns`, () =>
        HttpResponse.json(envelope(paginated([buildSalesReturn({ customerId: 'cust-1' })]))),
      ),
    );
    renderTable();

    await screen.findByText('TH0001');
    const row = screen.getByRole('row', { name: /TH0001/ });
    expect(within(row).getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(within(row).getByText('Nháp')).toBeInTheDocument();
  });

  it('shows "Khách lẻ" when there is no customer', async () => {
    server.use(
      http.get(`${API_BASE_URL}/sales-returns`, () =>
        HttpResponse.json(envelope(paginated([buildSalesReturn()]))),
      ),
    );
    renderTable();

    await screen.findByText('TH0001');
    const row = screen.getByRole('row', { name: /TH0001/ });
    expect(within(row).getByText('Khách lẻ')).toBeInTheDocument();
  });

  it('re-fetches with the selected status filter', async () => {
    let lastStatus: string | null = null;
    server.use(
      http.get(`${API_BASE_URL}/sales-returns`, ({ request }) => {
        lastStatus = new URL(request.url).searchParams.get('status');
        return HttpResponse.json(envelope(paginated([buildSalesReturn()])));
      }),
    );

    renderTable();
    await screen.findByText('TH0001');
    expect(lastStatus).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Hoàn tất' }));

    await waitFor(() => expect(lastStatus).toBe('COMPLETED'));
  });

  it('renders the empty state when no returns exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/sales-returns`, () => HttpResponse.json(envelope(paginated([])))),
    );
    renderTable();
    expect(await screen.findByText('Chưa có phiếu trả hàng nào')).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/sales-returns`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            {
              success: false,
              code: 'SALES_RETURN_500',
              message: 'Đã xảy ra lỗi hệ thống',
              errors: [],
            },
            { status: 500 },
          );
        }
        return HttpResponse.json(envelope(paginated([buildSalesReturn()])));
      }),
    );

    renderTable();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('TH0001')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/sales-returns`, () =>
        HttpResponse.json(envelope(paginated([buildSalesReturn()]))),
      ),
    );
    const { container } = renderTable();
    await screen.findByText('TH0001');
    expect(await axe(container)).toHaveNoViolations();
  });
});
