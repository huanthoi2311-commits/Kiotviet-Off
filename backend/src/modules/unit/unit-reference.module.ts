import { Module } from '@nestjs/common';
import { UnitPersistenceModule } from './unit-persistence.module';
import { UnitDomainService } from './application/unit-domain.service';

/**
 * T053.05C-2 — Read-only reference capability cho module khác (cùng pattern `BarcodeReferenceModule`,
 * `CategoryReferenceModule`). Chỉ export `UnitDomainService` (class ĐÃ CÓ từ SPEC-BARCODE-001 §9.4 —
 * chỉ CHUYỂN nơi đăng ký sang module lá này, KHÔNG đổi tên/method/hành vi) — không export
 * `UNIT_REPOSITORY`, không chứa `UnitService`/write use case/Controller nào. Import
 * `UnitPersistenceModule` để có `UNIT_REPOSITORY` — KHÔNG import `ProductModule`/
 * `BarcodeReferenceModule`/`RbacModule` (điều kiện tránh circular dependency — `UnitModule` đầy đủ
 * đã import `ProductModule`, nên `ProductModule` không thể import lại bất kỳ thứ gì kéo theo nó).
 *
 * `UnitModule` đầy đủ import lại module này để re-export `UnitDomainService`, giữ nguyên hành vi
 * cho các consumer hiện có (`CheckoutModule`, `BarcodeModule`) — cả hai tiếp tục import
 * `UnitModule` (không đổi) và nhận `UnitDomainService` transitively qua re-export.
 */
@Module({
  imports: [UnitPersistenceModule],
  providers: [UnitDomainService],
  exports: [UnitDomainService],
})
export class UnitReferenceModule {}
