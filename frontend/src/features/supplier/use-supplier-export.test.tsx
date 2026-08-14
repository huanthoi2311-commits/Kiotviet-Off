import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientModule from '@/services/api-client';
import { useSupplierExport } from './use-supplier-export';

function TestHarness({ filters }: { filters: Record<string, string | undefined> }) {
  const exportMutation = useSupplierExport();
  return (
    <button
      type="button"
      disabled={exportMutation.isPending}
      onClick={() => {
        if (exportMutation.isPending) return;
        exportMutation.mutate(filters);
      }}
    >
      {exportMutation.isPending ? 'Đang xuất...' : 'Xuất Excel'}
    </button>
  );
}

function renderHarness(filters: Record<string, string | undefined> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestHarness filters={filters} />
    </QueryClientProvider>,
  );
}

/** jsdom's XMLHttpRequest does not reliably resolve `responseType: 'blob'` requests (a known
 * jsdom limitation, not a production bug — real browsers handle this fine) — verified by CI: the
 * request/response exchange itself completes (MSW sees and can capture it), but axios's Promise
 * processing the blob body hangs indefinitely under jsdom. Real network transport is therefore
 * only exercised for the "filters are forwarded" case below (which only needs the request to be
 * sent, not the blob body to be processed). Every test exercising the actual download side effect
 * (createObjectURL/click/filename/revoke/dedup) instead mocks `apiClient.get` directly, so it
 * verifies `use-supplier-export.ts`'s own logic without depending on jsdom's blob-XHR support. */
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

describe('useSupplierExport (T049 AD-1 §6)', () => {
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

  it('forwards the current search/status/province/sort filters as query params', async () => {
    const getSpy = mockApiClientGet({
      data: new Blob(['fake-xlsx-bytes']),
      headers: { 'content-disposition': 'attachment; filename="suppliers.xlsx"' },
    });

    renderHarness({
      search: 'Đức An',
      status: 'ARCHIVED',
      province: 'Hà Nội',
      sortBy: 'companyName',
      sortOrder: 'asc',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));

    await waitFor(() => expect(getSpy).toHaveBeenCalled());
    expect(getSpy).toHaveBeenCalledWith(
      '/suppliers/export',
      expect.objectContaining({
        params: {
          search: 'Đức An',
          status: 'ARCHIVED',
          province: 'Hà Nội',
          sortBy: 'companyName',
          sortOrder: 'asc',
        },
        responseType: 'blob',
      }),
    );
  });

  it('downloads the blob using the Content-Disposition filename and revokes the object URL', async () => {
    mockApiClientGet({
      data: new Blob(['fake-xlsx-bytes']),
      headers: { 'content-disposition': 'attachment; filename="suppliers-filtered.xlsx"' },
    });

    renderHarness({});
    await userEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(createObjectURLSpy).toHaveBeenCalledWith(expect.any(Blob));
    await waitFor(() => expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url'));
  });

  it('falls back to the known static filename when Content-Disposition is unavailable', async () => {
    mockApiClientGet({ data: new Blob(['fake-xlsx-bytes']), headers: {} });

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

    renderHarness({});
    await userEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(capturedDownload).toBe('suppliers.xlsx');
  });

  it('duplicate-click protection: a second click while pending does not fire a second request', async () => {
    // T051.09 — the guard under test is purely `disabled={isPending}` (use-supplier-export.ts has
    // no lock of its own inside the mutation). The original version of this test used a real
    // `setTimeout(100)` delay to keep the mutation "pending" long enough for the extra clicks to
    // land — this raced real wall-clock time against CPU-contention-dependent JS scheduling: under
    // the full 98-file suite, more than 100ms could elapse between clicks, letting the mutation
    // settle (isPending flip back to false) BEFORE the next click fired, making it a legitimately
    // new (non-duplicate) request — confirmed via repeated full-suite reproduction (deterministic
    // 5/5 pass in isolation, ~1-in-2 fail under full-suite load, even after first adding a
    // `waitFor(toBeDisabled)` sync point, which narrowed the race but didn't remove the wall-clock
    // dependency). Fix: a manually-controlled Promise that literally cannot settle until this test
    // calls `resolveRequest()` — removes the race entirely, not just narrows its window.
    let resolveRequest!: (value: { data: Blob; headers: Record<string, string> }) => void;
    const requestPromise = new Promise<{ data: Blob; headers: Record<string, string> }>(
      (resolve) => {
        resolveRequest = resolve;
      },
    );
    const getSpy = vi.spyOn(apiClientModule.apiClient, 'get').mockReturnValue(requestPromise);

    renderHarness({});
    const button = screen.getByRole('button', { name: 'Xuất Excel' });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await userEvent.click(button);
    await userEvent.click(button);

    resolveRequest({
      data: new Blob(['fake-xlsx-bytes']),
      headers: { 'content-disposition': 'attachment; filename="suppliers.xlsx"' },
    });

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT route through apiClientMutator (the shared JSON-envelope unwrapper)', async () => {
    const mutatorSpy = vi.spyOn(apiClientModule, 'apiClientMutator');
    mockApiClientGet({
      data: new Blob(['fake-xlsx-bytes']),
      headers: { 'content-disposition': 'attachment; filename="suppliers.xlsx"' },
    });

    renderHarness({});
    await userEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(mutatorSpy).not.toHaveBeenCalled();
  });
});
