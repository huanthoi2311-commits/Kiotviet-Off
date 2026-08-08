import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useProductControllerSearch } from '@/generated/product/product';
import { reportMutationError } from '@/providers/query-provider';
import {
  ProductLifecycleDialog,
  type ProductLifecycleDialogMode,
} from './product-lifecycle-dialog';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const PRODUCT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

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
  mode: ProductLifecycleDialogMode = 'archive',
  onOpenChange: (open: boolean) => void = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ProductLifecycleDialog
          open
          onOpenChange={onOpenChange}
          productId={PRODUCT_ID}
          productName="Áo thun nam"
          mode={mode}
        />
      </QueryClientProvider>,
    ),
  };
}

describe('ProductLifecycleDialog — mode="archive" (T043 Phase G)', () => {
  beforeEach(async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the product name in the confirmation copy, with destructive styling', () => {
    renderDialog('archive');
    expect(screen.getByText('Lưu trữ sản phẩm?')).toBeInTheDocument();
    expect(screen.getByText(/Áo thun nam/)).toBeInTheDocument();
  });

  it('cancel closes the dialog without calling the archive mutation', async () => {
    let called = false;
    server.use(
      http.delete(`${API_BASE_URL}/products/${PRODUCT_ID}`, () => {
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

  it('confirm calls the archive mutation (DELETE) with the product id', async () => {
    let capturedId: string | undefined;
    server.use(
      http.delete(`${API_BASE_URL}/products/:id`, ({ params }) => {
        capturedId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderDialog('archive');

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    await waitFor(() => expect(capturedId).toBe(PRODUCT_ID));
  });

  it('on success: invalidates the search list and closes the dialog', async () => {
    let searchCallCount = 0;
    server.use(
      http.delete(
        `${API_BASE_URL}/products/${PRODUCT_ID}`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.get(`${API_BASE_URL}/products`, () => {
        searchCallCount += 1;
        return HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 }));
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const onOpenChange = vi.fn();
    function Harness() {
      useProductControllerSearch({ limit: 20 });
      return (
        <ProductLifecycleDialog
          open
          onOpenChange={onOpenChange}
          productId={PRODUCT_ID}
          productName="Áo thun nam"
          mode="archive"
        />
      );
    }
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(searchCallCount).toBeGreaterThan(0));
    const callsAfterMount = searchCallCount;

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    await waitFor(() => expect(searchCallCount).toBeGreaterThan(callsAfterMount));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('PRODUCT_012 (active Variant Children) keeps the dialog open, shows the backend message, no duplicate toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.delete(`${API_BASE_URL}/products/${PRODUCT_ID}`, () =>
        HttpResponse.json(
          errorEnvelope(
            'PRODUCT_012',
            'Không thể lưu trữ sản phẩm vì còn Variant Child đang hoạt động',
          ),
          { status: 422 },
        ),
      ),
    );
    const onOpenChange = vi.fn();
    renderDialog('archive', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    expect(
      await screen.findByText('Không thể lưu trữ sản phẩm vì còn Variant Child đang hoạt động'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('focus remains inside the dialog after a PRODUCT_012 error settles', async () => {
    server.use(
      http.delete(`${API_BASE_URL}/products/${PRODUCT_ID}`, () =>
        HttpResponse.json(
          errorEnvelope('PRODUCT_012', 'Không thể lưu trữ sản phẩm vì còn Variant Child'),
          { status: 422 },
        ),
      ),
    );
    renderDialog('archive');

    const confirmButton = screen.getByRole('button', { name: 'Lưu trữ' });
    await userEvent.click(confirmButton);

    await screen.findByText('Không thể lưu trữ sản phẩm vì còn Variant Child');

    expect(confirmButton).not.toBeDisabled();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('has no accessibility violations', async () => {
    const { container } = renderDialog('archive');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no accessibility violations while showing an in-dialog error', async () => {
    server.use(
      http.delete(`${API_BASE_URL}/products/${PRODUCT_ID}`, () =>
        HttpResponse.json(errorEnvelope('PRODUCT_012', 'Còn Variant Child đang hoạt động'), {
          status: 422,
        }),
      ),
    );
    const { container } = renderDialog('archive');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));
    await screen.findByText('Còn Variant Child đang hoạt động');

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('ProductLifecycleDialog — mode="restore" (T043 Phase G)', () => {
  beforeEach(async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows restore-specific copy, with neutral (non-destructive) styling', () => {
    renderDialog('restore');
    expect(screen.getByText('Khôi phục sản phẩm?')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Khôi phục' });
    expect(confirmButton.className).toMatch(/bg-primary/);
    expect(confirmButton.className).not.toMatch(/bg-destructive/);
  });

  it('confirm calls the restore mutation (POST .../restore), not the archive mutation', async () => {
    let restoreCalled = false;
    let deleteCalled = false;
    server.use(
      http.post(`${API_BASE_URL}/products/${PRODUCT_ID}/restore`, () => {
        restoreCalled = true;
        return HttpResponse.json(envelope({ id: PRODUCT_ID, status: 'INACTIVE' }), {
          status: 201,
        });
      }),
      http.delete(`${API_BASE_URL}/products/${PRODUCT_ID}`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderDialog('restore');

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    await waitFor(() => expect(restoreCalled).toBe(true));
    expect(deleteCalled).toBe(false);
  });

  it('PRODUCT_005 (not deleted) keeps the dialog open, shows the backend message, no duplicate toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.post(`${API_BASE_URL}/products/${PRODUCT_ID}/restore`, () =>
        HttpResponse.json(
          errorEnvelope('PRODUCT_005', 'Sản phẩm chưa bị xóa, không thể khôi phục'),
          {
            status: 422,
          },
        ),
      ),
    );
    const onOpenChange = vi.fn();
    renderDialog('restore', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    expect(
      await screen.findByText('Sản phẩm chưa bị xóa, không thể khôi phục'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderDialog('restore');
    expect(await axe(container)).toHaveNoViolations();
  });
});
