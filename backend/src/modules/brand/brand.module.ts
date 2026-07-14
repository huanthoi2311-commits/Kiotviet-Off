import { Module } from '@nestjs/common';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { BrandService } from './application/brand.service';
import { BRAND_REPOSITORY } from './domain/repositories/brand.repository.interface';
import { PrismaBrandRepository } from './infrastructure/persistence/prisma-brand.repository';
import { BrandController } from './presentation/brand.controller';

@Module({
  imports: [RbacModule, ProductModule],
  controllers: [BrandController],
  providers: [
    BrandService,
    { provide: BRAND_REPOSITORY, useClass: PrismaBrandRepository },
  ],
  exports: [BRAND_REPOSITORY],
})
export class BrandModule {}
