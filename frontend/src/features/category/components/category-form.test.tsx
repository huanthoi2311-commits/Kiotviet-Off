import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { CategoryCreateForm } from './category-form';

const API_BASE_URL = 'http://localhost:3000/api/v1';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function buildCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    parentId: null,
    code: 'ROOT',
    name: 'Danh mục gốc',
    slug: 'danh-muc-goc',
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

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoryCreateForm />
    </QueryClientProvider>,
  );
}

function mockList(items: ReturnType<typeof buildCategory>[] = []) {
  server.use(
    http.get(`${API_BASE_URL}/categories`, () =>
      HttpResponse.json(envelope({ items, total: items.length, page: 1, limit: 100 })),
    ),
  );
}

describe('CategoryCreateForm (T036.10)', () => {
  beforeEach(() => {
    push.mockClear();
    mockList([buildCategory()]);
  });

  it('renders every field with an accessible label', async () => {
    renderForm();
    await screen.findByLabelText('Mã danh mục');

    expect(screen.getByLabelText('Mã danh mục')).toBeInTheDocument();
    expect(screen.getByLabelText('Tên danh mục')).toBeInTheDocument();
    expect(screen.getByLabelText('Danh mục cha')).toBeInTheDocument();
    expect(screen.getByLabelText('Mô tả')).toBeInTheDocument();
    expect(screen.getByLabelText('Ảnh (URL)')).toBeInTheDocument();
    expect(screen.getByLabelText('Thứ tự')).toBeInTheDocument();
    expect(screen.getByLabelText('Trạng thái')).toBeInTheDocument();
    expect(screen.getByLabelText('Đang hoạt động')).toBeInTheDocument();
  });

  it('loads parent options from GET /categories and includes a "no parent" item', async () => {
    renderForm();
    await screen.findByLabelText('Mã danh mục');

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Danh mục cha'));

    expect(
      await screen.findByRole('option', { name: '— Không có danh mục cha —' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Danh mục gốc' })).toBeInTheDocument();
  });

  it('submits with only required fields and calls create with the expected payload', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${API_BASE_URL}/categories`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(envelope(buildCategory({ id: 'new-1' })), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Mã danh mục');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã danh mục'), 'ABC');
    await user.type(screen.getByLabelText('Tên danh mục'), 'Danh mục mới');
    await user.click(screen.getByRole('button', { name: 'Tạo danh mục' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        code: 'ABC',
        name: 'Danh mục mới',
        status: 'ACTIVE',
        isActive: true,
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/categories'));
  });

  it('invalidates the category list cache on successful create (T037.10 AD-6 retroactive fix)', async () => {
    let listCallCount = 0;
    server.use(
      http.get(`${API_BASE_URL}/categories`, () => {
        listCallCount += 1;
        return HttpResponse.json(
          envelope({ items: [buildCategory()], total: 1, page: 1, limit: 100 }),
        );
      }),
      http.post(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(envelope(buildCategory({ id: 'new-1' })), { status: 201 }),
      ),
    );

    renderForm();
    await screen.findByLabelText('Mã danh mục');
    const callsAfterMount = listCallCount;
    expect(callsAfterMount).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã danh mục'), 'ABC');
    await user.type(screen.getByLabelText('Tên danh mục'), 'Danh mục mới');
    await user.click(screen.getByRole('button', { name: 'Tạo danh mục' }));

    // Invalidating a still-active query (the form's own parent-picker list
    // query) triggers an immediate background refetch — a second GET call
    // beyond the initial mount is direct evidence invalidation actually fired.
    await waitFor(() => expect(listCallCount).toBeGreaterThan(callsAfterMount));
  });

  it('blocks submission and makes zero network calls when a required field is invalid', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/categories`, () => {
        called = true;
        return HttpResponse.json(envelope(buildCategory()), { status: 201 });
      }),
    );

    renderForm();
    await screen.findByLabelText('Mã danh mục');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tạo danh mục' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Tên danh mục')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(called).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a field-level error on code for CATEGORY_002 (duplicate)', async () => {
    server.use(
      http.post(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'CATEGORY_002',
            message: 'Mã danh mục đã tồn tại',
            errors: [],
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 409 },
        ),
      ),
    );

    renderForm();
    await screen.findByLabelText('Mã danh mục');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã danh mục'), 'ROOT');
    await user.type(screen.getByLabelText('Tên danh mục'), 'Trùng mã');
    await user.click(screen.getByRole('button', { name: 'Tạo danh mục' }));

    expect(await screen.findByText('Mã danh mục đã tồn tại')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a field-level error on parentId for CATEGORY_006 (parent not found)', async () => {
    server.use(
      http.post(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'CATEGORY_006',
            message: 'Không tìm thấy danh mục cha',
            errors: [],
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 404 },
        ),
      ),
    );

    renderForm();
    await screen.findByLabelText('Mã danh mục');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã danh mục'), 'X');
    await user.type(screen.getByLabelText('Tên danh mục'), 'Xy');
    await user.click(screen.getByRole('button', { name: 'Tạo danh mục' }));

    expect(await screen.findByText('Không tìm thấy danh mục cha')).toBeInTheDocument();
  });

  it('shows a root-level alert (not a field error) for any other error code', async () => {
    server.use(
      http.post(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'CATEGORY_500',
            message: 'Đã xảy ra lỗi hệ thống',
            errors: [],
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 500 },
        ),
      ),
    );

    renderForm();
    await screen.findByLabelText('Mã danh mục');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã danh mục'), 'X');
    await user.type(screen.getByLabelText('Tên danh mục'), 'Xy');
    await user.click(screen.getByRole('button', { name: 'Tạo danh mục' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Đã xảy ra lỗi hệ thống');
  });

  it('navigates immediately on Cancel when the form is pristine (T037.10 AD-4)', async () => {
    renderForm();
    await screen.findByLabelText('Mã danh mục');

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(push).toHaveBeenCalledWith('/categories');
    expect(screen.queryByText('Hủy các thay đổi chưa lưu?')).not.toBeInTheDocument();
  });

  it('shows a confirm dialog on Cancel when the form is dirty, and only navigates after confirming (T037.10 AD-4)', async () => {
    renderForm();
    await screen.findByLabelText('Mã danh mục');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mã danh mục'), 'ABC');
    await user.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(await screen.findByText('Hủy các thay đổi chưa lưu?')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Hủy thay đổi' }));
    expect(push).toHaveBeenCalledWith('/categories');
  });

  it('has no accessibility violations on the empty form', async () => {
    const { container } = renderForm();
    await screen.findByLabelText('Mã danh mục');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no accessibility violations once a validation error is shown', async () => {
    const { container } = renderForm();
    await screen.findByLabelText('Mã danh mục');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tạo danh mục' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Tên danh mục')).toHaveAttribute('aria-invalid', 'true'),
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
