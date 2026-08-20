import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BranchModule } from '../branch/branch.module';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { OrganizationModule } from '../organization/organization.module';
import { RbacModule } from '../rbac/rbac.module';
import { UserService } from './application/user.service';
import { UserPersistenceModule } from './user-persistence.module';
import { UserController } from './presentation/user.controller';

@Module({
  // T052.02 — AuthModule exports AuthService/PASSWORD_HASHER (D5 — repository boundary preserved,
  // KHÔNG inject SESSION_REPOSITORY trực tiếp). OrganizationModule exports ORGANIZATION_REPOSITORY
  // (không export OrganizationService — đúng pattern PurchaseOrderModule đã có, dùng cho D1 owner
  // lookup). BranchModule exports BranchService (xác minh branchId tenant-owned, T051.06A pattern).
  // RbacModule exports RbacService (role codes cho GET /users/:id). EntitlementModule (T053.03) —
  // module lá, không tạo vòng lặp — cho POST /users gate USER_MANAGEMENT.
  // T053.05C-2 — UserPersistenceModule là chủ sở hữu DUY NHẤT của USER_REPOSITORY (tách ra để
  // UserReferenceModule có thể import mà không tạo circular dependency Branch→User→Branch). Import
  // ở đây thay vì tự đăng ký provider — UsageLimitModule (T053.05B, cần cho PrismaUserRepository)
  // giờ import từ chính UserPersistenceModule, không cần khai lại ở đây. Re-export bằng module class
  // (`UserPersistenceModule`), KHÔNG export trực tiếp token `USER_REPOSITORY` — Nest's
  // `validateExportedProvider` chỉ chấp nhận token export nếu token đó được provide cục bộ; export
  // module class mới re-export toàn bộ những gì module đó export (đã trace
  // `node_modules/@nestjs/core/injector/module.js`). Giữ nguyên hành vi cho `WarehouseModule`
  // (import `UserModule`, inject trực tiếp `USER_REPOSITORY`).
  imports: [
    RbacModule,
    AuthModule,
    BranchModule,
    OrganizationModule,
    EntitlementModule,
    UserPersistenceModule,
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserPersistenceModule],
})
export class UserModule {}
