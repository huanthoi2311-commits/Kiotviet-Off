import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { PageHeader } from './page-header';

describe('PageHeader (T034.01 §10)', () => {
  it('renders the title and, when supplied, the breadcrumb trail and action', () => {
    render(
      <PageHeader
        title="Danh mục"
        breadcrumbs={[{ label: 'Master Data', href: '/master-data' }, { label: 'Danh mục' }]}
        action={<button type="button">Thêm mới</button>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Danh mục' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Master Data' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm mới' })).toBeInTheDocument();
  });

  it('renders without a breadcrumb trail or action when neither is supplied', () => {
    render(<PageHeader title="Danh mục" />);

    expect(screen.getByRole('heading', { name: 'Danh mục' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <PageHeader title="Danh mục" breadcrumbs={[{ label: 'Danh mục' }]} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
