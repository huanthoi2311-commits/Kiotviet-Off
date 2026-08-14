import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientModule from '@/services/api-client';
import {
  usePurchaseReportExport,
  type PurchaseReportExportFilters,
} from './use-purchase-report-export';

function TestHarness({ filters }: { filters: PurchaseReportExportFilters }) {
  const exportMutation = usePurchaseReportExport();
  return (
    <button
      type="button"
      disabled={exportMutation.isPending}
      onClick={() => {
        if (exportMutation.isPending) return;
        exportMutation.mutate(filters);
      }}
    >
      {exportMutation.isPending ? 'Đang xuất...' : 'Xuất báo cáo'}
    </button>
  );
}

function renderHarness(filters: PurchaseReportExportFilters) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestHarness filters={filters} />
    </QueryClientProvider>,
  );
}

/** Mirrors `use-supplier-export.test.tsx`'s own established workaround (T049): jsdom's XHR does
 * not reliably resolve `responseType: 'blob'` requests via MSW's node interceptor, so every test
 * exercising the actual download side effect mocks `apiClient.get` directly instead of real MSW
 * transport. */
function mockApiClientGet(
  response: { data: Blob; headers: Record<string, string> },
  options?: { delayMs?: number },
) {
  return vi.spyOn(apiClientModule.apiClient, 'get').mockImplementation(async () => {
    if (options?.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    return response;
  });
}

describe('usePurchaseReportExport (T050 AD-2)', () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLSpy = vi.fn(() => 'blob:mock-url');
    revokeObjectURLSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).createObjectURL = createObjectURLSpy;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).revokeObjectURL = revokeObjectURLSpy;
    clickSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLAnchorElement.prototype as any).click = clickSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards dateFrom/dateTo/groupBy/format as query params, uses responseType blob, and calls /purchase-reports/export', async () => {
    const getSpy = mockApiClientGet({
      data: new Blob(['fake-xlsx-bytes']),
      headers: { 'content-disposition': 'attachment; filename="purchase-report-supplier.xlsx"' },
    });

    renderHarness({
      dateFrom: '2026-08-01T00:00:00.000000+07:00',
      dateTo: '2026-08-31T23:59:59.999999+07:00',
      groupBy: 'SUPPLIER',
      format: 'EXCEL',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Xuất báo cáo' }));

    await waitFor(() => expect(getSpy).toHaveBeenCalled());
    expect(getSpy).toHaveBeenCalledWith(
      '/purchase-reports/export',
      expect.objectContaining({
        params: {
          dateFrom: '2026-08-01T00:00:00.000000+07:00',
          dateTo: '2026-08-31T23:59:59.999999+07:00',
          groupBy: 'SUPPLIER',
          format: 'EXCEL',
        },
        responseType: 'blob',
      }),
    );
  });

  it('omitted dateFrom/dateTo are not sent as params', async () => {
    const getSpy = mockApiClientGet({
      data: new Blob(['fake-xlsx-bytes']),
      headers: { 'content-disposition': 'attachment; filename="purchase-report-supplier.xlsx"' },
    });

    renderHarness({ groupBy: 'SUPPLIER', format: 'EXCEL' });
    await userEvent.click(screen.getByRole('button', { name: 'Xuất báo cáo' }));

    await waitFor(() => expect(getSpy).toHaveBeenCalled());
    expect(getSpy).toHaveBeenCalledWith(
      '/purchase-reports/export',
      expect.objectContaining({ params: { groupBy: 'SUPPLIER', format: 'EXCEL' } }),
    );
  });

  it('downloads the blob using the Content-Disposition filename and revokes the object URL', async () => {
    mockApiClientGet({
      data: new Blob(['fake-csv-bytes']),
      headers: { 'content-disposition': 'attachment; filename="purchase-report-month.csv"' },
    });

    renderHarness({ groupBy: 'MONTH', format: 'CSV' });
    await userEvent.click(screen.getByRole('button', { name: 'Xuất báo cáo' }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(createObjectURLSpy).toHaveBeenCalledWith(expect.any(Blob));
    await waitFor(() => expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url'));
  });

  it('falls back to a server-naming-convention filename when Content-Disposition is unavailable', async () => {
    mockApiClientGet({ data: new Blob(['fake-pdf-bytes']), headers: {} });

    let capturedDownload = '';
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'download', {
          set: (value: string) => {
            capturedDownload = value;
          },
          get: () => capturedDownload,
        });
      }
      return el;
    });

    renderHarness({ groupBy: 'PRODUCT', format: 'PDF' });
    await userEvent.click(screen.getByRole('button', { name: 'Xuất báo cáo' }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(capturedDownload).toBe('purchase-report-product.pdf');
  });

  it('duplicate-click protection: a second click while pending does not fire a second request', async () => {
    // T051.09 — mirrors the fix in use-supplier-export.test.tsx (same T050 AD-2 downloadFile()
    // utility, same TestHarness shape): the previous real `setTimeout(100)` delay raced wall-clock
    // time against CPU-contention-dependent JS scheduling under the full suite, letting the
    // mutation settle (isPending flip back to false) before a later click fired, making it a
    // legitimately new (non-duplicate) request. A manually-controlled Promise removes the race
    // entirely — it cannot settle until this test explicitly resolves it.
    let resolveRequest!: (value: { data: Blob; headers: Record<string, string> }) => void;
    const requestPromise = new Promise<{ data: Blob; headers: Record<string, string> }>(
      (resolve) => {
        resolveRequest = resolve;
      },
    );
    const getSpy = vi.spyOn(apiClientModule.apiClient, 'get').mockReturnValue(requestPromise);

    renderHarness({ groupBy: 'SUPPLIER', format: 'EXCEL' });
    const button = screen.getByRole('button', { name: 'Xuất báo cáo' });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await userEvent.click(button);
    await userEvent.click(button);

    resolveRequest({
      data: new Blob(['fake-xlsx-bytes']),
      headers: { 'content-disposition': 'attachment; filename="purchase-report-supplier.xlsx"' },
    });

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT route through apiClientMutator (the shared JSON-envelope unwrapper)', async () => {
    const mutatorSpy = vi.spyOn(apiClientModule, 'apiClientMutator');
    mockApiClientGet({
      data: new Blob(['fake-xlsx-bytes']),
      headers: { 'content-disposition': 'attachment; filename="purchase-report-supplier.xlsx"' },
    });

    renderHarness({ groupBy: 'SUPPLIER', format: 'EXCEL' });
    await userEvent.click(screen.getByRole('button', { name: 'Xuất báo cáo' }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(mutatorSpy).not.toHaveBeenCalled();
  });
});
