import { render, screen } from '@testing-library/react';
import { Package } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { EmptyState } from './empty-state';

describe('EmptyState (T034.01 §11/§21)', () => {
  it('renders the title, description, icon and action supplied by the caller', () => {
    render(
      <EmptyState
        icon={Package}
        title="Chưa có danh mục nào"
        description="Tạo danh mục đầu tiên để bắt đầu."
        action={<button type="button">Tạo danh mục</button>}
      />,
    );

    expect(screen.getByText('Chưa có danh mục nào')).toBeInTheDocument();
    expect(screen.getByText('Tạo danh mục đầu tiên để bắt đầu.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo danh mục' })).toBeInTheDocument();
  });

  it('renders only the title when no icon, description or action is supplied', () => {
    const { container } = render(<EmptyState title="Không có kết quả" />);

    expect(screen.getByText('Không có kết quả')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <EmptyState icon={Package} title="Chưa có dữ liệu" description="Mô tả." />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
