import { Module } from '@nestjs/common';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { CartService } from './application/cart.service';
import { CART_REPOSITORY } from './domain/repositories/cart.repository.interface';
import { RedisCartRepository } from './infrastructure/persistence/redis-cart.repository';
import { CartController } from './presentation/cart.controller';

@Module({
  imports: [RbacModule, ProductModule],
  controllers: [CartController],
  providers: [
    CartService,
    { provide: CART_REPOSITORY, useClass: RedisCartRepository },
  ],
  exports: [CART_REPOSITORY],
})
export class CartModule {}
