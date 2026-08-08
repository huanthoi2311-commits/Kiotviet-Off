import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { getCategoryControllerGetTreeQueryKey } from '@/generated/category/category';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { CategoryEditForm } from './category-edit-form';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const CURRENT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
const CHILD_ID = 'a1b2c3d4-0000-0000-0000-000000000002';
const GRANDCHILD_ID = 'a1b2c3d4-0000-0000-0000-000000000003';
const UNRELATED_ID = 'a1b2c3d4-0000-0000-0000-000000000004';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

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

function buildCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: CURRENT_ID,
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

/** current (being edited) -> child -> grandchild, plus one unrelated root. */
function buildFlatList() {
  return [
    buildCategory({ id: CURRENT_ID, name: 'Thời trang' }),
    buildCategory({ id: CHILD_ID, parentId: CURRENT_ID, name: 'Áo' }),
    buildCategory({ id: GRANDCHILD_ID, parentId: CHILD_ID, name: 'Áo sơ mi' }),
    buildCategory({ id: UNRELATED_ID, parentId: null, name: 'Đồ điện tử' }),
  ];
}

function mockFindOne(category = buildCategory()) {
  server.use(
    http.get(`${API_BASE_URL}/categories/${CURRENT_ID}`, () =>
      HttpResponse.json(envelope(category)),
    ),
  );
}

function mockList(items = buildFlatList()) {
  server.use(
    http.get(`${API_BASE_URL}/categories`, () =>
      HttpResponse.json(envelope({ items, total: items.length, page: 1, limit: 100 })),
    ),
  );
}

function renderForm() {
  // T038.08B — the real MutationCache config (not a bare QueryClient), so
  // the form's `meta: { suppressGlobalErrorToast: true }` is actually
  // exercised end-to-end, not just present in source.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoryEditForm id={CURRENT_ID} />
    </QueryClientProvider>,
  );
}

function grantUpdate() {
  const token = buildAccessToken({
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: ['category:update'],
  });
  useAuthStore.getState().setAccessToken(token);
}

describe('CategoryEditForm (T037.10 + T038.08B error dedup)', () => {
  beforeEach(async () => {
    push.mockClear();
    useAuthStore.getState().clear();
    mockFindOne();
    mockList();
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('renders a skeleton while loading', () => {
    server.use(
      http.get(`${API_BASE_URL}/categories/${CURRENT_ID}`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(envelope(buildCategory()));
      }),
    );
    grantUpdate();

    const { container } = renderForm();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('shows a dedicated not-found state for CATEGORY_001, with a link back to the list', async () => {
    server.use(
      http.get(`${API_BASE_URL}/categories/${CURRENT_ID}`, () =>
        HttpResponse.json(errorEnvelope('CATEGORY_001', 'Không tìm thấy danh mục'), {
          status: 404,
        }),
      ),
    );
    grantUpdate();

    renderForm();
    expect(await screen.findByText('Không tìm thấy danh mục')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quay lại danh sách' })).toHaveAttribute(
      'href',
      '/categories',
    );
  });

  it('shows an inline retry for a non-not-found fetch error', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/categories/${CURRENT_ID}`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json(errorEnvelope('CATEGORY_500', 'Đã xảy ra lỗi hệ thống'), {
            status: 500,
          });
        }
        return HttpResponse.json(envelope(buildCategory()));
      }),
    );
    grantUpdate();

    renderForm();
    expect(await screen.findByText('Đã xảy ra lỗi hệ thống')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByLabelText('Mã danh mục')).toBeInTheDocument();
  });

  describe('parent picker — descendant exclusion (T037.02 algorithm)', () => {
    it('excludes self, the direct child, and the grandchild; includes an unrelated category', async () => {
      grantUpdate();
      renderForm();
      await screen.findByLabelText('Mã danh mục');

      await userEvent.click(screen.getByLabelText('Danh mục cha'));

      expect(await screen.findByRole('option', { name: 'Đồ điện tử' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Thời trang' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Áo' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Áo sơ mi' })).not.toBeInTheDocument();
      expect(screen.getByRole('option', { name: '— Không có danh mục cha —' })).toBeInTheDocument();
    });
  });

  describe('read-only mode (category:view only, no category:update)', () => {
    it('renders disabled fields with the loaded values and no submit control', async () => {
      renderForm();
      await screen.findByDisplayValue('THOI-TRANG');

      expect(screen.getByDisplayValue('THOI-TRANG')).toBeDisabled();
      expect(screen.getByDisplayValue('Thời trang')).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Hủy' })).not.toBeInTheDocument();
    });

    it('has no accessibility violations in the read-only state', async () => {
      const { container } = renderForm();
      await screen.findByDisplayValue('THOI-TRANG');
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('editable mode (category:update granted)', () => {
    beforeEach(() => grantUpdate());

    it('has no accessibility violations', async () => {
      const { container } = renderForm();
      await screen.findByLabelText('Mã danh mục');
      expect(await axe(container)).toHaveNoViolations();
    });

    it('navigates immediately on Cancel when pristine', async () => {
      renderForm();
      await screen.findByLabelText('Mã danh mục');

      await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
      expect(push).toHaveBeenCalledWith('/categories');
    });

    it('shows a confirm dialog on Cancel when dirty, and only navigates after confirming', async () => {
      renderForm();
      const nameInput = await screen.findByLabelText('Tên danh mục');

      const user = userEvent.setup();
      await user.type(nameInput, ' mới');
      await user.click(screen.getByRole('button', { name: 'Hủy' }));

      expect(await screen.findByText('Hủy các thay đổi chưa lưu?')).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Hủy thay đổi' }));
      expect(push).toHaveBeenCalledWith('/categories');
    });

    it('submits the full current state, translating an unselected parent to null, and invalidates both caches (SPEC-T037 §11)', async () => {
      let capturedBody: unknown;
      let listCallCount = 0;
      let findOneCallCount = 0;
      server.use(
        http.get(`${API_BASE_URL}/categories/${CURRENT_ID}`, () => {
          findOneCallCount += 1;
          return HttpResponse.json(envelope(buildCategory({ parentId: CHILD_ID })));
        }),
        http.get(`${API_BASE_URL}/categories`, () => {
          listCallCount += 1;
          return HttpResponse.json(
            envelope({ items: buildFlatList(), total: 4, page: 1, limit: 100 }),
          );
        }),
        http.patch(`${API_BASE_URL}/categories/${CURRENT_ID}`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(envelope(buildCategory({ version: 2 })), { status: 200 });
        }),
      );

      renderForm();
      await screen.findByLabelText('Mã danh mục');
      const listCallsAfterMount = listCallCount;
      const findOneCallsAfterMount = findOneCallCount;

      // Clear the parent (was CHILD_ID) — must submit as explicit null, not omitted.
      await userEvent.click(screen.getByLabelText('Danh mục cha'));
      await userEvent.click(
        await screen.findByRole('option', { name: '— Không có danh mục cha —' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      await waitFor(() =>
        expect(capturedBody).toMatchObject({
          version: 1,
          code: 'THOI-TRANG',
          name: 'Thời trang',
          parentId: null,
          status: 'ACTIVE',
          isActive: true,
        }),
      );
      // Invalidating still-active queries (the form's own findOne + the
      // parent-picker list) triggers immediate background refetches —
      // direct evidence both invalidation calls actually fired (§11).
      await waitFor(() => expect(listCallCount).toBeGreaterThan(listCallsAfterMount));
      await waitFor(() => expect(findOneCallCount).toBeGreaterThan(findOneCallsAfterMount));
      // Stays on the page (SPEC-T037 §7) — no navigation on success. (No
      // Toaster is mounted in this isolated test, matching category-form's
      // own test file precedent — toast text isn't asserted here either.)
      expect(push).not.toHaveBeenCalled();
    });

    it('also invalidates the Tree query cache on successful update (T040)', async () => {
      mockFindOne();
      mockList();
      server.use(
        http.patch(`${API_BASE_URL}/categories/${CURRENT_ID}`, () =>
          HttpResponse.json(envelope(buildCategory({ version: 2 })), { status: 200 }),
        ),
      );
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        mutationCache: new MutationCache({ onError: reportMutationError }),
      });
      queryClient.setQueryData(getCategoryControllerGetTreeQueryKey(), []);

      render(
        <QueryClientProvider client={queryClient}>
          <CategoryEditForm id={CURRENT_ID} />
        </QueryClientProvider>,
      );
      await screen.findByLabelText('Mã danh mục');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      await waitFor(() =>
        expect(
          queryClient.getQueryState(getCategoryControllerGetTreeQueryKey())?.isInvalidated,
        ).toBe(true),
      );
    });

    it('maps CATEGORY_002 to the code field, with no duplicate global toast (T038.08B)', async () => {
      const { toast } = await import('sonner');
      server.use(
        http.patch(`${API_BASE_URL}/categories/${CURRENT_ID}`, () =>
          HttpResponse.json(errorEnvelope('CATEGORY_002', 'Mã danh mục đã tồn tại'), {
            status: 409,
          }),
        ),
      );

      renderForm();
      await screen.findByLabelText('Mã danh mục');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      expect(await screen.findByText('Mã danh mục đã tồn tại')).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('maps CATEGORY_005 (circular reference) to the parentId field, with no duplicate global toast (T038.08B)', async () => {
      const { toast } = await import('sonner');
      server.use(
        http.patch(`${API_BASE_URL}/categories/${CURRENT_ID}`, () =>
          HttpResponse.json(
            errorEnvelope(
              'CATEGORY_005',
              'Không thể gán danh mục cha vì sẽ tạo thành vòng lặp cha-con',
            ),
            { status: 422 },
          ),
        ),
      );

      renderForm();
      await screen.findByLabelText('Mã danh mục');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      expect(
        await screen.findByText('Không thể gán danh mục cha vì sẽ tạo thành vòng lặp cha-con'),
      ).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('maps CATEGORY_006 (parent not found) to the parentId field, with no duplicate global toast (T038.08B)', async () => {
      const { toast } = await import('sonner');
      server.use(
        http.patch(`${API_BASE_URL}/categories/${CURRENT_ID}`, () =>
          HttpResponse.json(errorEnvelope('CATEGORY_006', 'Danh mục cha không tồn tại'), {
            status: 422,
          }),
        ),
      );

      renderForm();
      await screen.findByLabelText('Mã danh mục');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      expect(await screen.findByText('Danh mục cha không tồn tại')).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('any other error code shows a root-level alert, not a field error, with no duplicate global toast (T038.08B)', async () => {
      const { toast } = await import('sonner');
      server.use(
        http.patch(`${API_BASE_URL}/categories/${CURRENT_ID}`, () =>
          HttpResponse.json(errorEnvelope('CATEGORY_500', 'Đã xảy ra lỗi hệ thống'), {
            status: 500,
          }),
        ),
      );

      renderForm();
      await screen.findByLabelText('Mã danh mục');
      await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Đã xảy ra lỗi hệ thống');
      expect(toast.error).not.toHaveBeenCalled();
    });

    describe('CATEGORY_009 — version conflict (SPEC-T037 §9/§20 AD-5)', () => {
      it('does not touch form fields, shows a root alert with a Reload button, only discards on explicit reload, and shows no duplicate global toast (T038.08B)', async () => {
        const { toast } = await import('sonner');
        let findOneCallCount = 0;
        server.use(
          http.get(`${API_BASE_URL}/categories/${CURRENT_ID}`, () => {
            findOneCallCount += 1;
            return HttpResponse.json(envelope(buildCategory({ version: findOneCallCount })));
          }),
          http.patch(`${API_BASE_URL}/categories/${CURRENT_ID}`, () =>
            HttpResponse.json(
              errorEnvelope(
                'CATEGORY_009',
                'Danh mục đã được cập nhật bởi người khác, vui lòng tải lại',
              ),
              { status: 409 },
            ),
          ),
        );

        renderForm();
        const nameInput = await screen.findByLabelText('Tên danh mục');
        const callsAfterMount = findOneCallCount;

        const user = userEvent.setup();
        await user.clear(nameInput);
        await user.type(nameInput, 'Tên đang chỉnh sửa');
        await user.click(screen.getByRole('button', { name: 'Lưu' }));

        expect(
          await screen.findByText('Danh mục đã được cập nhật bởi người khác, vui lòng tải lại'),
        ).toBeInTheDocument();
        // The user's in-progress edit must still be there — no silent overwrite.
        expect(screen.getByLabelText('Tên danh mục')).toHaveValue('Tên đang chỉnh sửa');
        // Before T038.08B, the global MutationCache handler would ALSO have
        // toasted this exact message alongside the root conflict alert.
        expect(toast.error).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'Tải lại' }));

        await waitFor(() => expect(findOneCallCount).toBeGreaterThan(callsAfterMount));
        expect(
          screen.queryByText('Danh mục đã được cập nhật bởi người khác, vui lòng tải lại'),
        ).not.toBeInTheDocument();
      });
    });
  });
});
