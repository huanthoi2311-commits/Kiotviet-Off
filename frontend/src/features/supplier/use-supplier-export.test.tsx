import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import * as apiClientModule from '@/services/api-client';
import { useSupplierExport } from './use-supplier-export';

const API_BASE_URL = 'http://localhost:3000/api/v1';

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
    let lastUrl: URL | undefined;
    server.use(
      http.get(`${API_BASE_URL}/suppliers/export`, ({ request }) => {
        lastUrl = new URL(request.url);
        // Plain string body, not `new Blob([...])` — MSW's node-side XHR interceptor
        // constructs a `Response` internally to fulfill the request, and Node's undici
        // `extractBody` calls `.stream()` on a Blob body; the Blob implementation in this
        // Vitest/jsdom/Node combination doesn't implement it ("object.stream is not a
        // function"), an environment-level MSW/undici/jsdom interaction, not a production
        // concern. This test only needs the request URL, never processes the response body.
        return new HttpResponse('fake-xlsx-bytes', {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="suppliers.xlsx"',
          },
        });
      }),
    );

    renderHarness({
      search: 'Đức An',
      status: 'ARCHIVED',
      province: 'Hà Nội',
      sortBy: 'companyName',
      sortOrder: 'asc',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));

    await waitFor(() => expect(lastUrl).toBeDefined());
    expect(lastUrl?.searchParams.get('search')).toBe('Đức An');
    expect(lastUrl?.searchParams.get('status')).toBe('ARCHIVED');
    expect(lastUrl?.searchParams.get('province')).toBe('Hà Nội');
    expect(lastUrl?.searchParams.get('sortBy')).toBe('companyName');
    expect(lastUrl?.searchParams.get('sortOrder')).toBe('asc');
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
    const getSpy = mockApiClientGet(
      {
        data: new Blob(['fake-xlsx-bytes']),
        headers: { 'content-disposition': 'attachment; filename="suppliers.xlsx"' },
      },
      { delayMs: 100 },
    );

    renderHarness({});
    const button = screen.getByRole('button', { name: 'Xuất Excel' });
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

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
