import { Module } from '@nestjs/common';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { CartDomainService } from './application/cart-domain.service';
import { CartService } from './application/cart.service';
import { CART_REPOSITORY } from './domain/repositories/cart.repository.interface';
import { RedisCartRepository } from './infrastructure/persistence/redis-cart.repository';
import { CartController } from './presentation/cart.controller';

/**
 * T013 Phase 2 (SPEC-T013-SALES-FOUNDATION-001 §9.1, ADR-0010 — Repository Boundary) —
 * `CART_REPOSITORY` KHÔNG còn export. `checkout` phải phụ thuộc `CartDomainService` (public
 * application port), không phụ thuộc repository token/persistence contract trực tiếp.
 */
@Module({
  imports: [RbacModule, ProductModule],
  controllers: [CartController],
  providers: [
    CartService,
    CartDomainService,
    { provide: CART_REPOSITORY, useClass: RedisCartRepository },
  ],
  exports: [CartService, CartDomainService],
})
export class CartModule {}
