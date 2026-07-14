import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  const buildContext = (permissions: string[] | undefined): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: permissions ? { permissions } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('cho phép khi route không yêu cầu permission', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(buildContext(undefined))).toBe(true);
  });

  it('cho phép khi user có permission cần thiết', () => {
    reflector.getAllAndOverride.mockReturnValue(['product:create']);
    expect(
      guard.canActivate(buildContext(['product:create', 'product:view'])),
    ).toBe(true);
  });

  it('từ chối khi user thiếu permission', () => {
    reflector.getAllAndOverride.mockReturnValue(['product:delete']);
    expect(() => guard.canActivate(buildContext(['product:view']))).toThrow(
      ForbiddenException,
    );
  });

  it('từ chối khi request không có user (chưa qua JwtAuthGuard)', () => {
    reflector.getAllAndOverride.mockReturnValue(['product:view']);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
