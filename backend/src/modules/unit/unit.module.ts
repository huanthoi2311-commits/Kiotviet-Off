import { Module } from '@nestjs/common';
import { BarcodeReferenceModule } from '../barcode/barcode-reference.module';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { UnitDomainService } from './application/unit-domain.service';
import { UnitService } from './application/unit.service';
import { UNIT_REPOSITORY } from './domain/repositories/unit.repository.interface';
import { PrismaUnitRepository } from './infrastructure/persistence/prisma-unit.repository';
import { UnitController } from './presentation/unit.controller';

/**
 * Decision RPC05/RPC09 — import đúng 1 module đọc-thuần của Barcode (`BarcodeReferenceModule`)
 * để tránh circular dependency — không import module domain Barcode đầy đủ, không import module
 * hạ tầng lưu trữ của Barcode (xác nhận qua Architecture Test riêng, không lặp lại tên lớp cụ thể
 * ở đây để tránh false-positive dạng text-scan — xem tiền lệ T005/T006). `UNIT_REPOSITORY` tiếp
 * tục đăng ký nội bộ (không tách module hạ tầng riêng — `UnitService`/`UnitDomainService` cùng
 * module, không có rào cản cross-module cần tách) nhưng KHÔNG export — chỉ export
 * `UnitDomainService` (ADR-0010).
 */
@Module({
  imports: [RbacModule, ProductModule, BarcodeReferenceModule],
  controllers: [UnitController],
  providers: [
    UnitService,
    UnitDomainService,
    { provide: UNIT_REPOSITORY, useClass: PrismaUnitRepository },
  ],
  exports: [UnitDomainService],
})
export class UnitModule {}
