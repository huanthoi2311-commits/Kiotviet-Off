import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ProductPriceEntity } from '../../domain/entities/product-price.entity';
import { ProductPriceConcurrencyConflictError } from '../../domain/errors/product-price.errors';
import {
  IProductPriceRepository,
  ProductPriceItemInput,
  ProductPriceSetResult,
} from '../../domain/repositories/product-price.repository.interface';

function toEntity(price: {
  id: string;
  type: string;
  price: { toString(): string };
}): ProductPriceEntity {
  return {
    id: price.id,
    type: price.type as ProductPriceEntity['type'],
    price: price.price.toString(),
  };
}

@Injectable()
export class PrismaProductPriceRepository implements IProductPriceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSetByProductId(
    productId: string,
  ): Promise<ProductPriceSetResult | null> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        priceVersion: true,
        prices: { where: { deletedAt: null } },
      },
    });
    if (!product) return null;
    return {
      priceVersion: product.priceVersion,
      prices: product.prices.map(toEntity),
    };
  }

  async replaceSet(
    productId: string,
    expectedPriceVersion: number,
    prices: ProductPriceItemInput[],
    updatedBy: string,
  ): Promise<ProductPriceSetResult> {
    return this.prisma.$transaction(async (tx) => {
      const cas = await tx.product.updateMany({
        where: { id: productId, priceVersion: expectedPriceVersion },
        data: { priceVersion: { increment: 1 } },
      });
      if (cas.count === 0) {
        throw new ProductPriceConcurrencyConflictError(productId);
      }

      await tx.productPrice.deleteMany({ where: { productId } });
      await tx.productPrice.createMany({
        data: prices.map((p) => ({
          productId,
          type: p.type,
          price: p.price,
          createdBy: updatedBy,
          updatedBy,
        })),
      });

      const updated = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: {
          priceVersion: true,
          prices: { where: { deletedAt: null } },
        },
      });

      return {
        priceVersion: updated.priceVersion,
        prices: updated.prices.map(toEntity),
      };
    });
  }
}
