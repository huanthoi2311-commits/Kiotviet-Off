import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { UserTable } from './user-table';

const API_BASE_URL = 'http://localhost:3000/api/v1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function paginated<T>(items: T[], overrides: Record<string, unknown> = {}) {
  return { items, total: items.length, page: 1, limit: 20, ...overrides };
}

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    branchId: null,
    username: 'staff01',
    fullName: 'Nguyễn Văn A',
    email: 'staff01@acme.test',
    phone: null,
    avatar: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stubBranches() {
  server.use(
    http.get(`${API_BASE_URL}/branches`, () =>
      HttpResponse.json(envelope(paginated([{ id: 'branch-1', name: 'Chi nhánh 1' }]))),
    ),
  );
}

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UserTable />
    </QueryClientProvider>,
  );
}

describe('UserTable (T052.02C)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    stubBranches();
  });

  it('renders rows with expected columns', async () => {
    server.use(
      http.get(`${API_BASE_URL}/users`, () =>
        HttpResponse.json(envelope(paginated([buildUser()]))),
      ),
    );

    renderTable();
    await screen.findByText('staff01');
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(screen.getByText('staff01@acme.test')).toBeInTheDocument();
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
    expect(screen.getByText('Chưa đăng nhập')).toBeInTheDocument();
  });

  it('shows an "Xem" link per row for a user with user:view, pointing at /users/:id', async () => {
    const token = buildAccessToken({
      sub: 'u-1',
      organizationId: 'org-1',
      permissions: ['user:view'],
    });
    useAuthStore.getState().setAccessToken(token);
    server.use(
      http.get(`${API_BASE_URL}/users`, () =>
        HttpResponse.json(envelope(paginated([buildUser()]))),
      ),
    );

    renderTable();
    await screen.findByText('staff01');
    expect(screen.getByRole('link', { name: 'Xem' })).toHaveAttribute('href', '/users/user-1');
  });

  it('hides the "Xem" link for a user without user:view', async () => {
    server.use(
      http.get(`${API_BASE_URL}/users`, () =>
        HttpResponse.json(envelope(paginated([buildUser()]))),
      ),
    );

    renderTable();
    await screen.findByText('staff01');
    expect(screen.queryByRole('link', { name: 'Xem' })).not.toBeInTheDocument();
  });

  it('re-fetches with the entered search text', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/users`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(envelope(paginated([buildUser()])));
      }),
    );

    renderTable();
    await screen.findByText('staff01');
    await userEvent.type(screen.getByRole('textbox'), 'staff01');

    await waitFor(() => expect(lastUrl?.searchParams.get('search')).toBe('staff01'), {
      timeout: 2000,
    });
  });

  it('re-fetches with the selected status filter', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/users`, ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json(envelope(paginated([buildUser()])));
      }),
    );

    renderTable();
    await screen.findByText('staff01');
    expect(lastUrl?.searchParams.get('status')).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Ngừng hoạt động' }));

    await waitFor(() => expect(lastUrl?.searchParams.get('status')).toBe('INACTIVE'));
  });

  it('does not offer LOCKED as a status filter option (reserved/unreachable, D2)', async () => {
    server.use(
      http.get(`${API_BASE_URL}/users`, () =>
        HttpResponse.json(envelope(paginated([buildUser()]))),
      ),
    );

    renderTable();
    await screen.findByText('staff01');
    await userEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    expect(screen.queryByRole('option', { name: 'Đã khóa' })).not.toBeInTheDocument();
  });

  it('paginates server-driven results', async () => {
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/users`, ({ request }) => {
        lastUrl = new URL(request.url);
        const page = Number(lastUrl.searchParams.get('page') ?? '1');
        return HttpResponse.json(
          envelope(
            paginated([buildUser({ id: `user-${page}`, username: `staff-page-${page}` })], {
              total: 25,
              page,
            }),
          ),
        );
      }),
    );

    renderTable();
    expect(await screen.findByText('staff-page-1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sau' }));
    expect(await screen.findByText('staff-page-2')).toBeInTheDocument();
    expect(lastUrl?.searchParams.get('page')).toBe('2');
  });

  it('renders skeleton rows while loading', () => {
    server.use(
      http.get(`${API_BASE_URL}/users`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(envelope(paginated([])));
      }),
    );

    const { container } = renderTable();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('renders the "nothing exists yet" empty state when no users exist and no filter is active', async () => {
    server.use(http.get(`${API_BASE_URL}/users`, () => HttpResponse.json(envelope(paginated([])))));

    renderTable();
    expect(await screen.findByText('Chưa có nhân viên nào')).toBeInTheDocument();
  });

  it('renders the "no results" empty state when a search filter yields nothing', async () => {
    server.use(
      http.get(`${API_BASE_URL}/users`, ({ request }) => {
        const url = new URL(request.url);
        const items = url.searchParams.get('search') ? [] : [buildUser()];
        return HttpResponse.json(envelope(paginated(items)));
      }),
    );

    renderTable();
    await screen.findByText('staff01');
    await userEvent.type(screen.getByRole('textbox'), 'không tồn tại');
    expect(await screen.findByText('Không có kết quả', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/users`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(
            { success: false, code: 'USER_500', message: 'Đã xảy ra lỗi hệ thống', errors: [] },
            { status: 500 },
          );
        }
        return HttpResponse.json(envelope(paginated([buildUser()])));
      }),
    );

    renderTable();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('staff01')).toBeInTheDocument();
  });

  it('has no accessibility violations once data is loaded', async () => {
    server.use(
      http.get(`${API_BASE_URL}/users`, () =>
        HttpResponse.json(envelope(paginated([buildUser()]))),
      ),
    );

    const { container } = renderTable();
    await screen.findByText('staff01');
    expect(await axe(container)).toHaveNoViolations();
  });
});
