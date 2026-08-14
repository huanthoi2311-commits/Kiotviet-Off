import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import type { PermissionResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { PermissionMatrix } from './permission-matrix';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const ROLE_ID = 'role-1';

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

// Orval renders `description` as `{ [key: string]: unknown } | null` (the same nullable-string
// codegen quirk `asNullableString()` works around at runtime) — a plain string literal here needs
// an explicit cast, same as every other fixture in this codebase hitting that quirk.
const PERMISSIONS = [
  { id: 'p1', code: 'product:view', group: 'product', description: 'Xem sản phẩm' },
  { id: 'p2', code: 'product:update', group: 'product', description: 'Sửa sản phẩm' },
  { id: 'p3', code: 'customer:view', group: 'customer', description: 'Xem khách hàng' },
] as unknown as PermissionResponseDto[];

function renderMatrix(props: Partial<React.ComponentProps<typeof PermissionMatrix>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PermissionMatrix
        roleId={ROLE_ID}
        permissions={PERMISSIONS}
        initialPermissionCodes={['product:view']}
        canEdit
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('PermissionMatrix (T052.03C §6)', () => {
  beforeEach(async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('groups permissions by `group`, with a semantic fieldset/legend per group', () => {
    renderMatrix();
    expect(screen.getByRole('group', { name: /product/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /customer/i })).toBeInTheDocument();
  });

  it('checkbox accessible name includes both description and code', () => {
    renderMatrix();
    expect(
      screen.getByRole('checkbox', { name: 'Xem sản phẩm (product:view)' }),
    ).toBeInTheDocument();
  });

  it('renders initial selection checked, others unchecked', () => {
    renderMatrix();
    expect(screen.getByRole('checkbox', { name: /product:view/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /product:update/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /customer:view/ })).not.toBeChecked();
  });

  it('toggling an individual checkbox updates its own state', async () => {
    renderMatrix();
    const checkbox = screen.getByRole('checkbox', { name: /product:update/ });
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('group select-all is a real checkbox, indeterminate when some (not all) group members are selected', () => {
    renderMatrix();
    const groupCheckbox = screen.getByRole('checkbox', { name: /Chọn tất cả — product/ });
    expect(groupCheckbox).toHaveAttribute('data-indeterminate');
  });

  it('clicking group select-all selects every permission in that group', async () => {
    renderMatrix();
    await userEvent.click(screen.getByRole('checkbox', { name: /Chọn tất cả — product/ }));
    expect(screen.getByRole('checkbox', { name: /product:view/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /product:update/ })).toBeChecked();
  });

  it('blocks submission with a validation message when every permission is deselected, and makes zero network calls', async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/roles/${ROLE_ID}/permissions`, () => {
        called = true;
        return HttpResponse.json(envelope({ ...PERMISSIONS, permissionCodes: [] }));
      }),
    );

    renderMatrix();
    await userEvent.click(screen.getByRole('checkbox', { name: /product:view/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu quyền' }));

    expect(
      await screen.findByText('Phải chọn ít nhất một quyền trước khi lưu.'),
    ).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('save submits the COMPLETE selected set (not a delta)', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${API_BASE_URL}/roles/${ROLE_ID}/permissions`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(
          envelope({
            id: ROLE_ID,
            organizationId: 'org-1',
            code: 'sales_staff',
            name: 'Sales',
            isSystem: false,
            description: null,
            permissionCodes: ['product:view', 'customer:view'],
          }),
        );
      }),
    );

    renderMatrix();
    await userEvent.click(screen.getByRole('checkbox', { name: /customer:view/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu quyền' }));

    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        permissionCodes: expect.arrayContaining(['product:view', 'customer:view']),
      }),
    );
    expect((capturedBody as { permissionCodes: string[] }).permissionCodes).toHaveLength(2);
  });

  it('on RBAC_006, keeps the editor open with the in-progress selection intact and shows the error inline', async () => {
    server.use(
      http.post(`${API_BASE_URL}/roles/${ROLE_ID}/permissions`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'RBAC_006',
            message: 'Thao tác sẽ khiến chủ sở hữu tổ chức mất quyền role:update',
            errors: [],
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 409 },
        ),
      ),
    );

    renderMatrix();
    await userEvent.click(screen.getByRole('checkbox', { name: /product:update/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu quyền' }));

    expect(
      await screen.findByText('Thao tác sẽ khiến chủ sở hữu tổ chức mất quyền role:update'),
    ).toBeInTheDocument();
    // Editor stays open — the in-progress (unsaved) selection is preserved, not reset.
    expect(screen.getByRole('checkbox', { name: /product:view/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /product:update/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Lưu quyền' })).toBeInTheDocument();
  });

  it('mutation error is announced via role="alert"', async () => {
    server.use(
      http.post(`${API_BASE_URL}/roles/${ROLE_ID}/permissions`, () =>
        HttpResponse.json(
          { success: false, code: 'RBAC_003', message: 'Permission code không hợp lệ', errors: [] },
          { status: 404 },
        ),
      ),
    );

    renderMatrix();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu quyền' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission code không hợp lệ');
  });

  it('read-only mode (canEdit=false): checkboxes are disabled, no Save/Cancel row, but current selection is still visible', () => {
    renderMatrix({ canEdit: false });
    expect(screen.getByRole('checkbox', { name: /product:view/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /product:view/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Lưu quyền' })).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderMatrix();
    expect(await axe(container)).toHaveNoViolations();
  });
});
