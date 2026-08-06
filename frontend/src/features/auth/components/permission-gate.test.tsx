import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/auth-store';
import { buildAccessToken } from '@/test/build-access-token';
import { PermissionGate } from './permission-gate';

describe('PermissionGate (FR5, SR3)', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('renders children when the permission is present', () => {
    const token = buildAccessToken({
      sub: 'user-1',
      organizationId: 'org-1',
      permissions: ['product:read'],
    });
    useAuthStore.getState().setAccessToken(token);

    render(
      <PermissionGate code="product:read">
        <div>Protected content</div>
      </PermissionGate>,
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('renders the unauthorized state instead of children when the permission is absent', () => {
    render(
      <PermissionGate code="product:read">
        <div>Protected content</div>
      </PermissionGate>,
    );

    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.getByText('Bạn không có quyền truy cập')).toBeInTheDocument();
  });
});
