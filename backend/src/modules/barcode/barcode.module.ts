import { Module } from '@nestjs/common';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { BarcodeService } from './application/barcode.service';
import { BARCODE_REPOSITORY } from './domain/repositories/barcode.repository.interface';
import { PrismaBarcodeRepository } from './infrastructure/persistence/prisma-barcode.repository';
import { BarcodeController } from './presentation/barcode.controller';
import { ProductBarcodeController } from './presentation/product-barcode.controller';

@Module({
  imports: [RbacModule, ProductModule],
  controllers: [ProductBarcodeController, BarcodeController],
  providers: [
    BarcodeService,
    { provide: BARCODE_REPOSITORY, useClass: PrismaBarcodeRepository },
  ],
  exports: [BARCODE_REPOSITORY],
})
export class BarcodeModule {}
