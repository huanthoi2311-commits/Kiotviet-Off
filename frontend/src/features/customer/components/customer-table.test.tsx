import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { CustomerTable } from './customer-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cus-1',
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
    totalPoint: 0,
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomerTable />
    </QueryClientProvider>,
  );
}

describe('CustomerTable (T048 Phase P)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('shows an "Xem" link per row for a user with customer:view, pointing at /customers/:id', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['customer:view'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/customers`, () =>
        HttpResponse.json(envelope({ items: [buildCustomer()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Nguyễn Văn A');

    expect(screen.getByRole('link', { name: 'Xem' })).toHaveAttribute('href', '/customers/cus-1');
  });

  it('hides the "Xem" link for a user without customer:view', async () => {
    server.use(
      http.get(`${API_BASE_URL}/customers`, () =>
        HttpResponse.json(envelope({ items: [buildCustomer()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Nguyễn Văn A');
    expect(screen.queryByRole('link', { name: 'Xem' })).not.toBeInTheDocument();
  });

  it('ARCHIVED status filter returns archived rows (T048.05 backend fix)', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/customers`, ({ request }) => {
        lastUrl = new URL(request.url);
        const filteringArchived = lastUrl.searchParams.get('status') === 'ARCHIVED';
        const items = filteringArchived
          ? [buildCustomer({ status: 'ARCHIVED', deletedAt: '2026-02-01T00:00:00.000Z' })]
          : [buildCustomer()];
        return HttpResponse.json(envelope({ items, total: items.length, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Nguyễn Văn A');

    const [statusCombobox] = screen.getAllByRole('combobox');
    await userEvent.click(statusCombobox);
    await userEvent.click(await screen.findByRole('option', { name: 'Đã lưu trữ' }));

    await waitFor(() => expect(lastUrl?.searchParams.get('status')).toBe('ARCHIVED'));
    expect(await screen.findByRole('cell', { name: 'ARCHIVED' })).toBeInTheDocument();
  });

  it('re-fetches with the selected customerType filter', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/customers`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(
          envelope({ items: [buildCustomer()], total: 1, page: 1, limit: 20 }),
        );
      }),
    );

    renderTable();
    await screen.findByText('Nguyễn Văn A');
    expect(lastUrl?.searchParams.get('customerType')).toBeNull();

    const [, customerTypeCombobox] = screen.getAllByRole('combobox');
    await userEvent.click(customerTypeCombobox);
    await userEvent.click(await screen.findByRole('option', { name: 'VIP' }));

    await waitFor(() => expect(lastUrl?.searchParams.get('customerType')).toBe('VIP'));
  });

  it('renders skeleton rows while loading', () => {
    server.use(
      http.get(`${API_BASE_URL}/customers`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 }));
      }),
    );

    const { container } = renderTable();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('renders the "nothing exists yet" empty state when no customers exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/customers`, () =>
        HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    expect(await screen.findByText('Chưa có khách hàng nào')).toBeInTheDocument();
  });

  it('renders the "no results" empty state when a search filter yields nothing', async () => {
    server.use(
      http.get(`${API_BASE_URL}/customers`, ({ request }) => {
        const url = new URL(request.url);
        const items = url.searchParams.get('search') ? [] : [buildCustomer()];
        return HttpResponse.json(envelope({ items, total: items.length, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Nguyễn Văn A');

    await userEvent.type(screen.getByRole('textbox'), 'không tồn tại');
    expect(await screen.findByText('Không có kết quả', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/customers`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { success: false, code: 'CUSTOMER_500', message: 'Đã xảy ra lỗi hệ thống', errors: [] },
            { status: 500 },
          );
        }
        return HttpResponse.json(
          envelope({ items: [buildCustomer()], total: 1, page: 1, limit: 20 }),
        );
      }),
    );

    renderTable();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Nguyễn Văn A')).toBeInTheDocument();
  });

  it('renders customer rows with the expected columns, and calls the API with server-driven pagination', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/customers`, ({ request }) => {
        lastUrl = new URL(request.url);
        const page = Number(lastUrl.searchParams.get('page') ?? '1');
        return HttpResponse.json(
          envelope({
            items: [buildCustomer({ id: `cus-${page}`, fullName: `Khách hàng trang ${page}` })],
            total: 25,
            page,
            limit: 20,
          }),
        );
      }),
    );

    renderTable();
    expect(await screen.findByText('Khách hàng trang 1')).toBeInTheDocument();
    expect(screen.getByText('CUS000001')).toBeInTheDocument();
    expect(lastUrl?.searchParams.get('limit')).toBe('20');

    await userEvent.click(screen.getByRole('button', { name: 'Sau' }));
    expect(await screen.findByText('Khách hàng trang 2')).toBeInTheDocument();
    expect(lastUrl?.searchParams.get('page')).toBe('2');
  });

  it('toggles server-driven sort order when a sortable column header is clicked', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/customers`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(
          envelope({ items: [buildCustomer()], total: 1, page: 1, limit: 20 }),
        );
      }),
    );

    renderTable();
    await screen.findByText('Nguyễn Văn A');
    expect(lastUrl?.searchParams.get('sortBy')).toBe('fullName');
    expect(lastUrl?.searchParams.get('sortOrder')).toBe('asc');

    await userEvent.click(screen.getByRole('button', { name: /Mã/ }));
    await waitFor(() => expect(lastUrl?.searchParams.get('sortBy')).toBe('code'));
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/customers`, () =>
        HttpResponse.json(envelope({ items: [buildCustomer()], total: 1, page: 1, limit: 20 })),
      ),
    );

    const { container } = renderTable();
    await screen.findByText('Nguyễn Văn A');
    expect(await axe(container)).toHaveNoViolations();
  });
});
