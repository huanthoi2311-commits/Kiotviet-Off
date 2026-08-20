import { Module } from '@nestjs/common';
import { BarcodeReferenceModule } from '../barcode/barcode-reference.module';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { UnitService } from './application/unit.service';
import { UnitPersistenceModule } from './unit-persistence.module';
import { UnitReferenceModule } from './unit-reference.module';
import { UnitController } from './presentation/unit.controller';

/**
 * Decision RPC05/RPC09 — import đúng 1 module đọc-thuần của Barcode (`BarcodeReferenceModule`)
 * để tránh circular dependency — không import module domain Barcode đầy đủ, không import module
 * hạ tầng lưu trữ của Barcode (xác nhận qua Architecture Test riêng, không lặp lại tên lớp cụ thể
 * ở đây để tránh false-positive dạng text-scan — xem tiền lệ T005/T006).
 *
 * T053.05C-2 — tách `UNIT_REPOSITORY` (`UnitPersistenceModule`) và `UnitDomainService`
 * (`UnitReferenceModule`) thành 2 module lá riêng (mẫu Barcode Persistence/Reference), để
 * `UnitReferenceModule` import được từ `ProductModule` mà không tạo circular dependency
 * (Product→Unit→Product, vì module này đã import `ProductModule`). `UnitService` tiếp tục inject
 * `UNIT_REPOSITORY` trực tiếp qua `UnitPersistenceModule` — không đổi write logic. Export
 * `UnitReferenceModule` (module class, KHÔNG export trực tiếp `UnitDomainService`) để re-export
 * cho các consumer hiện có (`CheckoutModule`, `BarcodeModule`) — Nest's `validateExportedProvider`
 * chỉ chấp nhận token export nếu token đó được provide cục bộ.
 */
@Module({
  imports: [
    RbacModule,
    ProductModule,
    BarcodeReferenceModule,
    UnitPersistenceModule,
    UnitReferenceModule,
  ],
  controllers: [UnitController],
  providers: [UnitService],
  exports: [UnitReferenceModule],
})
export class UnitModule {}
