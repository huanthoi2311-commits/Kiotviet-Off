import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import type { RoleResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { AssignRoleDialog } from './assign-role-dialog';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const USER_ID = 'user-1';

const AVAILABLE_ROLES: RoleResponseDto[] = [
  {
    id: 'role-1',
    organizationId: 'org-1',
    code: 'sales_staff',
    name: 'Nhân viên bán hàng',
    isSystem: false,
    description: null,
  },
];

function envelope<T>(data: T) {
  return { success: true, data, meta: null, traceId: 't-1', timestamp: new Date().toISOString() };
}

function renderDialog(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AssignRoleDialog
        open
        onOpenChange={onOpenChange}
        userId={USER_ID}
        availableRoles={AVAILABLE_ROLES}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onOpenChange };
}

describe('AssignRoleDialog (T052.03C §9)', () => {
  beforeEach(async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('the confirm button is disabled until a role is selected', async () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Gán vai trò' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('shows "no roles to assign" when availableRoles is empty (every role already held)', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <AssignRoleDialog open onOpenChange={vi.fn()} userId={USER_ID} availableRoles={[]} />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('combobox'));
    expect(await screen.findByText('Không còn vai trò nào để gán.')).toBeInTheDocument();
  });

  it('selecting a role and confirming calls POST /roles/assign with { userId, roleId }', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${API_BASE_URL}/roles/assign`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(envelope(null), { status: 201 });
      }),
    );

    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: /Nhân viên bán hàng/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Gán vai trò' }));

    await waitFor(() => expect(capturedBody).toEqual({ userId: USER_ID, roleId: 'role-1' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('on mutation failure, keeps the dialog open and shows the error inline', async () => {
    server.use(
      http.post(`${API_BASE_URL}/roles/assign`, () =>
        HttpResponse.json(
          { success: false, code: 'RBAC_005', message: 'Không tìm thấy người dùng', errors: [] },
          { status: 404 },
        ),
      ),
    );

    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: /Nhân viên bán hàng/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Gán vai trò' }));

    expect(await screen.findByText('Không tìm thấy người dùng')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('has no accessibility violations', async () => {
    const { container } = renderDialog();
    expect(await axe(container)).toHaveNoViolations();
  });
});
