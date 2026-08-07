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

  it('disables both buttons while isConfirming is true', () => {
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

    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
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
});
