import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { SupplierProductEntity } from '../../domain/entities/supplier.entity';
import {
  ISupplierProductRepository,
  UpsertSupplierProductInput,
} from '../../domain/repositories/supplier-product.repository.interface';

type RawSupplierProduct = Prisma.SupplierProductGetPayload<
  Record<string, never>
>;

@Injectable()
export class PrismaSupplierProductRepository implements ISupplierProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    input: UpsertSupplierProductInput,
  ): Promise<SupplierProductEntity> {
    try {
      const mapping = await this.prisma.supplierProduct.upsert({
        where: {
          supplierId_productId: {
            supplierId: input.supplierId,
            productId: input.productId,
          },
        },
        create: {
          supplierId: input.supplierId,
          productId: input.productId,
          supplierSku: input.supplierSku ?? null,
          priority: input.priority ?? 0,
          defaultPrice: input.defaultPrice ?? null,
          leadTime: input.leadTime ?? null,
          minimumOrderQuantity: input.minimumOrderQuantity ?? null,
          createdBy: input.actorId,
          updatedBy: input.actorId,
        },
        update: {
          supplierSku: input.supplierSku,
          priority: input.priority,
          defaultPrice: input.defaultPrice,
          leadTime: input.leadTime,
          minimumOrderQuantity: input.minimumOrderQuantity,
          deletedAt: null,
          updatedBy: input.actorId,
        },
      });
      return this.toEntity(mapping);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async listBySupplier(
    supplierId: string,
    organizationId: string,
  ): Promise<SupplierProductEntity[]> {
    const mappings = await this.prisma.supplierProduct.findMany({
      where: {
        supplierId,
        deletedAt: null,
        supplier: { organizationId, deletedAt: null },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    return mappings.map((mapping) => this.toEntity(mapping));
  }

  async findOne(
    supplierId: string,
    productId: string,
    organizationId: string,
  ): Promise<SupplierProductEntity | null> {
    const mapping = await this.prisma.supplierProduct.findFirst({
      where: {
        supplierId,
        productId,
        deletedAt: null,
        supplier: { organizationId, deletedAt: null },
      },
    });
    return mapping ? this.toEntity(mapping) : null;
  }

  async remove(
    supplierId: string,
    productId: string,
    deletedBy: string,
  ): Promise<void> {
    await this.prisma.supplierProduct.update({
      where: { supplierId_productId: { supplierId, productId } },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  }

  private translateWriteError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new ConflictException(
          withCode(
            ErrorCode.SUPPLIER_PRODUCT_DUPLICATE,
            'Sản phẩm này đã được gán cho nhà cung cấp',
          ),
        );
      }
      if (error.code === 'P2003') {
        const field = (error.meta?.field_name as string | undefined) ?? '';
        const label = field.includes('productId') ? 'productId' : 'supplierId';
        return new BadRequestException(
          withCode(
            ErrorCode.VALIDATION_FAILED,
            `Giá trị "${label}" không tồn tại`,
          ),
        );
      }
    }
    return error as Error;
  }

  private toEntity(mapping: RawSupplierProduct): SupplierProductEntity {
    return {
      id: mapping.id,
      supplierId: mapping.supplierId,
      productId: mapping.productId,
      supplierSku: mapping.supplierSku,
      priority: mapping.priority,
      defaultPrice: mapping.defaultPrice?.toString() ?? null,
      leadTime: mapping.leadTime,
      minimumOrderQuantity: mapping.minimumOrderQuantity?.toString() ?? null,
      createdAt: mapping.createdAt,
      updatedAt: mapping.updatedAt,
    };
  }
}
