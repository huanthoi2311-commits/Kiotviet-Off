import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './data-table';

interface Row {
  id: string;
  name: string;
}

const columns: ColumnDef<Row, unknown>[] = [{ accessorKey: 'name', header: 'Tên' }];

const rows: Row[] = [
  { id: '1', name: 'Điện thoại' },
  { id: '2', name: 'Laptop' },
];

const basePagination = { page: 1, limit: 10, total: 2, onPageChange: vi.fn() };

describe('DataTable (T034.01 §5/§11)', () => {
  it('renders skeleton rows while loading', () => {
    const { container } = render(
      <DataTable
        columns={columns}
        data={[]}
        isLoading
        emptyState={<span>Empty</span>}
        pagination={basePagination}
      />,
    );

    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('renders the error message and calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={[]}
        isLoading={false}
        error={{ kind: 'network-error', message: 'Mất kết nối mạng' }}
        onRetry={onRetry}
        emptyState={<span>Empty</span>}
        pagination={basePagination}
      />,
    );

    expect(screen.getByText('Mất kết nối mạng')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the caller-supplied empty state when data is empty and not loading/errored', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        isLoading={false}
        emptyState={<span>Không có dữ liệu</span>}
        pagination={basePagination}
      />,
    );

    expect(screen.getByText('Không có dữ liệu')).toBeInTheDocument();
  });

  it('renders rows and a pagination summary when data is present', () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        isLoading={false}
        emptyState={<span>Empty</span>}
        pagination={basePagination}
      />,
    );

    expect(screen.getByText('Điện thoại')).toBeInTheDocument();
    expect(screen.getByText('Laptop')).toBeInTheDocument();
    expect(screen.getByText('Trang 1 / 1 — 2 bản ghi')).toBeInTheDocument();
  });

  it('disables Prev on the first page and Next on the last page, and calls onPageChange', async () => {
    const onPageChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        isLoading={false}
        emptyState={<span>Empty</span>}
        pagination={{ page: 1, limit: 1, total: 2, onPageChange }}
      />,
    );

    const prev = screen.getByRole('button', { name: 'Trước' });
    const next = screen.getByRole('button', { name: 'Sau' });
    expect(prev).toBeDisabled();
    expect(next).not.toBeDisabled();

    await userEvent.click(next);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <DataTable
        columns={columns}
        data={rows}
        isLoading={false}
        emptyState={<span>Empty</span>}
        pagination={basePagination}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
