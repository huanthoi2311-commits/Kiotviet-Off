import { Module } from '@nestjs/common';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { RbacService } from './application/rbac.service';
import { ROLE_REPOSITORY } from './domain/repositories/role.repository.interface';
import { PERMISSION_REPOSITORY } from './domain/repositories/permission.repository.interface';
import { PrismaRoleRepository } from './infrastructure/prisma-role.repository';
import { PrismaPermissionRepository } from './infrastructure/prisma-permission.repository';
import { RolesController } from './presentation/roles.controller';
import { PermissionsController } from './presentation/permissions.controller';
import { PermissionsGuard } from './presentation/permissions.guard';

/** EntitlementModule (T053.03) — module lá, an toàn import cho POST /roles gate RBAC_MANAGEMENT. */
@Module({
  imports: [EntitlementModule],
  controllers: [RolesController, PermissionsController],
  providers: [
    RbacService,
    PermissionsGuard,
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    { provide: PERMISSION_REPOSITORY, useClass: PrismaPermissionRepository },
  ],
  exports: [RbacService],
})
export class RbacModule {}
