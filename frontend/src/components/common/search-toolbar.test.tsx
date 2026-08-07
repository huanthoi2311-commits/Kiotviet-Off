import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { SearchToolbar } from './search-toolbar';

describe('SearchToolbar (T034.01 §11/§14)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces onChange calls while typing, firing once after debounceMs of inactivity', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    render(<SearchToolbar value="" onChange={onChange} debounceMs={300} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'á' } });
    fireEvent.change(input, { target: { value: 'áo' } });
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('áo');
  });

  it('re-syncs its draft when the caller changes `value` externally (e.g. cleared via the URL)', () => {
    const { rerender } = render(<SearchToolbar value="áo" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('áo');

    rerender(<SearchToolbar value="" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('renders caller-supplied filter controls alongside the search input', () => {
    render(
      <SearchToolbar
        value=""
        onChange={vi.fn()}
        filters={<button type="button">Trạng thái</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Trạng thái' })).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<SearchToolbar value="" onChange={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
