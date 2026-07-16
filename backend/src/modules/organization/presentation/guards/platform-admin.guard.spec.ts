import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard';

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard();

  function makeContext(user: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('cho qua khi user.isPlatformAdmin = true', () => {
    expect(guard.canActivate(makeContext({ isPlatformAdmin: true }))).toBe(
      true,
    );
  });

  it('ném ForbiddenException khi isPlatformAdmin = false', () => {
    expect(() =>
      guard.canActivate(makeContext({ isPlatformAdmin: false })),
    ).toThrow(ForbiddenException);
  });

  it('ném ForbiddenException khi không có user trong request', () => {
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
