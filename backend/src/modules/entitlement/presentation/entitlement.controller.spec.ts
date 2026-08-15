import { EntitlementService } from '../application/entitlement.service';
import { EntitlementController } from './entitlement.controller';

describe('EntitlementController (T053.03 — Current Entitlement Context)', () => {
  let entitlementService: jest.Mocked<EntitlementService>;
  let controller: EntitlementController;

  beforeEach(() => {
    entitlementService = {
      getEffectiveFeatures: jest.fn(),
      hasFeature: jest.fn(),
    } as unknown as jest.Mocked<EntitlementService>;
    controller = new EntitlementController(entitlementService);
  });

  it('resolves effective features using actor.organizationId from the authenticated JWT only', async () => {
    entitlementService.getEffectiveFeatures.mockResolvedValue([
      'DASHBOARD',
      'USER_MANAGEMENT',
    ]);

    const result = await controller.getCurrent({
      sub: 'user-1',
      organizationId: 'org-actor',
      branchId: null,
      email: 'user@acme.com',
      permissions: [],
      permissionVersion: 1,
      isPlatformAdmin: false,
    });

    expect(result).toEqual({
      effectiveFeatures: ['DASHBOARD', 'USER_MANAGEMENT'],
    });
    expect(entitlementService.getEffectiveFeatures).toHaveBeenCalledWith(
      'org-actor',
    );
  });

  it('missing subscription resolves to an empty array (fail-closed), never all features', async () => {
    entitlementService.getEffectiveFeatures.mockResolvedValue([]);

    const result = await controller.getCurrent({
      sub: 'user-1',
      organizationId: 'org-actor',
      branchId: null,
      email: 'user@acme.com',
      permissions: [],
      permissionVersion: 1,
      isPlatformAdmin: false,
    });

    expect(result).toEqual({ effectiveFeatures: [] });
  });
});
