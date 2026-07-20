import { Inject, Injectable } from '@nestjs/common';
import { CartEntity } from '../domain/entities/cart.entity';
import { CART_REPOSITORY } from '../domain/repositories/cart.repository.interface';
import type { ICartRepository } from '../domain/repositories/cart.repository.interface';

/**
 * Cửa ngõ ĐỌC/XÓA công khai duy nhất của `Cart` cho module khác (T013 Phase 2,
 * SPEC-T013-SALES-FOUNDATION-001 §9.1, ADR-0010 — Repository Boundary). Thay thế việc
 * `checkout` inject thẳng `CART_REPOSITORY` (vi phạm ADR-0010 tồn tại từ trước T013).
 * Đúng 2 method Checkout cần — không thêm (đúng mẫu `CustomerDomainService`/`SupplierDomainService`).
 */
@Injectable()
export class CartDomainService {
  constructor(
    @Inject(CART_REPOSITORY) private readonly cartRepository: ICartRepository,
  ) {}

  findByUserId(
    organizationId: string,
    userId: string,
  ): Promise<CartEntity | null> {
    return this.cartRepository.findByUserId(organizationId, userId);
  }

  /** Gọi SAU KHI transaction checkout đã commit thành công — đúng thứ tự hiện có, không đổi. */
  clearAfterCheckout(organizationId: string, userId: string): Promise<void> {
    return this.cartRepository.delete(organizationId, userId);
  }
}
