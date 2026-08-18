import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrganizationService } from './application/organization.service';
import { ORGANIZATION_REPOSITORY } from './domain/repositories/organization.repository.interface';
import { ORGANIZATION_CODE_GENERATOR } from './domain/services/organization-code-generator.interface';
import { SequenceOrganizationCodeGenerator } from './infrastructure/generators/sequence-organization-code.generator';
import { PrismaOrganizationRepository } from './infrastructure/persistence/prisma-organization.repository';
import { PlatformAdminGuard } from './presentation/guards/platform-admin.guard';
import { PlatformAdminOrPermissionsGuard } from './presentation/guards/platform-admin-or-permissions.guard';
import { OrganizationController } from './presentation/organization.controller';

@Module({
  imports: [RbacModule, AuthModule, EntitlementModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    PlatformAdminGuard,
    PlatformAdminOrPermissionsGuard,
    {
      provide: ORGANIZATION_REPOSITORY,
      useClass: PrismaOrganizationRepository,
    },
    {
      provide: ORGANIZATION_CODE_GENERATOR,
      useClass: SequenceOrganizationCodeGenerator,
    },
  ],
  // T053.04 — thêm ORGANIZATION_CODE_GENERATOR (trước chỉ ORGANIZATION_REPOSITORY) để
  // TrialSignupModule tái dùng ĐÚNG cơ chế sinh Organization.code hiện có, không tự bịa cơ chế
  // riêng. Chỉ mở rộng export, không đổi hành vi bất kỳ consumer nào đã có.
  exports: [ORGANIZATION_REPOSITORY, ORGANIZATION_CODE_GENERATOR],
})
export class OrganizationModule {}
