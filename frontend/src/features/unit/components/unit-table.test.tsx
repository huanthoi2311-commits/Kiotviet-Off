import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { UnitTable } from './unit-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UnitTable />
    </QueryClientProvider>,
  );
}

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildUnit(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    code: 'CAI',
    name: 'Cái',
    symbol: 'cái',
    status: 'ACTIVE',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('UnitTable (T042 Phase C + T042 Archive/Restore)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('shows a "Sửa" link per row for a user with unit:update, pointing at /units/:id', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['unit:update'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/units`, () =>
        HttpResponse.json(envelope({ items: [buildUnit()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Cái');

    expect(screen.getByRole('link', { name: 'Sửa' })).toHaveAttribute(
      'href',
      '/units/a1b2c3d4-0000-0000-0000-000000000001',
    );
  });

  it('hides the "Sửa" link for a user without unit:update', async () => {
    server.use(
      http.get(`${API_BASE_URL}/units`, () =>
        HttpResponse.json(envelope({ items: [buildUnit()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Cái');

    expect(screen.queryByRole('link', { name: 'Sửa' })).not.toBeInTheDocument();
  });

  it('shows a "Lưu trữ" button per row for a user with unit:delete', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['unit:delete'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/units`, () =>
        HttpResponse.json(envelope({ items: [buildUnit()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Cái');

    expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeInTheDocument();
  });

  it('clicking "Lưu trữ" opens the archive confirmation dialog for that row\'s unit', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['unit:delete'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/units`, () =>
        HttpResponse.json(envelope({ items: [buildUnit()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Cái');

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    expect(screen.getByText('Lưu trữ đơn vị tính?')).toBeInTheDocument();
    expect(screen.getByText(/"Cái"/)).toBeInTheDocument();
  });

  it('ARCHIVED rows show only "Khôi phục" — "Sửa" and "Lưu trữ" are hidden even with unit:update/unit:delete', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['unit:update', 'unit:delete', 'unit:restore'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/units`, () =>
        HttpResponse.json(
          envelope({ items: [buildUnit({ status: 'ARCHIVED' })], total: 1, page: 1, limit: 20 }),
        ),
      ),
    );

    renderTable();
    await screen.findByText('Cái');

    expect(screen.queryByRole('link', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu trữ' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khôi phục' })).toBeInTheDocument();
  });

  it('non-archived rows never show "Khôi phục", even with unit:restore', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['unit:restore', 'unit:update', 'unit:delete'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/units`, () =>
        HttpResponse.json(envelope({ items: [buildUnit()], total: 1, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    await screen.findByText('Cái');

    expect(screen.queryByRole('button', { name: 'Khôi phục' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeInTheDocument();
  });

  it('hides "Khôi phục" on an ARCHIVED row for a user without unit:restore', async () => {
    server.use(
      http.get(`${API_BASE_URL}/units`, () =>
        HttpResponse.json(
          envelope({ items: [buildUnit({ status: 'ARCHIVED' })], total: 1, page: 1, limit: 20 }),
        ),
      ),
    );

    renderTable();
    await screen.findByText('Cái');

    expect(screen.queryByRole('button', { name: 'Khôi phục' })).not.toBeInTheDocument();
  });

  it('clicking "Khôi phục" opens the restore confirmation dialog for that row\'s unit', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['unit:restore'],
    });
    useAuthStore.getState().setAccessToken(token);

    server.use(
      http.get(`${API_BASE_URL}/units`, () =>
        HttpResponse.json(
          envelope({ items: [buildUnit({ status: 'ARCHIVED' })], total: 1, page: 1, limit: 20 }),
        ),
      ),
    );

    renderTable();
    await screen.findByText('Cái');

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    expect(screen.getByText('Khôi phục đơn vị tính?')).toBeInTheDocument();
    expect(screen.getByText(/"Cái"/)).toBeInTheDocument();
  });

  it('ARCHIVED status filter returns archived rows (regression check for the T042 backend fix)', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/units`, ({ request }) => {
        lastUrl = new URL(request.url);
        const filteringArchived = lastUrl.searchParams.get('status') === 'ARCHIVED';
        const items = filteringArchived ? [buildUnit({ status: 'ARCHIVED' })] : [buildUnit()];
        return HttpResponse.json(envelope({ items, total: items.length, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Cái');

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Đã lưu trữ' }));

    await waitFor(() => expect(lastUrl?.searchParams.get('status')).toBe('ARCHIVED'));
    // Before the T042 backend fix, the repository always ANDed
    // deletedAt: null regardless of this filter, so an ARCHIVED-filtered
    // request could never return a row. This MSW mock only returns the
    // archived row once status=ARCHIVED is actually sent.
    expect(await screen.findByRole('cell', { name: 'ARCHIVED' })).toBeInTheDocument();
  });

  it('renders skeleton rows while loading', () => {
    server.use(
      http.get(`${API_BASE_URL}/units`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 }));
      }),
    );

    const { container } = renderTable();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('renders the "nothing exists yet" empty state when no units exist and no filter is active', async () => {
    server.use(
      http.get(`${API_BASE_URL}/units`, () =>
        HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 })),
      ),
    );

    renderTable();
    expect(await screen.findByText('Chưa có đơn vị tính nào')).toBeInTheDocument();
  });

  it('renders the "no results" empty state when a search filter yields nothing', async () => {
    server.use(
      http.get(`${API_BASE_URL}/units`, ({ request }) => {
        const url = new URL(request.url);
        const items = url.searchParams.get('search') ? [] : [buildUnit()];
        return HttpResponse.json(envelope({ items, total: items.length, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Cái');

    await userEvent.type(screen.getByRole('textbox'), 'không tồn tại');
    expect(await screen.findByText('Không có kết quả', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/units`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { success: false, code: 'UNIT_500', message: 'Đã xảy ra lỗi hệ thống', errors: [] },
            { status: 500 },
          );
        }
        return HttpResponse.json(envelope({ items: [buildUnit()], total: 1, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Cái')).toBeInTheDocument();
  });

  it('renders unit rows with the expected columns, and calls the API with server-driven pagination', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/units`, ({ request }) => {
        lastUrl = new URL(request.url);
        const page = Number(lastUrl.searchParams.get('page') ?? '1');
        return HttpResponse.json(
          envelope({
            items: [buildUnit({ id: `u-${page}`, name: `Đơn vị trang ${page}` })],
            total: 25,
            page,
            limit: 20,
          }),
        );
      }),
    );

    renderTable();
    expect(await screen.findByText('Đơn vị trang 1')).toBeInTheDocument();
    expect(screen.getByText('CAI')).toBeInTheDocument();
    expect(screen.getByText('cái')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(lastUrl?.searchParams.get('limit')).toBe('20');

    await userEvent.click(screen.getByRole('button', { name: 'Sau' }));
    expect(await screen.findByText('Đơn vị trang 2')).toBeInTheDocument();
    expect(lastUrl?.searchParams.get('page')).toBe('2');
  });

  it('re-fetches with the selected status filter', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/units`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(envelope({ items: [buildUnit()], total: 1, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Cái');
    expect(lastUrl?.searchParams.get('status')).toBeNull();

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Đang hoạt động' }));

    await waitFor(() => expect(lastUrl?.searchParams.get('status')).toBe('ACTIVE'));
  });

  it('toggles server-driven sort order when a sortable column header is clicked', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/units`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(envelope({ items: [buildUnit()], total: 1, page: 1, limit: 20 }));
      }),
    );

    renderTable();
    await screen.findByText('Cái');
    expect(lastUrl?.searchParams.get('sortBy')).toBe('name');
    expect(lastUrl?.searchParams.get('sortOrder')).toBe('asc');

    await userEvent.click(screen.getByRole('button', { name: /Mã/ }));
    await waitFor(() => expect(lastUrl?.searchParams.get('sortBy')).toBe('code'));
    expect(lastUrl?.searchParams.get('sortOrder')).toBe('asc');
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/units`, () =>
        HttpResponse.json(envelope({ items: [buildUnit()], total: 1, page: 1, limit: 20 })),
      ),
    );

    const { container } = renderTable();
    await screen.findByText('Cái');
    expect(await axe(container)).toHaveNoViolations();
  });
});
