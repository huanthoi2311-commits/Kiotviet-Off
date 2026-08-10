import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { SupplierTable } from './supplier-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildSupplier(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sup-1',
    code: 'NCC000001',
    taxCode: null,
    companyName: 'Công ty Đức An',
    contactName: null,
    phone: '0987654321',
    email: null,
    website: null,
    address: null,
    province: 'Hà Nội',
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

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SupplierTable />
    </QueryClientProvider>,
  );
}

describe('SupplierTable (T049 Phase R)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('shows an "Xem" link per row for a user with supplier:view, pointing at /suppliers/:id', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['supplier:view'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/suppliers`, () =>
        HttpResponse.json(envelope({ items: [buildSupplier()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Công ty Đức An');

    expect(screen.getByRole('link', { name: 'Xem' })).toHaveAttribute('href', '/suppliers/sup-1');
  });

  it('hides the "Xem" link for a user without supplier:view', async () => {
    server.use(
      http.get(`${API_BASE_URL}/suppliers`, () =>
        HttpResponse.json(envelope({ items: [buildSupplier()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Công ty Đức An');
    expect(screen.queryByRole('link', { name: 'Xem' })).not.toBeInTheDocument();
  });

  it('shows the "Xuất Excel" button for a user with supplier:export', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['supplier:export'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/suppliers`, () =>
        HttpResponse.json(envelope({ items: [buildSupplier()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Công ty Đức An');
    expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeInTheDocument();
  });

  it('hides the "Xuất Excel" button for a user without supplier:export', async () => {
    server.use(
      http.get(`${API_BASE_URL}/suppliers`, () =>
        HttpResponse.json(envelope({ items: [buildSupplier()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Công ty Đức An');
    expect(screen.queryByRole('button', { name: 'Xuất Excel' })).not.toBeInTheDocument();
  });

  it('ARCHIVED status filter returns archived rows (T049.05 backend fix)', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/suppliers`, ({ request }) => {
        lastUrl = new URL(request.url);
        const filteringArchived = lastUrl.searchParams.get('status') === 'ARCHIVED';
        const items = filteringArchived
          ? [buildSupplier({ status: 'ARCHIVED', deletedAt: '2026-02-01T00:00:00.000Z' })]
          : [buildSupplier()];
        return HttpResponse.json(envelope({ items, total: items.length, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Công ty Đức An');

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Đã lưu trữ' }));

    await waitFor(() => expect(lastUrl?.searchParams.get('status')).toBe('ARCHIVED'));
    expect(await screen.findByRole('cell', { name: 'ARCHIVED' })).toBeInTheDocument();
  });

  it('re-fetches with the province filter', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/suppliers`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(
          envelope({ items: [buildSupplier()], total: 1, page: 1, limit: 20 }),
        );
      }),
    );

    renderTable();
    await screen.findByText('Công ty Đức An');
    expect(lastUrl?.searchParams.get('province')).toBeNull();

    await userEvent.type(screen.getByPlaceholderText('Tỉnh/Thành'), 'Hà Nội');

    await waitFor(() => expect(lastUrl?.searchParams.get('province')).toBe('Hà Nội'));
  });

  it('renders the "nothing exists yet" empty state when no suppliers exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/suppliers`, () =>
        HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    expect(await screen.findByText('Chưa có nhà cung cấp nào')).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/suppliers`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { success: false, code: 'SUPPLIER_500', message: 'Đã xảy ra lỗi hệ thống', errors: [] },
            { status: 500 },
          );
        }
        return HttpResponse.json(
          envelope({ items: [buildSupplier()], total: 1, page: 1, limit: 20 }),
        );
      }),
    );

    renderTable();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Công ty Đức An')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/suppliers`, () =>
        HttpResponse.json(envelope({ items: [buildSupplier()], total: 1, page: 1, limit: 20 })),
      ),
    );

    const { container } = renderTable();
    await screen.findByText('Công ty Đức An');
    expect(await axe(container)).toHaveNoViolations();
  });
});
