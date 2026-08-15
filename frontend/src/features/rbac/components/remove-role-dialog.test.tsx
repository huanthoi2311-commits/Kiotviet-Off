import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { RemoveRoleDialog } from './remove-role-dialog';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const USER_ID = 'user-1';
const ROLE_ID = 'role-1';

function renderDialog(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RemoveRoleDialog
        open
        onOpenChange={onOpenChange}
        userId={USER_ID}
        roleId={ROLE_ID}
        roleCode="sales_staff"
      />
    </QueryClientProvider>,
  );
  return { ...utils, onOpenChange };
}

describe('RemoveRoleDialog (T052.03C §10)', () => {
  beforeEach(async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('requires confirmation and mentions the role code (access-may-be-lost framing)', () => {
    renderDialog();
    expect(screen.getByText('Gỡ vai trò khỏi người dùng?')).toBeInTheDocument();
    expect(screen.getByText(/"sales_staff"/)).toBeInTheDocument();
  });

  it('confirming calls DELETE /roles/:roleId/users/:userId and closes on success', async () => {
    server.use(
      http.delete(`${API_BASE_URL}/roles/${ROLE_ID}/users/${USER_ID}`, () =>
        HttpResponse.text('', { status: 204 }),
      ),
    );

    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Gỡ vai trò' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('on RBAC_006, keeps the dialog open and explains the owner protection WITHOUT calling it a "system role" restriction', async () => {
    server.use(
      http.delete(`${API_BASE_URL}/roles/${ROLE_ID}/users/${USER_ID}`, () =>
        HttpResponse.json(
          {
            success: false,
            code: 'RBAC_006',
            message: 'Thao tác sẽ khiến chủ sở hữu tổ chức mất quyền role:update',
            errors: [],
          },
          { status: 409 },
        ),
      ),
    );

    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Gỡ vai trò' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/role:update/);
    expect(alert).not.toHaveTextContent(/system role|vai trò hệ thống/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('on any other error, shows a generic inline message and keeps the dialog open', async () => {
    server.use(
      http.delete(`${API_BASE_URL}/roles/${ROLE_ID}/users/${USER_ID}`, () =>
        HttpResponse.json(
          { success: false, code: 'RBAC_005', message: 'Không tìm thấy người dùng', errors: [] },
          { status: 404 },
        ),
      ),
    );

    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Gỡ vai trò' }));

    expect(await screen.findByText('Không tìm thấy người dùng')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('has no accessibility violations', async () => {
    const { container } = renderDialog();
    expect(await axe(container)).toHaveNoViolations();
  });
});
