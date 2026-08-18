import { Module } from '@nestjs/common';
import { EntitlementService } from './application/entitlement.service';
import { ENTITLEMENT_SUBSCRIPTION_READER } from './domain/repositories/entitlement-subscription-reader.interface';
import { PrismaEntitlementSubscriptionReader } from './infrastructure/persistence/prisma-entitlement-subscription-reader';
import { EntitlementController } from './presentation/entitlement.controller';
import { EntitlementGuard } from './presentation/entitlement.guard';

/**
 * T053.03 §7 — Module lá (leaf), KHÔNG import OrganizationModule/RbacModule/UserModule/SupplierModule
 * — chỉ phụ thuộc PrismaService (đã @Global()). Nhờ vậy bất kỳ module nào (kể cả RbacModule, vốn đã
 * được OrganizationModule import) đều có thể import EntitlementModule một chiều mà KHÔNG bao giờ tạo
 * vòng lặp (RbacModule → EntitlementModule → OrganizationModule → RbacModule sẽ KHÔNG xảy ra vì
 * EntitlementModule không quay lại import OrganizationModule).
 *
 * `EntitlementController` (GET /entitlements/current) chỉ cần `JwtAuthGuard` (import theo đường
 * dẫn trực tiếp, đúng pattern mọi controller khác trong repo đã dùng — Passport strategy `jwt`
 * đăng ký toàn cục qua `AuthModule` trong `AppModule`, không cần `EntitlementModule` tự import
 * `AuthModule`) — không thêm cạnh phụ thuộc mới nào, vẫn là module lá.
 */
@Module({
  controllers: [EntitlementController],
  providers: [
    EntitlementService,
    EntitlementGuard,
    {
      provide: ENTITLEMENT_SUBSCRIPTION_READER,
      useClass: PrismaEntitlementSubscriptionReader,
    },
  ],
  exports: [EntitlementService, EntitlementGuard],
})
export class EntitlementModule {}
