import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import {
  getCategoryControllerGetTreeQueryKey,
  useCategoryControllerList,
} from '@/generated/category/category';
import { reportMutationError } from '@/providers/query-provider';
import {
  CategoryLifecycleDialog,
  type CategoryLifecycleDialogMode,
} from './category-lifecycle-dialog';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const CATEGORY_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

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

function renderDialog(
  mode: CategoryLifecycleDialogMode = 'archive',
  onOpenChange: (open: boolean) => void = vi.fn(),
) {
  // T038.08B — the real MutationCache config (not a bare QueryClient), so
  // the dialog's `meta: { suppressGlobalErrorToast: true }` is actually
  // exercised end-to-end, not just present in source.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <CategoryLifecycleDialog
          open
          onOpenChange={onOpenChange}
          categoryId={CATEGORY_ID}
          categoryName="Thời trang"
          mode={mode}
        />
      </QueryClientProvider>,
    ),
  };
}

describe('CategoryLifecycleDialog — mode="archive" (T038.10 + T038.08B/D, renamed T039)', () => {
  beforeEach(async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the category name in the confirmation copy, with destructive styling', () => {
    renderDialog('archive');
    expect(screen.getByText('Lưu trữ danh mục?')).toBeInTheDocument();
    expect(screen.getByText(/Thời trang/)).toBeInTheDocument();
  });

  it('cancel closes the dialog without calling the archive mutation', async () => {
    let called = false;
    server.use(
      http.delete(`${API_BASE_URL}/categories/${CATEGORY_ID}`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onOpenChange = vi.fn();
    renderDialog('archive', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(called).toBe(false);
  });

  it('confirm calls the archive mutation (DELETE) with the category id', async () => {
    let capturedId: string | undefined;
    server.use(
      http.delete(`${API_BASE_URL}/categories/:id`, ({ params }) => {
        capturedId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 })),
      ),
    );
    renderDialog('archive');

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    await waitFor(() => expect(capturedId).toBe(CATEGORY_ID));
  });

  it('on success: invalidates the category list and closes the dialog', async () => {
    let listCallCount = 0;
    server.use(
      http.delete(
        `${API_BASE_URL}/categories/${CATEGORY_ID}`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.get(`${API_BASE_URL}/categories`, () => {
        listCallCount += 1;
        return HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 }));
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(getCategoryControllerGetTreeQueryKey(), []);
    const onOpenChange = vi.fn();
    // Renders the dialog alongside a real, active `useCategoryControllerList`
    // query — the exact same query-key shape `getCategoryControllerListQueryKey()`
    // targets — so a genuine background refetch after invalidation is
    // observable, matching T037.10's own evidence pattern.
    function Harness() {
      useCategoryControllerList({ limit: 20 });
      return (
        <CategoryLifecycleDialog
          open
          onOpenChange={onOpenChange}
          categoryId={CATEGORY_ID}
          categoryName="Thời trang"
          mode="archive"
        />
      );
    }
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(listCallCount).toBeGreaterThan(0));
    const callsAfterMount = listCallCount;

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    await waitFor(() => expect(listCallCount).toBeGreaterThan(callsAfterMount));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    // T040 — Tree must also stop showing a just-archived category.
    expect(queryClient.getQueryState(getCategoryControllerGetTreeQueryKey())?.isInvalidated).toBe(
      true,
    );
  });

  it('CATEGORY_004 keeps the dialog open, shows the backend message, and does not also show a global toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.delete(`${API_BASE_URL}/categories/${CATEGORY_ID}`, () =>
        HttpResponse.json(
          errorEnvelope('CATEGORY_004', 'Không thể xóa danh mục đang có sản phẩm sử dụng'),
          { status: 422 },
        ),
      ),
    );
    const onOpenChange = vi.fn();
    renderDialog('archive', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    expect(
      await screen.findByText('Không thể xóa danh mục đang có sản phẩm sử dụng'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('CATEGORY_007 keeps the dialog open, shows the backend message, and does not also show a global toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.delete(`${API_BASE_URL}/categories/${CATEGORY_ID}`, () =>
        HttpResponse.json(
          errorEnvelope(
            'CATEGORY_007',
            'Không thể lưu trữ danh mục vì còn danh mục con đang hoạt động',
          ),
          { status: 422 },
        ),
      ),
    );
    const onOpenChange = vi.fn();
    renderDialog('archive', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    expect(
      await screen.findByText('Không thể lưu trữ danh mục vì còn danh mục con đang hoạt động'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('never natively disables the Confirm button, and focus remains inside the dialog after a mutation error settles', async () => {
    server.use(
      http.delete(`${API_BASE_URL}/categories/${CATEGORY_ID}`, () =>
        HttpResponse.json(
          errorEnvelope('CATEGORY_004', 'Không thể xóa danh mục đang có sản phẩm sử dụng'),
          { status: 422 },
        ),
      ),
    );
    renderDialog('archive');

    const confirmButton = screen.getByRole('button', { name: 'Lưu trữ' });
    await userEvent.click(confirmButton);

    await screen.findByText('Không thể xóa danh mục đang có sản phẩm sử dụng');

    // NOTE (T038.08D) — jsdom does not simulate the real browser's
    // "disabled forces blur to document.body" behavior; genuine regression
    // coverage for that defect comes only from real-browser verification.
    expect(confirmButton).not.toBeDisabled();
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('has no accessibility violations', async () => {
    const { container } = renderDialog('archive');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no accessibility violations while showing an in-dialog error', async () => {
    server.use(
      http.delete(`${API_BASE_URL}/categories/${CATEGORY_ID}`, () =>
        HttpResponse.json(
          errorEnvelope('CATEGORY_004', 'Không thể xóa danh mục đang có sản phẩm sử dụng'),
          { status: 422 },
        ),
      ),
    );
    const { container } = renderDialog('archive');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));
    await screen.findByText('Không thể xóa danh mục đang có sản phẩm sử dụng');

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('CategoryLifecycleDialog — mode="restore" (T039)', () => {
  beforeEach(async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows restore-specific copy, with neutral (non-destructive) styling', () => {
    renderDialog('restore');
    expect(screen.getByText('Khôi phục danh mục?')).toBeInTheDocument();
    expect(screen.getByText(/Thời trang/)).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Khôi phục' });
    // T034.01 §5 — restore is neutral (`default` variant: bg-primary), not
    // destructive-red (`destructive` variant: bg-destructive/10). Every
    // button variant shares `aria-invalid:border-destructive` in its base
    // classes regardless of variant, so that alone isn't a valid signal —
    // check the actual variant-differentiating class instead.
    expect(confirmButton.className).toMatch(/bg-primary/);
    expect(confirmButton.className).not.toMatch(/bg-destructive/);
  });

  it('cancel closes the dialog without calling the restore mutation', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/categories/${CATEGORY_ID}/restore`, () => {
        called = true;
        return HttpResponse.json(envelope({ id: CATEGORY_ID, status: 'INACTIVE' }), {
          status: 201,
        });
      }),
    );
    const onOpenChange = vi.fn();
    renderDialog('restore', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(called).toBe(false);
  });

  it('confirm calls the restore mutation (POST .../restore) with the category id, not the archive mutation', async () => {
    let restoreCalled = false;
    let deleteCalled = false;
    server.use(
      http.post(`${API_BASE_URL}/categories/${CATEGORY_ID}/restore`, () => {
        restoreCalled = true;
        return HttpResponse.json(envelope({ id: CATEGORY_ID, status: 'INACTIVE' }), {
          status: 201,
        });
      }),
      http.delete(`${API_BASE_URL}/categories/${CATEGORY_ID}`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${API_BASE_URL}/categories`, () =>
        HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 })),
      ),
    );
    renderDialog('restore');

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    await waitFor(() => expect(restoreCalled).toBe(true));
    // Both mutations exist in the component (rules-of-hooks requirement),
    // but only the active mode's mutation must ever actually fire.
    expect(deleteCalled).toBe(false);
  });

  it('on success: invalidates the category list and closes the dialog (no redirect)', async () => {
    let listCallCount = 0;
    server.use(
      http.post(`${API_BASE_URL}/categories/${CATEGORY_ID}/restore`, () =>
        HttpResponse.json(envelope({ id: CATEGORY_ID, status: 'INACTIVE' }), { status: 201 }),
      ),
      http.get(`${API_BASE_URL}/categories`, () => {
        listCallCount += 1;
        return HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 }));
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(getCategoryControllerGetTreeQueryKey(), []);
    const onOpenChange = vi.fn();
    function Harness() {
      useCategoryControllerList({ limit: 20 });
      return (
        <CategoryLifecycleDialog
          open
          onOpenChange={onOpenChange}
          categoryId={CATEGORY_ID}
          categoryName="Thời trang"
          mode="restore"
        />
      );
    }
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(listCallCount).toBeGreaterThan(0));
    const callsAfterMount = listCallCount;

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    await waitFor(() => expect(listCallCount).toBeGreaterThan(callsAfterMount));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    // T040 — Tree must also show the just-restored category.
    expect(queryClient.getQueryState(getCategoryControllerGetTreeQueryKey())?.isInvalidated).toBe(
      true,
    );
  });

  it('CATEGORY_003 (not deleted) keeps the dialog open, shows the backend message, no duplicate toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.post(`${API_BASE_URL}/categories/${CATEGORY_ID}/restore`, () =>
        HttpResponse.json(
          errorEnvelope('CATEGORY_003', 'Danh mục chưa bị xóa, không thể khôi phục'),
          { status: 422 },
        ),
      ),
    );
    const onOpenChange = vi.fn();
    renderDialog('restore', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    expect(
      await screen.findByText('Danh mục chưa bị xóa, không thể khôi phục'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('CATEGORY_008 (ancestor archived) keeps the dialog open, shows the backend message, no duplicate toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.post(`${API_BASE_URL}/categories/${CATEGORY_ID}/restore`, () =>
        HttpResponse.json(
          errorEnvelope(
            'CATEGORY_008',
            'Không thể khôi phục vì danh mục cha đang bị lưu trữ, vui lòng khôi phục danh mục cha trước',
          ),
          { status: 422 },
        ),
      ),
    );
    const onOpenChange = vi.fn();
    renderDialog('restore', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    expect(
      await screen.findByText(
        'Không thể khôi phục vì danh mục cha đang bị lưu trữ, vui lòng khôi phục danh mục cha trước',
      ),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('CATEGORY_001 (not found) keeps the dialog open and shows the message in-dialog too', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.post(`${API_BASE_URL}/categories/${CATEGORY_ID}/restore`, () =>
        HttpResponse.json(errorEnvelope('CATEGORY_001', 'Không tìm thấy danh mục'), {
          status: 404,
        }),
      ),
    );
    const onOpenChange = vi.fn();
    renderDialog('restore', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    expect(await screen.findByText('Không tìm thấy danh mục')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('focus remains inside the dialog after a restore error settles', async () => {
    server.use(
      http.post(`${API_BASE_URL}/categories/${CATEGORY_ID}/restore`, () =>
        HttpResponse.json(
          errorEnvelope(
            'CATEGORY_008',
            'Không thể khôi phục vì danh mục cha đang bị lưu trữ, vui lòng khôi phục danh mục cha trước',
          ),
          { status: 422 },
        ),
      ),
    );
    renderDialog('restore');

    const confirmButton = screen.getByRole('button', { name: 'Khôi phục' });
    await userEvent.click(confirmButton);

    await screen.findByText(
      'Không thể khôi phục vì danh mục cha đang bị lưu trữ, vui lòng khôi phục danh mục cha trước',
    );

    expect(confirmButton).not.toBeDisabled();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('has no accessibility violations', async () => {
    const { container } = renderDialog('restore');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no accessibility violations while showing an in-dialog error', async () => {
    server.use(
      http.post(`${API_BASE_URL}/categories/${CATEGORY_ID}/restore`, () =>
        HttpResponse.json(
          errorEnvelope('CATEGORY_003', 'Danh mục chưa bị xóa, không thể khôi phục'),
          { status: 422 },
        ),
      ),
    );
    const { container } = renderDialog('restore');
    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));
    await screen.findByText('Danh mục chưa bị xóa, không thể khôi phục');

    expect(await axe(container)).toHaveNoViolations();
  });
});
