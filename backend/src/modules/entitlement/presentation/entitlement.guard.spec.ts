import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementService } from '../application/entitlement.service';
import { EntitlementGuard } from './entitlement.guard';

function buildContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('EntitlementGuard (T053.03 §9/§11)', () => {
  let reflector: jest.Mocked<Reflector>;
  let entitlementService: jest.Mocked<EntitlementService>;
  let guard: EntitlementGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    entitlementService = {
      hasFeature: jest.fn(),
      getEffectiveFeatures: jest.fn(),
    } as unknown as jest.Mocked<EntitlementService>;
    guard = new EntitlementGuard(reflector, entitlementService);
  });

  it('không có @RequireEntitlement metadata => luôn cho qua', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = buildContext({ organizationId: 'org-1' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(entitlementService.hasFeature).not.toHaveBeenCalled();
  });

  it('feature được entitle => cho qua', async () => {
    reflector.getAllAndOverride.mockReturnValue('USER_MANAGEMENT');
    entitlementService.hasFeature.mockResolvedValue(true);
    const context = buildContext({
      organizationId: 'org-1',
      isPlatformAdmin: false,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('feature KHÔNG được entitle => ném ForbiddenException với ENTITLEMENT_FEATURE_NOT_INCLUDED', async () => {
    reflector.getAllAndOverride.mockReturnValue('USER_MANAGEMENT');
    entitlementService.hasFeature.mockResolvedValue(false);
    const context = buildContext({
      organizationId: 'org-1',
      isPlatformAdmin: false,
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  // Architect Decision (Platform Admin Entitlement Bypass, sau T053.02A) — KHÔNG còn bypass chỉ vì
  // isPlatformAdmin=true. Route nghiệp vụ tenant (đã gắn @RequireEntitlement) vẫn áp dụng đúng
  // entitlement của Organization đang thao tác, bất kể actor là ai.
  it('Platform Admin KHÔNG bypass entitlement trên route tenant đã yêu cầu — plan không có feature => vẫn bị từ chối', async () => {
    reflector.getAllAndOverride.mockReturnValue('USER_MANAGEMENT');
    entitlementService.hasFeature.mockResolvedValue(false);
    const context = buildContext({
      organizationId: 'org-bootstrap',
      isPlatformAdmin: true,
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(entitlementService.hasFeature).toHaveBeenCalledWith(
      'org-bootstrap',
      'USER_MANAGEMENT',
    );
  });

  it('Platform Admin KHÔNG bypass entitlement — plan CÓ feature => vẫn cho qua bình thường (đánh giá entitlement thật, không phải cờ isPlatformAdmin quyết định)', async () => {
    reflector.getAllAndOverride.mockReturnValue('USER_MANAGEMENT');
    entitlementService.hasFeature.mockResolvedValue(true);
    const context = buildContext({
      organizationId: 'org-bootstrap',
      isPlatformAdmin: true,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(entitlementService.hasFeature).toHaveBeenCalledWith(
      'org-bootstrap',
      'USER_MANAGEMENT',
    );
  });

  it('isPlatformAdmin=true không tự ý đổi Organization được tra cứu entitlement — vẫn đúng organizationId của actor', async () => {
    reflector.getAllAndOverride.mockReturnValue('SUPPLIER');
    entitlementService.hasFeature.mockResolvedValue(true);
    const context = buildContext({
      organizationId: 'org-actor-platform-admin',
      isPlatformAdmin: true,
    });
    await guard.canActivate(context);
    expect(entitlementService.hasFeature).toHaveBeenCalledWith(
      'org-actor-platform-admin',
      'SUPPLIER',
    );
  });

  it('luôn dùng organizationId của actor hiện tại, không tin dữ liệu khác từ request', async () => {
    reflector.getAllAndOverride.mockReturnValue('SUPPLIER');
    entitlementService.hasFeature.mockResolvedValue(true);
    const context = buildContext({
      organizationId: 'org-actor-real',
      isPlatformAdmin: false,
    });
    await guard.canActivate(context);
    expect(entitlementService.hasFeature).toHaveBeenCalledWith(
      'org-actor-real',
      'SUPPLIER',
    );
  });
});
