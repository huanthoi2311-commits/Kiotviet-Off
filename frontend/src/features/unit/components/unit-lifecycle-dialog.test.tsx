import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { useUnitControllerSearch } from '@/generated/unit/unit';
import { reportMutationError } from '@/providers/query-provider';
import { UnitLifecycleDialog, type UnitLifecycleDialogMode } from './unit-lifecycle-dialog';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const UNIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

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
  mode: UnitLifecycleDialogMode = 'archive',
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
        <UnitLifecycleDialog
          open
          onOpenChange={onOpenChange}
          unitId={UNIT_ID}
          unitName="Cái"
          mode={mode}
        />
      </QueryClientProvider>,
    ),
  };
}

describe('UnitLifecycleDialog — mode="archive" (T042 Phase F)', () => {
  beforeEach(async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the unit name in the confirmation copy, with destructive styling', () => {
    renderDialog('archive');
    expect(screen.getByText('Lưu trữ đơn vị tính?')).toBeInTheDocument();
    expect(screen.getByText(/Cái/)).toBeInTheDocument();
  });

  it('cancel closes the dialog without calling the archive mutation', async () => {
    let called = false;
    server.use(
      http.delete(`${API_BASE_URL}/units/${UNIT_ID}`, () => {
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

  it('confirm calls the archive mutation (DELETE) with the unit id', async () => {
    let capturedId: string | undefined;
    server.use(
      http.delete(`${API_BASE_URL}/units/:id`, ({ params }) => {
        capturedId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderDialog('archive');

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    await waitFor(() => expect(capturedId).toBe(UNIT_ID));
  });

  it('on success: invalidates the search list and closes the dialog', async () => {
    let searchCallCount = 0;
    server.use(
      http.delete(
        `${API_BASE_URL}/units/${UNIT_ID}`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.get(`${API_BASE_URL}/units`, () => {
        searchCallCount += 1;
        return HttpResponse.json(envelope({ items: [], total: 0, page: 1, limit: 20 }));
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const onOpenChange = vi.fn();
    function Harness() {
      useUnitControllerSearch({ limit: 20 });
      return (
        <UnitLifecycleDialog
          open
          onOpenChange={onOpenChange}
          unitId={UNIT_ID}
          unitName="Cái"
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

  it('UNIT_003 (has products) keeps the dialog open, shows the backend message, no duplicate toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.delete(`${API_BASE_URL}/units/${UNIT_ID}`, () =>
        HttpResponse.json(
          errorEnvelope('UNIT_003', 'Không thể xóa đơn vị tính đang có sản phẩm sử dụng'),
          { status: 422 },
        ),
      ),
    );
    const onOpenChange = vi.fn();
    renderDialog('archive', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    expect(
      await screen.findByText('Không thể xóa đơn vị tính đang có sản phẩm sử dụng'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('UNIT_003 (has barcodes) also keeps the dialog open, shows the backend message — same code, different guard/message', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.delete(`${API_BASE_URL}/units/${UNIT_ID}`, () =>
        HttpResponse.json(
          errorEnvelope('UNIT_003', 'Không thể xóa đơn vị tính đang có mã vạch sử dụng'),
          { status: 422 },
        ),
      ),
    );
    const onOpenChange = vi.fn();
    renderDialog('archive', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    expect(
      await screen.findByText('Không thể xóa đơn vị tính đang có mã vạch sử dụng'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('never natively disables the Confirm button, and focus remains inside the dialog after a mutation error settles', async () => {
    server.use(
      http.delete(`${API_BASE_URL}/units/${UNIT_ID}`, () =>
        HttpResponse.json(
          errorEnvelope('UNIT_003', 'Không thể xóa đơn vị tính đang có sản phẩm sử dụng'),
          { status: 422 },
        ),
      ),
    );
    renderDialog('archive');

    const confirmButton = screen.getByRole('button', { name: 'Lưu trữ' });
    await userEvent.click(confirmButton);

    await screen.findByText('Không thể xóa đơn vị tính đang có sản phẩm sử dụng');

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
      http.delete(`${API_BASE_URL}/units/${UNIT_ID}`, () =>
        HttpResponse.json(
          errorEnvelope('UNIT_003', 'Không thể xóa đơn vị tính đang có sản phẩm sử dụng'),
          { status: 422 },
        ),
      ),
    );
    const { container } = renderDialog('archive');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));
    await screen.findByText('Không thể xóa đơn vị tính đang có sản phẩm sử dụng');

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('UnitLifecycleDialog — mode="restore" (T042 Phase F, discovery via GET /units?status=ARCHIVED)', () => {
  beforeEach(async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows restore-specific copy, with neutral (non-destructive) styling', () => {
    renderDialog('restore');
    expect(screen.getByText('Khôi phục đơn vị tính?')).toBeInTheDocument();
    expect(screen.getByText(/Cái/)).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Khôi phục' });
    expect(confirmButton.className).toMatch(/bg-primary/);
    expect(confirmButton.className).not.toMatch(/bg-destructive/);
  });

  it('cancel closes the dialog without calling the restore mutation', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/units/${UNIT_ID}/restore`, () => {
        called = true;
        return HttpResponse.json(envelope({ id: UNIT_ID, status: 'INACTIVE' }), { status: 201 });
      }),
    );
    const onOpenChange = vi.fn();
    renderDialog('restore', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(called).toBe(false);
  });

  it('confirm calls the restore mutation (POST .../restore) with the unit id, not the archive mutation', async () => {
    let restoreCalled = false;
    let deleteCalled = false;
    server.use(
      http.post(`${API_BASE_URL}/units/${UNIT_ID}/restore`, () => {
        restoreCalled = true;
        return HttpResponse.json(envelope({ id: UNIT_ID, status: 'INACTIVE' }), { status: 201 });
      }),
      http.delete(`${API_BASE_URL}/units/${UNIT_ID}`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderDialog('restore');

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    await waitFor(() => expect(restoreCalled).toBe(true));
    expect(deleteCalled).toBe(false);
  });

  it('on success: invalidates the search list and closes the dialog (no redirect)', async () => {
    server.use(
      http.post(`${API_BASE_URL}/units/${UNIT_ID}/restore`, () =>
        HttpResponse.json(envelope({ id: UNIT_ID, status: 'INACTIVE' }), { status: 201 }),
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      mutationCache: new MutationCache({ onError: reportMutationError }),
    });
    const { getUnitControllerSearchQueryKey } = await import('@/generated/unit/unit');
    queryClient.setQueryData(getUnitControllerSearchQueryKey(), { items: [], total: 0 });
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <UnitLifecycleDialog
          open
          onOpenChange={onOpenChange}
          unitId={UNIT_ID}
          unitName="Cái"
          mode="restore"
        />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(queryClient.getQueryState(getUnitControllerSearchQueryKey())?.isInvalidated).toBe(true);
  });

  it('UNIT_005 (not deleted) keeps the dialog open, shows the backend message, no duplicate toast', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.post(`${API_BASE_URL}/units/${UNIT_ID}/restore`, () =>
        HttpResponse.json(
          errorEnvelope('UNIT_005', 'Đơn vị tính chưa bị xóa, không thể khôi phục'),
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
      await screen.findByText('Đơn vị tính chưa bị xóa, không thể khôi phục'),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('UNIT_001 (not found) keeps the dialog open and shows the message in-dialog too', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.post(`${API_BASE_URL}/units/${UNIT_ID}/restore`, () =>
        HttpResponse.json(errorEnvelope('UNIT_001', 'Không tìm thấy đơn vị tính'), { status: 404 }),
      ),
    );
    const onOpenChange = vi.fn();
    renderDialog('restore', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    expect(await screen.findByText('Không tìm thấy đơn vị tính')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('focus remains inside the dialog after a restore error settles', async () => {
    server.use(
      http.post(`${API_BASE_URL}/units/${UNIT_ID}/restore`, () =>
        HttpResponse.json(
          errorEnvelope('UNIT_005', 'Đơn vị tính chưa bị xóa, không thể khôi phục'),
          {
            status: 422,
          },
        ),
      ),
    );
    renderDialog('restore');

    const confirmButton = screen.getByRole('button', { name: 'Khôi phục' });
    await userEvent.click(confirmButton);

    await screen.findByText('Đơn vị tính chưa bị xóa, không thể khôi phục');

    expect(confirmButton).not.toBeDisabled();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('has no accessibility violations', async () => {
    const { container } = renderDialog('restore');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no accessibility violations while showing an in-dialog error', async () => {
    server.use(
      http.post(`${API_BASE_URL}/units/${UNIT_ID}/restore`, () =>
        HttpResponse.json(
          errorEnvelope('UNIT_005', 'Đơn vị tính chưa bị xóa, không thể khôi phục'),
          {
            status: 422,
          },
        ),
      ),
    );
    const { container } = renderDialog('restore');
    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));
    await screen.findByText('Đơn vị tính chưa bị xóa, không thể khôi phục');

    expect(await axe(container)).toHaveNoViolations();
  });
});
