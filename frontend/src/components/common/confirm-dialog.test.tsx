import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog (T034.01 §5/§21)', () => {
  it('renders nothing when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        title="Lưu trữ danh mục?"
        description="Danh mục sẽ được lưu trữ."
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title/description and calls onConfirm/onOpenChange from the respective buttons', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Lưu trữ danh mục?"
        description="Danh mục sẽ được lưu trữ."
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Lưu trữ danh mục?')).toBeInTheDocument();
    expect(screen.getByText('Danh mục sẽ được lưu trữ.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('marks both buttons aria-disabled (not natively disabled) while isConfirming is true, and blocks their actions (T038.08D)', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Lưu trữ danh mục?"
        description="Danh mục sẽ được lưu trữ."
        onConfirm={onConfirm}
        isConfirming
      />,
    );

    const confirmButton = screen.getByRole('button', { name: 'Xác nhận' });
    const cancelButton = screen.getByRole('button', { name: 'Hủy' });

    // Native `disabled` (not just aria-disabled) forces the browser to blur
    // the currently-focused button to document.body, escaping the dialog's
    // focus trap (T038.08C's finding) — so these must stay natively enabled
    // and merely aria-disabled, remaining focusable/tabbable throughout.
    expect(confirmButton).not.toBeDisabled();
    expect(cancelButton).not.toBeDisabled();
    expect(confirmButton).toHaveAttribute('aria-disabled', 'true');
    expect(cancelButton).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(confirmButton);
    await userEvent.click(cancelButton);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('remains focusable while isConfirming is true (T038.08D)', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Lưu trữ danh mục?"
        description="Danh mục sẽ được lưu trữ."
        onConfirm={vi.fn()}
        isConfirming
      />,
    );

    const confirmButton = screen.getByRole('button', { name: 'Xác nhận' });
    confirmButton.focus();
    expect(confirmButton).toHaveFocus();
  });

  it('accepts custom labels', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Khôi phục danh mục?"
        description="Danh mục sẽ hoạt động trở lại."
        confirmLabel="Khôi phục"
        cancelLabel="Đóng"
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Khôi phục' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Lưu trữ danh mục?"
        description="Danh mục sẽ được lưu trữ."
        onConfirm={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('does not render an error alert when errorMessage is omitted (T038.10, additive/backward-compatible)', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Lưu trữ danh mục?"
        description="Danh mục sẽ được lưu trữ."
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the errorMessage as an alert when provided (T038.10)', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Lưu trữ danh mục?"
        description="Danh mục sẽ được lưu trữ."
        onConfirm={vi.fn()}
        errorMessage="Không thể xóa danh mục đang có sản phẩm sử dụng"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không thể xóa danh mục đang có sản phẩm sử dụng',
    );
  });

  it('has no accessibility violations while showing errorMessage', async () => {
    const { container } = render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Lưu trữ danh mục?"
        description="Danh mục sẽ được lưu trữ."
        onConfirm={vi.fn()}
        errorMessage="Không thể xóa danh mục đang có sản phẩm sử dụng"
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
