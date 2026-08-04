import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformAdminOrPermissionsGuard } from './platform-admin-or-permissions.guard';

describe('PlatformAdminOrPermissionsGuard', () => {
  let guard: PlatformAdminOrPermissionsGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  const buildContext = (user: unknown): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new PlatformAdminOrPermissionsGuard(
      reflector as unknown as Reflector,
    );
  });

  it('[T030.12O] cho phép Platform Admin dù permissions rỗng', () => {
    reflector.getAllAndOverride.mockReturnValue(['organization:view']);
    expect(
      guard.canActivate(
        buildContext({ isPlatformAdmin: true, permissions: [] }),
      ),
    ).toBe(true);
  });

  it('cho phép tenant user có đủ permission cần thiết', () => {
    reflector.getAllAndOverride.mockReturnValue(['organization:view']);
    expect(
      guard.canActivate(
        buildContext({
          isPlatformAdmin: false,
          permissions: ['organization:view'],
        }),
      ),
    ).toBe(true);
  });

  it('từ chối tenant user thiếu permission', () => {
    reflector.getAllAndOverride.mockReturnValue(['organization:view']);
    expect(() =>
      guard.canActivate(
        buildContext({ isPlatformAdmin: false, permissions: [] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('cho phép khi route không yêu cầu permission', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(
      guard.canActivate(
        buildContext({ isPlatformAdmin: false, permissions: [] }),
      ),
    ).toBe(true);
  });

  it('từ chối khi request không có user (chưa qua JwtAuthGuard)', () => {
    reflector.getAllAndOverride.mockReturnValue(['organization:view']);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
