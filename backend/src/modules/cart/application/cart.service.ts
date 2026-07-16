import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { ProductDomainService } from '../../product/application/product-domain.service';
import {
  buildCartItem,
  CartEntity,
  emptyCart,
  recalculateCartItem,
  recalculateCartTotals,
} from '../domain/entities/cart.entity';
import { CART_REPOSITORY } from '../domain/repositories/cart.repository.interface';
import type { ICartRepository } from '../domain/repositories/cart.repository.interface';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartResponseDto } from './dto/cart-response.dto';
import { RemoveCartItemDto } from './dto/remove-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartMapper } from './mappers/cart.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
}

@Injectable()
export class CartService {
  constructor(
    @Inject(CART_REPOSITORY) private readonly cartRepository: ICartRepository,
    private readonly productDomainService: ProductDomainService,
  ) {}

  async getCart(actor: ActorContext): Promise<CartResponseDto> {
    const cart = await this.loadCart(actor);
    return CartMapper.toResponseDto(cart);
  }

  async addItem(
    dto: AddCartItemDto,
    actor: ActorContext,
  ): Promise<CartResponseDto> {
    const product = await this.productDomainService.findById(
      dto.productId,
      actor.organizationId,
    );
    if (!product) {
      throw new NotFoundException(
        withCode(ErrorCode.CART_PRODUCT_NOT_FOUND, 'Không tìm thấy sản phẩm'),
      );
    }
    if (!product.allowSale) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.CART_PRODUCT_NOT_SELLABLE,
          'Sản phẩm không được phép bán',
        ),
      );
    }
    const retailPrice = product.prices.find((p) => p.type === 'RETAIL');
    if (!retailPrice) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.PRODUCT_MISSING_RETAIL_PRICE,
          'Sản phẩm chưa có giá bán lẻ',
        ),
      );
    }

    const cart = await this.loadCart(actor);
    const price = new Prisma.Decimal(retailPrice.price);
    const vatPercent = new Prisma.Decimal(product.vat);
    const addedQuantity = new Prisma.Decimal(dto.quantity);
    const existingIndex = cart.items.findIndex(
      (item) => item.productId === dto.productId,
    );

    const items = [...cart.items];
    if (existingIndex >= 0) {
      const mergedQuantity = new Prisma.Decimal(
        items[existingIndex].quantity,
      ).plus(addedQuantity);
      items[existingIndex] = buildCartItem({
        productId: product.id,
        productName: product.name,
        quantity: mergedQuantity,
        price,
        vatPercent,
      });
    } else {
      items.push(
        buildCartItem({
          productId: product.id,
          productName: product.name,
          quantity: addedQuantity,
          price,
          vatPercent,
        }),
      );
    }

    return this.persist({ ...cart, items }, actor);
  }

  async updateItem(
    dto: UpdateCartItemDto,
    actor: ActorContext,
  ): Promise<CartResponseDto> {
    const cart = await this.loadCart(actor);
    const index = cart.items.findIndex(
      (item) => item.productId === dto.productId,
    );
    if (index < 0) {
      throw new NotFoundException(
        withCode(
          ErrorCode.CART_ITEM_NOT_FOUND,
          'Sản phẩm không có trong giỏ hàng',
        ),
      );
    }

    const product = await this.productDomainService.findById(
      dto.productId,
      actor.organizationId,
    );
    if (!product) {
      throw new NotFoundException(
        withCode(ErrorCode.CART_PRODUCT_NOT_FOUND, 'Không tìm thấy sản phẩm'),
      );
    }

    const items = [...cart.items];
    items[index] = recalculateCartItem(
      items[index],
      new Prisma.Decimal(dto.quantity),
      new Prisma.Decimal(product.vat),
    );

    return this.persist({ ...cart, items }, actor);
  }

  async removeItem(
    dto: RemoveCartItemDto,
    actor: ActorContext,
  ): Promise<CartResponseDto> {
    const cart = await this.loadCart(actor);
    const index = cart.items.findIndex(
      (item) => item.productId === dto.productId,
    );
    if (index < 0) {
      throw new NotFoundException(
        withCode(
          ErrorCode.CART_ITEM_NOT_FOUND,
          'Sản phẩm không có trong giỏ hàng',
        ),
      );
    }

    const items = cart.items.filter((_, i) => i !== index);
    return this.persist({ ...cart, items }, actor);
  }

  async clear(actor: ActorContext): Promise<CartResponseDto> {
    await this.cartRepository.delete(actor.organizationId, actor.userId);
    return CartMapper.toResponseDto(
      emptyCart(actor.organizationId, actor.userId),
    );
  }

  private async loadCart(actor: ActorContext): Promise<CartEntity> {
    return (
      (await this.cartRepository.findByUserId(
        actor.organizationId,
        actor.userId,
      )) ?? emptyCart(actor.organizationId, actor.userId)
    );
  }

  private async persist(
    cart: CartEntity,
    actor: ActorContext,
  ): Promise<CartResponseDto> {
    const recalculated = recalculateCartTotals({
      ...cart,
      organizationId: actor.organizationId,
      userId: actor.userId,
    });
    await this.cartRepository.save(recalculated);
    return CartMapper.toResponseDto(recalculated);
  }
}
