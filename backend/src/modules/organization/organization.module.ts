import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrganizationService } from './application/organization.service';
import { ORGANIZATION_REPOSITORY } from './domain/repositories/organization.repository.interface';
import { ORGANIZATION_CODE_GENERATOR } from './domain/services/organization-code-generator.interface';
import { SequenceOrganizationCodeGenerator } from './infrastructure/generators/sequence-organization-code.generator';
import { PrismaOrganizationRepository } from './infrastructure/persistence/prisma-organization.repository';
import { PlatformAdminGuard } from './presentation/guards/platform-admin.guard';
import { OrganizationController } from './presentation/organization.controller';

@Module({
  imports: [RbacModule, AuthModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    PlatformAdminGuard,
    {
      provide: ORGANIZATION_REPOSITORY,
      useClass: PrismaOrganizationRepository,
    },
    {
      provide: ORGANIZATION_CODE_GENERATOR,
      useClass: SequenceOrganizationCodeGenerator,
    },
  ],
  exports: [ORGANIZATION_REPOSITORY],
})
export class OrganizationModule {}
