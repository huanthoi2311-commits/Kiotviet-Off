import { Module } from '@nestjs/common';
import { BarcodePersistenceModule } from './barcode-persistence.module';
import { BarcodeReferenceModule } from './barcode-reference.module';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { UnitModule } from '../unit/unit.module';
import { BarcodeService } from './application/barcode.service';
import { BarcodeController } from './presentation/barcode.controller';
import { ProductBarcodeController } from './presentation/product-barcode.controller';

/**
 * Decision RPC04 — KHÔNG tự đăng ký lại `BARCODE_REPOSITORY`/`PrismaBarcodeRepository`/
 * `BarcodeDomainService` (registration owner duy nhất là `BarcodePersistenceModule`/
 * `BarcodeReferenceModule`). `BarcodeService` tiếp tục inject `BARCODE_REPOSITORY` trực tiếp,
 * lấy qua `BarcodePersistenceModule` (không đổi write logic — Decision RPC04).
 */
@Module({
  imports: [
    RbacModule,
    ProductModule,
    UnitModule,
    BarcodePersistenceModule,
    BarcodeReferenceModule,
  ],
  controllers: [ProductBarcodeController, BarcodeController],
  providers: [BarcodeService],
})
export class BarcodeModule {}
