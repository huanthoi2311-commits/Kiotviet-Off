import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { Breadcrumbs } from './breadcrumbs';

describe('Breadcrumbs (T034.01 §10)', () => {
  it('renders nothing when items is empty', () => {
    const { container } = render(<Breadcrumbs items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders every item as a link except the last, which is plain text marked as the current page', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Master Data', href: '/master-data' },
          { label: 'Categories', href: '/categories' },
          { label: 'Điện thoại' },
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Master Data' })).toHaveAttribute(
      'href',
      '/master-data',
    );
    expect(screen.getByRole('link', { name: 'Categories' })).toHaveAttribute('href', '/categories');
    expect(screen.queryByRole('link', { name: 'Điện thoại' })).not.toBeInTheDocument();

    const current = screen.getByText('Điện thoại');
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Current' }]} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
