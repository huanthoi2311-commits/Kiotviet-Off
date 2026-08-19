import { Module } from '@nestjs/common';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { BrandService } from './application/brand.service';
import { BrandPersistenceModule } from './brand-persistence.module';
import { BrandController } from './presentation/brand.controller';

// T053.05C-2 — BrandPersistenceModule là chủ sở hữu DUY NHẤT của BRAND_REPOSITORY (tách ra để
// BrandReferenceModule có thể import mà không tạo circular dependency Product→Brand→Product).
// Import ở đây thay vì tự đăng ký provider. Re-export bằng module class (`BrandPersistenceModule`),
// KHÔNG export trực tiếp token `BRAND_REPOSITORY` — Nest's `validateExportedProvider` chỉ chấp
// nhận token export nếu token đó được provide cục bộ.
@Module({
  imports: [RbacModule, ProductModule, BrandPersistenceModule],
  controllers: [BrandController],
  providers: [BrandService],
  exports: [BrandPersistenceModule],
})
export class BrandModule {}
