import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { BrandTable } from './brand-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrandTable />
    </QueryClientProvider>,
  );
}

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildBrand(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    code: 'NIKE',
    name: 'Nike',
    logo: null,
    description: null,
    website: null,
    country: 'USA',
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('BrandTable (T041 Phase C/F)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('shows a "Sửa" link per row for a user with brand:update, pointing at /brands/:id', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['brand:update'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/brands`, () =>
        HttpResponse.json(envelope({ items: [buildBrand()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Nike');

    expect(screen.getByRole('link', { name: 'Sửa' })).toHaveAttribute(
      'href',
      '/brands/a1b2c3d4-0000-0000-0000-000000000001',
    );
  });

  it('hides the "Sửa" link for a user without brand:update', async () => {
    server.use(
      http.get(`${API_BASE_URL}/brands`, () =>
        HttpResponse.json(envelope({ items: [buildBrand()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Nike');

    expect(screen.queryByRole('link', { name: 'Sửa' })).not.toBeInTheDocument();
  });

  it('shows a "Lưu trữ" button per row for a user with brand:delete', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['brand:delete'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/brands`, () =>
        HttpResponse.json(envelope({ items: [buildBrand()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Nike');

    expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeInTheDocument();
  });

  it('hides the "Lưu trữ" button for a user without brand:delete', async () => {
    server.use(
      http.get(`${API_BASE_URL}/brands`, () =>
        HttpResponse.json(envelope({ items: [buildBrand()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Nike');

    expect(screen.queryByRole('button', { name: 'Lưu trữ' })).not.toBeInTheDocument();
  });

  it('clicking "Lưu trữ" opens the archive confirmation dialog for that row\'s brand', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['brand:delete'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/brands`, () =>
        HttpResponse.json(envelope({ items: [buildBrand()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Nike');

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    expect(screen.getByText('Lưu trữ thương hiệu?')).toBeInTheDocument();
    expect(screen.getByText(/"Nike"/)).toBeInTheDocument();
  });

  it('the "Hiển thị đã lưu trữ" checkbox sends archived=true to the API (T041.05)', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/brands`, ({ request }) => {
        lastUrl = new URL(request.url);
        const showingArchived = lastUrl.searchParams.get('archived') === 'true';
        const items = showingArchived
          ? [buildBrand({ name: 'Adidas (đã lưu trữ)' })]
          : [buildBrand()];
        return HttpResponse.json(envelope({ items, total: items.length, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Nike');
    // Sent explicitly as `false` by default (not omitted) — behaviorally
    // identical to omitted per the backend contract (T041.05 AD-1).
    expect(lastUrl?.searchParams.get('archived')).toBe('false');

    await userEvent.click(screen.getByLabelText('Hiển thị đã lưu trữ'));

    await waitFor(() => expect(lastUrl?.searchParams.get('archived')).toBe('true'));
    // Before T041.05, the backend unconditionally filtered deletedAt:null,
    // so an archived=true request could never return a soft-deleted row.
    // This MSW mock only returns the archived-marked row once archived=true
    // is actually sent — the row appearing is direct evidence.
    expect(await screen.findByText('Adidas (đã lưu trữ)')).toBeInTheDocument();
  });

  it('when "archived" is on, every row shows only "Khôi phục" — "Sửa"/"Lưu trữ" are hidden even with brand:update/brand:delete', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['brand:update', 'brand:delete', 'brand:restore'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/brands`, ({ request }) => {
        const url = new URL(request.url);
        const showingArchived = url.searchParams.get('archived') === 'true';
        const items = showingArchived ? [buildBrand()] : [buildBrand({ id: 'other' })];
        return HttpResponse.json(envelope({ items, total: items.length, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Nike');
    expect(screen.getByRole('link', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Khôi phục' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Hiển thị đã lưu trữ'));
    await screen.findByText('Nike');

    expect(screen.queryByRole('link', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu trữ' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khôi phục' })).toBeInTheDocument();
  });

  it('hides "Khôi phục" when archived is on for a user without brand:restore', async () => {
    server.use(
      http.get(`${API_BASE_URL}/brands`, () =>
        HttpResponse.json(envelope({ items: [buildBrand()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Nike');
    await userEvent.click(screen.getByLabelText('Hiển thị đã lưu trữ'));
    await screen.findByText('Nike');

    expect(screen.queryByRole('button', { name: 'Khôi phục' })).not.toBeInTheDocument();
  });

  it('clicking "Khôi phục" opens the restore confirmation dialog for that row\'s brand', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['brand:restore'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/brands`, () =>
        HttpResponse.json(envelope({ items: [buildBrand()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Nike');
    await userEvent.click(screen.getByLabelText('Hiển thị đã lưu trữ'));
    await screen.findByText('Nike');

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    expect(screen.getByText('Khôi phục thương hiệu?')).toBeInTheDocument();
    expect(screen.getByText(/"Nike"/)).toBeInTheDocument();
  });

  it('renders skeleton rows while loading', () => {
    server.use(
      http.get(`${API_BASE_URL}/brands`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 }));
      }),
    );

    const { container } = renderTable();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('renders the "nothing exists yet" empty state when no brands exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/brands`, () =>
        HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    expect(await screen.findByText('Chưa có thương hiệu nào')).toBeInTheDocument();
  });

  it('renders the "no results" empty state when a search filter yields nothing', async () => {
    server.use(
      http.get(`${API_BASE_URL}/brands`, ({ request }) => {
        const url = new URL(request.url);
        const items = url.searchParams.get('search') ? [] : [buildBrand()];
        return HttpResponse.json(envelope({ items, total: items.length, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Nike');

    await userEvent.type(screen.getByRole('textbox'), 'không tồn tại');
    expect(await screen.findByText('Không có kết quả', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/brands`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { success: false, code: 'BRAND_500', message: 'Đã xảy ra lỗi hệ thống', errors: [] },
            { status: 500 },
          );
        }
        return HttpResponse.json(envelope({ items: [buildBrand()], total: 1, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Nike')).toBeInTheDocument();
  });

  it('renders brand rows with the expected columns, and calls the API with server-driven pagination', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/brands`, ({ request }) => {
        lastUrl = new URL(request.url);
        const page = Number(lastUrl.searchParams.get('page') ?? '1');
        return HttpResponse.json(
          envelope({
            items: [buildBrand({ id: `b-${page}`, name: `Thương hiệu trang ${page}` })],
            total: 25,
            page,
            limit: 20,
          }),
        );
      }),
    );

    renderTable();
    expect(await screen.findByText('Thương hiệu trang 1')).toBeInTheDocument();
    expect(screen.getByText('NIKE')).toBeInTheDocument();
    expect(screen.getByText('USA')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(lastUrl?.searchParams.get('limit')).toBe('20');

    await userEvent.click(screen.getByRole('button', { name: 'Sau' }));
    expect(await screen.findByText('Thương hiệu trang 2')).toBeInTheDocument();
    expect(lastUrl?.searchParams.get('page')).toBe('2');
  });

  it('re-fetches with the selected status filter, independent of the archived filter', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/brands`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(envelope({ items: [buildBrand()], total: 1, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Nike');
    expect(lastUrl?.searchParams.get('status')).toBeNull();

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Đang hoạt động' }));

    await waitFor(() => expect(lastUrl?.searchParams.get('status')).toBe('ACTIVE'));
    // status has no ARCHIVED value for Brand (unlike Category) — confirm it
    // never appears as an option.
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('option', { name: 'Đã lưu trữ' })).not.toBeInTheDocument();
  });

  it('toggles server-driven sort order when a sortable column header is clicked', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/brands`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(envelope({ items: [buildBrand()], total: 1, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Nike');
    expect(lastUrl?.searchParams.get('sortBy')).toBe('name');
    expect(lastUrl?.searchParams.get('sortOrder')).toBe('asc');

    await userEvent.click(screen.getByRole('button', { name: /Mã/ }));
    await waitFor(() => expect(lastUrl?.searchParams.get('sortBy')).toBe('code'));
    expect(lastUrl?.searchParams.get('sortOrder')).toBe('asc');
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/brands`, () =>
        HttpResponse.json(envelope({ items: [buildBrand()], total: 1, page: 1, limit: 20 })),
      ),
    );

    const { container } = renderTable();
    await screen.findByText('Nike');
    expect(await axe(container)).toHaveNoViolations();
  });
});
