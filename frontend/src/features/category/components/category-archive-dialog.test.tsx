import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useCategoryControllerList } from '@/generated/category/category';
import { reportMutationError } from '@/providers/query-provider';
import { CategoryArchiveDialog } from './category-archive-dialog';

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

function renderDialog(onOpenChange: (open: boolean) => void = vi.fn()) {
  // T038.08B — the real MutationCache config (not a bare QueryClient), so
  // the dialog's `meta: { suppressGlobalErrorToast: true }` is actually
  // exercised end-to-end, not just present in source.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CategoryArchiveDialog
        open
        onOpenChange={onOpenChange}
        categoryId={CATEGORY_ID}
        categoryName="Thời trang"
      />
    </QueryClientProvider>,
  );
}

describe('CategoryArchiveDialog (T038.10 + T038.08B error dedup)', () => {
  beforeEach(async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the category name in the confirmation copy', () => {
    renderDialog();
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
    renderDialog(onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(called).toBe(false);
  });

  it('confirm calls the archive mutation with the category id', async () => {
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
    renderDialog();

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
    const onOpenChange = vi.fn();
    // Renders the dialog alongside a real, active `useCategoryControllerList`
    // query — the exact same query-key shape `getCategoryControllerListQueryKey()`
    // targets — so a genuine background refetch after invalidation is
    // observable, matching T037.10's own evidence pattern (no hand-rolled
    // query key, which wouldn't reliably match the Orval-generated one).
    function Harness() {
      useCategoryControllerList({ limit: 20 });
      return (
        <CategoryArchiveDialog
          open
          onOpenChange={onOpenChange}
          categoryId={CATEGORY_ID}
          categoryName="Thời trang"
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

    // Invalidating a still-active list query triggers an immediate
    // background refetch — a second GET call is direct evidence
    // invalidation actually fired (same evidence pattern as T037.10).
    await waitFor(() => expect(listCallCount).toBeGreaterThan(callsAfterMount));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('CATEGORY_004 keeps the dialog open, shows the backend message, and does not also show a global toast (T038.08B)', async () => {
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
    renderDialog(onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    expect(
      await screen.findByText('Không thể xóa danh mục đang có sản phẩm sử dụng'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // Before T038.08B, the global MutationCache handler would ALSO have
    // called toast.error with this exact message — the duplicate T038.11
    // found live in a browser. The suppressGlobalErrorToast meta flag
    // must prevent that here.
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('CATEGORY_007 keeps the dialog open, shows the backend message, and does not also show a global toast (T038.08B)', async () => {
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
    renderDialog(onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    expect(
      await screen.findByText('Không thể lưu trữ danh mục vì còn danh mục con đang hoạt động'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('any other error code keeps the dialog open and shows the message in-dialog too (T038.08B — the dialog is now the sole surface, no global toast to fall back on)', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.delete(`${API_BASE_URL}/categories/${CATEGORY_ID}`, () =>
        HttpResponse.json(errorEnvelope('CATEGORY_001', 'Không tìm thấy danh mục'), {
          status: 404,
        }),
      ),
    );
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    expect(await screen.findByText('Không tìm thấy danh mục')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('never natively disables the Confirm button, and focus remains inside the dialog after a mutation error settles (T038.08D)', async () => {
    server.use(
      http.delete(`${API_BASE_URL}/categories/${CATEGORY_ID}`, () =>
        HttpResponse.json(
          errorEnvelope('CATEGORY_004', 'Không thể xóa danh mục đang có sản phẩm sử dụng'),
          { status: 422 },
        ),
      ),
    );
    renderDialog();

    const confirmButton = screen.getByRole('button', { name: 'Lưu trữ' });
    await userEvent.click(confirmButton);

    await screen.findByText('Không thể xóa danh mục đang có sản phẩm sử dụng');

    // NOTE — this assertion alone does not reproduce T038.08C's defect:
    // verified (by temporarily reverting to `disabled={isConfirming}` and
    // re-running this exact test) that jsdom does NOT simulate the real
    // browser's "disabled forces blur to document.body" behavior, so this
    // test passes against both the buggy and fixed code equally. It is kept
    // as a direct assertion of the intended, correct behavior (never
    // natively disabled, focus stays inside the dialog) — genuine
    // regression coverage for the actual defect comes only from the
    // real-browser Playwright check (T038.08D implementation report §6),
    // which jsdom cannot provide.
    expect(confirmButton).not.toBeDisabled();
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('has no accessibility violations', async () => {
    const { container } = renderDialog();
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
    const { container } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));
    await screen.findByText('Không thể xóa danh mục đang có sản phẩm sử dụng');

    expect(await axe(container)).toHaveNoViolations();
  });
});
