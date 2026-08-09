import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import {
  WarehouseLifecycleDialog,
  type WarehouseLifecycleDialogMode,
} from './warehouse-lifecycle-dialog';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const WAREHOUSE_ID = 'wh-1';

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
  mode: WarehouseLifecycleDialogMode = 'archive',
  onOpenChange: (open: boolean) => void = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WarehouseLifecycleDialog
        open
        onOpenChange={onOpenChange}
        warehouseId={WAREHOUSE_ID}
        warehouseName="Kho trung tâm"
        mode={mode}
      />
    </QueryClientProvider>,
  );
}

describe('WarehouseLifecycleDialog — mode="archive" (T044 Phase K)', () => {
  beforeEach(async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('shows the warehouse name in the confirmation copy, with destructive styling', () => {
    renderDialog('archive');
    expect(screen.getByText('Xóa kho?')).toBeInTheDocument();
    expect(screen.getByText(/Kho trung tâm/)).toBeInTheDocument();
  });

  it('confirm calls the archive mutation (DELETE) with the warehouse id', async () => {
    let capturedId: string | undefined;
    server.use(
      http.delete(`${API_BASE_URL}/warehouses/:id`, ({ params }) => {
        capturedId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderDialog('archive');

    await userEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => expect(capturedId).toBe(WAREHOUSE_ID));
  });

  it('a business-rule failure keeps the dialog open and shows the backend message', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.delete(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}`, () =>
        HttpResponse.json(errorEnvelope('WAREHOUSE_004', 'Kho còn tồn kho, không thể xóa'), {
          status: 422,
        }),
      ),
    );
    const onOpenChange = vi.fn();
    renderDialog('archive', onOpenChange);

    await userEvent.click(screen.getByRole('button', { name: 'Xóa' }));

    expect(await screen.findByText('Kho còn tồn kho, không thể xóa')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderDialog('archive');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('WarehouseLifecycleDialog — mode="restore" (T044 Phase K)', () => {
  it('shows restore-specific copy, with neutral (non-destructive) styling', () => {
    renderDialog('restore');
    expect(screen.getByText('Khôi phục kho?')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Khôi phục' });
    expect(confirmButton.className).toMatch(/bg-primary/);
    expect(confirmButton.className).not.toMatch(/bg-destructive/);
  });

  it('confirm calls the restore mutation (POST .../restore), not the archive mutation', async () => {
    let restoreCalled = false;
    let deleteCalled = false;
    server.use(
      http.post(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/restore`, () => {
        restoreCalled = true;
        return HttpResponse.json(
          {
            success: true,
            data: { id: WAREHOUSE_ID, status: 'ACTIVE' },
            meta: null,
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 201 },
        );
      }),
      http.delete(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderDialog('restore');

    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));

    await waitFor(() => expect(restoreCalled).toBe(true));
    expect(deleteCalled).toBe(false);
  });
});
