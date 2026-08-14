import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BranchModule } from '../branch/branch.module';
import { OrganizationModule } from '../organization/organization.module';
import { RbacModule } from '../rbac/rbac.module';
import { UserService } from './application/user.service';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { UserController } from './presentation/user.controller';

@Module({
  // T052.02 — AuthModule exports AuthService/PASSWORD_HASHER (D5 — repository boundary preserved,
  // KHÔNG inject SESSION_REPOSITORY trực tiếp). OrganizationModule exports ORGANIZATION_REPOSITORY
  // (không export OrganizationService — đúng pattern PurchaseOrderModule đã có, dùng cho D1 owner
  // lookup). BranchModule exports BranchService (xác minh branchId tenant-owned, T051.06A pattern).
  // RbacModule exports RbacService (role codes cho GET /users/:id).
  imports: [RbacModule, AuthModule, BranchModule, OrganizationModule],
  controllers: [UserController],
  providers: [
    UserService,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
  ],
  exports: [USER_REPOSITORY],
})
export class UserModule {}
