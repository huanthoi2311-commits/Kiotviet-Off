import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { axe } from 'vitest-axe';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCrudForm } from '@/hooks/use-crud-form';
import { CrudForm } from './crud-form';

const schema = z.object({
  name: z.string().min(1, 'Tên là bắt buộc'),
});

function Harness({
  onSubmit,
  onCancel,
  isMutating = false,
}: {
  onSubmit: (values: { name: string }) => void;
  onCancel: () => void;
  isMutating?: boolean;
}) {
  const form = useCrudForm({ schema, defaultValues: { name: '' }, isMutating });

  return (
    <CrudForm form={form} onSubmit={onSubmit} onCancel={onCancel}>
      <Label htmlFor="name">Tên</Label>
      <Input id="name" {...form.register('name')} />
    </CrudForm>
  );
}

describe('CrudForm (T034.01 §12/§21)', () => {
  it('calls onSubmit with the validated values, and onCancel from the Cancel button', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onSubmit={onSubmit} onCancel={onCancel} />);

    await userEvent.type(screen.getByLabelText('Tên'), 'Điện thoại');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Điện thoại' }, expect.anything());

    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables Save and Cancel while submitting', () => {
    render(<Harness onSubmit={vi.fn()} onCancel={vi.fn()} isMutating />);

    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
  });

  it('renders no root-error alert when the form has no root error', () => {
    render(<Harness onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Harness onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
