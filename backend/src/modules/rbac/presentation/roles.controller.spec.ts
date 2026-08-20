import { Reflector } from '@nestjs/core';
import { ENTITLEMENT_KEY } from '../../entitlement/presentation/entitlement.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { RolesController } from './roles.controller';
import { RbacService } from '../application/rbac.service';

/**
 * T053.06D — metadata regression cho RolesController, mirror ĐÚNG mẫu hình đã dùng ở
 * `SupplierController` (T053.06C) — `RolesController` trước đây KHÔNG có spec riêng nào (xác nhận
 * qua Mandatory Source Verification).
 */
describe('RolesController', () => {
  let controller: RolesController;
  const reflector = new Reflector();

  beforeEach(() => {
    controller = new RolesController({} as unknown as RbacService);
  });

  describe('RBAC permission metadata (không đổi qua T053.06D)', () => {
    it.each([
      ['list', 'role:view'],
      ['detail', 'role:view'],
      ['create', 'role:create'],
      ['assignPermissions', 'role:update'],
      ['assignToUser', 'user:update'],
      ['removeFromUser', 'user:update'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  describe('entitlement metadata (T053.06D — đóng lỗ hổng assignPermissions bỏ sót @RequireEntitlement)', () => {
    it.each([
      ['create', 'RBAC_MANAGEMENT'],
      ['assignPermissions', 'RBAC_MANAGEMENT'],
    ])(
      'method %s yêu cầu CommercialFeature %s (assignPermissions trước đây THIẾU metadata này, khiến EntitlementGuard mặc định cho qua)',
      (method, expectedFeature) => {
        const feature = reflector.get<string>(
          ENTITLEMENT_KEY,
          (controller as unknown as Record<string, () => void>)[method],
        );
        expect(feature).toBe(expectedFeature);
      },
    );

    it.each(['list', 'detail', 'assignToUser', 'removeFromUser'])(
      'method %s KHÔNG yêu cầu entitlement (chỉ create/assignPermissions cấu hình RBAC, đúng phạm vi T053.06D — không mở rộng)',
      (method) => {
        const feature = reflector.get<string>(
          ENTITLEMENT_KEY,
          (controller as unknown as Record<string, () => void>)[method],
        );
        expect(feature).toBeUndefined();
      },
    );
  });
});
