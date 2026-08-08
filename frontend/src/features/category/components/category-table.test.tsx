import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { CategoryTable } from './category-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoryTable />
    </QueryClientProvider>,
  );
}

/** Backend's `TransformInterceptor` envelope — `apiClientMutator` double-unwraps it. */
function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    parentId: null,
    code: 'THOI-TRANG',
    name: 'Thời trang',
    slug: 'thoi-trang',
    description: null,
    imageUrl: null,
    sortOrder: 0,
    isActive: true,
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('CategoryTable (T035.10 + T037.10 Edit link + T038.10 Archive action + T039 Restore action)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('shows a "Sửa" link per row for a user with category:update, pointing at /categories/:id', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:update'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(envelope({ items: [buildCategory()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Thời trang');

    expect(screen.getByRole('link', { name: 'Sửa' })).toHaveAttribute(
      'href',
      '/categories/a1b2c3d4-0000-0000-0000-000000000001',
    );
  });

  it('hides the "Sửa" link for a user without category:update', async () => {
    server.use(
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(envelope({ items: [buildCategory()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Thời trang');

    expect(screen.queryByRole('link', { name: 'Sửa' })).not.toBeInTheDocument();
  });

  it('shows a "Lưu trữ" button per row for a user with category:delete', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:delete'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(envelope({ items: [buildCategory()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Thời trang');

    expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeInTheDocument();
  });

  it('hides the "Lưu trữ" button for a user without category:delete', async () => {
    server.use(
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(envelope({ items: [buildCategory()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Thời trang');

    expect(screen.queryByRole('button', { name: 'Lưu trữ' })).not.toBeInTheDocument();
  });

  it('clicking "Lưu trữ" opens the archive confirmation dialog for that row\'s category', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:delete'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(envelope({ items: [buildCategory()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Thời trang');

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    expect(screen.getByText('Lưu trữ danh mục?')).toBeInTheDocument();
    expect(screen.getByText(/"Thời trang"/)).toBeInTheDocument();
  });

  it('ARCHIVED rows show only "Khôi phục" — "Sửa" and "Lưu trữ" are hidden even with category:update/category:delete (T039 AD-3)', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:update', 'category:delete', 'category:restore'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(
          envelope({
            items: [buildCategory({ status: 'ARCHIVED', deletedAt: '2026-02-01T00:00:00.000Z' })],
            total: 1,
            page: 1,
            limit: 20,
          }),
        ),
      ),
    );

    renderTable();
    await screen.findByText('Thời trang');

    expect(screen.queryByRole('link', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu trữ' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khôi phục' })).toBeInTheDocument();
  });

  it('non-archived rows never show "Khôi phục", even with category:restore', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:restore', 'category:update', 'category:delete'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(envelope({ items: [buildCategory()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Thời trang');

    expect(screen.queryByRole('button', { name: 'Khôi phục' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeInTheDocument();
  });

  it('hides "Khôi phục" on an ARCHIVED row for a user without category:restore', async () => {
    server.use(
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(
          envelope({
            items: [buildCategory({ status: 'ARCHIVED', deletedAt: '2026-02-01T00:00:00.000Z' })],
            total: 1,
            page: 1,
            limit: 20,
          }),
        ),
      ),
    );

    renderTable();
    await screen.findByText('Thời trang');

    expect(screen.queryByRole('button', { name: 'Khôi phục' })).not.toBeInTheDocument();
  });

  it('clicking "Khôi phục" opens the restore confirmation dialog for that row\'s category', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:restore'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(
          envelope({
            items: [buildCategory({ status: 'ARCHIVED', deletedAt: '2026-02-01T00:00:00.000Z' })],
            total: 1,
            page: 1,
            limit: 20,
          }),
        ),
      ),
    );

    renderTable();
    await screen.findByText('Thời trang');

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    expect(screen.getByText('Khôi phục danh mục?')).toBeInTheDocument();
    expect(screen.getByText(/"Thời trang"/)).toBeInTheDocument();
  });

  it('ARCHIVED status filter returns archived rows (regression check for the T038.05 backend fix)', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/categories`, ({ request }) => {
        lastUrl = new URL(request.url);
        const filteringArchived = lastUrl.searchParams.get('status') === 'ARCHIVED';
        const items = filteringArchived
          ? [buildCategory({ status: 'ARCHIVED', deletedAt: '2026-02-01T00:00:00.000Z' })]
          : [buildCategory()];
        return HttpResponse.json(envelope({ items, total: items.length, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Thời trang');

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Đã lưu trữ' }));

    await waitFor(() => expect(lastUrl?.searchParams.get('status')).toBe('ARCHIVED'));
    // Before T038.05, the backend always ANDed deletedAt: null regardless of
    // this filter, so an ARCHIVED-filtered request could never return a row.
    // This MSW mock only returns the archived row once status=ARCHIVED is
    // actually sent — the row appearing is direct evidence the frontend
    // correctly requests and renders it now that the backend supports it.
    // Scoped to `role: 'cell'` (not plain `getByText`) since the status
    // filter's own trigger also displays the literal text "ARCHIVED".
    expect(await screen.findByRole('cell', { name: 'ARCHIVED' })).toBeInTheDocument();
  });

  it('renders skeleton rows while loading', () => {
    server.use(
      http.get(`${API_BASE_URL}/categories`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 }));
      }),
    );

    const { container } = renderTable();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('renders the "nothing exists yet" empty state when no categories exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    expect(await screen.findByText('Chưa có danh mục nào')).toBeInTheDocument();
  });

  it('renders the "no results" empty state when a search filter yields nothing', async () => {
    server.use(
      http.get(`${API_BASE_URL}/categories`, ({ request }) => {
        const url = new URL(request.url);
        const items = url.searchParams.get('search') ? [] : [buildCategory()];
        return HttpResponse.json(envelope({ items, total: items.length, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Thời trang');

    await userEvent.type(screen.getByRole('textbox'), 'không tồn tại');
    expect(await screen.findByText('Không có kết quả', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/categories`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { success: false, code: 'CATEGORY_500', message: 'Đã xảy ra lỗi hệ thống', errors: [] },
            { status: 500 },
          );
        }
        return HttpResponse.json(
          envelope({ items: [buildCategory()], total: 1, page: 1, limit: 20 }),
        );
      }),
    );

    renderTable();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Thời trang')).toBeInTheDocument();
  });

  it('renders category rows with the expected columns, and calls the API with server-driven pagination', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/categories`, ({ request }) => {
        lastUrl = new URL(request.url);
        const page = Number(lastUrl.searchParams.get('page') ?? '1');
        return HttpResponse.json(
          envelope({
            items: [buildCategory({ id: `cat-${page}`, name: `Danh mục trang ${page}` })],
            total: 25,
            page,
            limit: 20,
          }),
        );
      }),
    );

    renderTable();
    expect(await screen.findByText('Danh mục trang 1')).toBeInTheDocument();
    expect(screen.getByText('THOI-TRANG')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(lastUrl?.searchParams.get('limit')).toBe('20');

    await userEvent.click(screen.getByRole('button', { name: 'Sau' }));
    expect(await screen.findByText('Danh mục trang 2')).toBeInTheDocument();
    expect(lastUrl?.searchParams.get('page')).toBe('2');
  });

  it('re-fetches with the selected status filter', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/categories`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(
          envelope({ items: [buildCategory()], total: 1, page: 1, limit: 20 }),
        );
      }),
    );

    renderTable();
    await screen.findByText('Thời trang');
    expect(lastUrl?.searchParams.get('status')).toBeNull();

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Đang hoạt động' }));

    await waitFor(() => expect(lastUrl?.searchParams.get('status')).toBe('ACTIVE'));
  });

  it('toggles server-driven sort order when a sortable column header is clicked', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/categories`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(
          envelope({ items: [buildCategory()], total: 1, page: 1, limit: 20 }),
        );
      }),
    );

    renderTable();
    await screen.findByText('Thời trang');
    expect(lastUrl?.searchParams.get('sortBy')).toBe('sortOrder');
    expect(lastUrl?.searchParams.get('sortOrder')).toBe('asc');

    await userEvent.click(screen.getByRole('button', { name: /Tên/ }));
    await waitFor(() => expect(lastUrl?.searchParams.get('sortBy')).toBe('name'));
    expect(lastUrl?.searchParams.get('sortOrder')).toBe('asc');
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(envelope({ items: [buildCategory()], total: 1, page: 1, limit: 20 })),
      ),
    );

    const { container } = renderTable();
    await screen.findByText('Thời trang');
    expect(await axe(container)).toHaveNoViolations();
  });
});
