import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { server } from '@/mocks/server';
import { reportMutationError } from '@/providers/query-provider';
import { UserResetPasswordDialog } from './user-reset-password-dialog';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const API_BASE_URL = 'http://localhost:3000/api/v1';
const USER_ID = 'user-1';

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

function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)}>
          Mở lại
        </button>
      )}
      <UserResetPasswordDialog
        open={open}
        onOpenChange={setOpen}
        userId={USER_ID}
        userName="Nguyễn Văn A"
      />
    </>
  );
}

function renderDialog(props: { initialOpen?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportMutationError }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}

describe('UserResetPasswordDialog (T052.02C §11)', () => {
  beforeEach(async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('rejects a password shorter than 8 characters', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'short1');
    await userEvent.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'short1');
    await userEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    // Both newPassword and confirmPassword fail the same min(8) rule simultaneously here.
    expect((await screen.findAllByText('Mật khẩu tối thiểu 8 ký tự')).length).toBeGreaterThan(0);
  });

  it('rejects a mismatched confirmation', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'Password123');
    await userEvent.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'Different123');
    await userEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(await screen.findByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument();
  });

  it('submits {newPassword} only (never confirmPassword) and shows success feedback', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${API_BASE_URL}/users/${USER_ID}/reset-password`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderDialog();
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'NewPassword123');
    await userEvent.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'NewPassword123');
    await userEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    await waitFor(() => expect(capturedBody).toEqual({ newPassword: 'NewPassword123' }));
    const { toast } = await import('sonner');
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Đã đặt lại mật khẩu — các phiên đăng nhập hiện tại của nhân viên đã bị hủy',
      ),
    );
  });

  it('clears the password fields after a successful reset (dialog closes)', async () => {
    server.use(
      http.patch(`${API_BASE_URL}/users/${USER_ID}/reset-password`, () =>
        HttpResponse.json(null, { status: 204 }),
      ),
    );

    renderDialog();
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'NewPassword123');
    await userEvent.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'NewPassword123');
    await userEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Mở lại' }));
    expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue('');
    expect(screen.getByLabelText('Xác nhận mật khẩu mới')).toHaveValue('');
  });

  it('clears the password fields after Cancel', async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'NewPassword123');
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    await userEvent.click(screen.getByRole('button', { name: 'Mở lại' }));
    expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue('');
  });

  it('never renders the entered password as plain visible text (input stays type=password)', async () => {
    renderDialog();
    const newPasswordInput = screen.getByLabelText('Mật khẩu mới');
    await userEvent.type(newPasswordInput, 'NewPassword123');
    expect(newPasswordInput).toHaveAttribute('type', 'password');
    expect(screen.queryByText('NewPassword123')).not.toBeInTheDocument();
  });

  it('surfaces a generic server error via root form error, not a field error', async () => {
    server.use(
      http.patch(`${API_BASE_URL}/users/${USER_ID}/reset-password`, () =>
        HttpResponse.json(errorEnvelope('USER_001', 'Không tìm thấy người dùng'), { status: 404 }),
      ),
    );

    renderDialog();
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'NewPassword123');
    await userEvent.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'NewPassword123');
    await userEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(await screen.findByText('Không tìm thấy người dùng')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderDialog();
    expect(await axe(container)).toHaveNoViolations();
  });
});
