import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { PermissionButton } from './permission-button';

describe('PermissionButton (T034.01 §6/§11, T033.02 §3)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('renders nothing (not disabled) when the permission is absent', () => {
    const { container } = render(
      <PermissionButton permission="category:create">Thêm mới</PermissionButton>,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the button and forwards its props/handlers when the permission is present', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:create'],
    });
    useAuthStore.getState().setAccessToken(token);
    const onClick = vi.fn();

    render(
      <PermissionButton permission="category:create" onClick={onClick}>
        Thêm mới
      </PermissionButton>,
    );

    const button = screen.getByRole('button', { name: 'Thêm mới' });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has no accessibility violations when rendered (permission granted)', async () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['category:create'],
    });
    useAuthStore.getState().setAccessToken(token);

    const { container } = render(
      <PermissionButton permission="category:create">Thêm mới</PermissionButton>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
