import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { ProductEntity } from '../../domain/entities/product.entity';
import {
  CreateProductInput,
  IProductRepository,
  ProductSearchParams,
  ProductSearchResult,
  UpdateProductInput,
} from '../../domain/repositories/product.repository.interface';

const PRODUCT_INCLUDE = {
  prices: { where: { deletedAt: null } },
  images: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' as const },
  },
  barcodes: { where: { deletedAt: null } },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof PRODUCT_INCLUDE;
}>;

@Injectable()
export class PrismaProductRepository implements IProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateProductInput): Promise<ProductEntity> {
    try {
      const product = await this.prisma.product.create({
        data: {
          organizationId: input.organizationId,
          categoryId: input.categoryId,
          brandId: input.brandId ?? null,
          unitId: input.unitId,
          sku: input.sku,
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          costPrice: input.costPrice,
          vat: input.vat ?? 0,
          weight: input.weight ?? null,
          length: input.length ?? null,
          width: input.width ?? null,
          height: input.height ?? null,
          minStock: input.minStock ?? null,
          maxStock: input.maxStock ?? null,
          isService: input.isService ?? false,
          allowSale: input.allowSale ?? true,
          status: input.status ?? 'ACTIVE',
          isActive: input.isActive ?? true,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          prices: { createMany: { data: input.prices } },
          images: input.images?.length
            ? {
                createMany: {
                  data: input.images.map((image, index) => ({
                    url: image.url,
                    sortOrder: image.sortOrder ?? index,
                    isThumbnail: image.isThumbnail ?? index === 0,
                  })),
                },
              }
            : undefined,
          barcodes: input.barcodes?.length
            ? {
                createMany: {
                  data: input.barcodes.map((barcode, index) => ({
                    organizationId: input.organizationId,
                    code: barcode.code,
                    type: barcode.type,
                    isDefault: barcode.isDefault ?? index === 0,
                  })),
                },
              }
            : undefined,
        },
        include: PRODUCT_INCLUDE,
      });

      return this.toEntity(product);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<ProductEntity | null> {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: PRODUCT_INCLUDE,
    });
    return product ? this.toEntity(product) : null;
  }

  async findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<ProductEntity | null> {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
      include: PRODUCT_INCLUDE,
    });
    return product ? this.toEntity(product) : null;
  }

  async update(id: string, input: UpdateProductInput): Promise<ProductEntity> {
    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          categoryId: input.categoryId,
          brandId: input.brandId,
          unitId: input.unitId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          costPrice: input.costPrice,
          vat: input.vat,
          weight: input.weight,
          length: input.length,
          width: input.width,
          height: input.height,
          minStock: input.minStock,
          maxStock: input.maxStock,
          isService: input.isService,
          allowSale: input.allowSale,
          status: input.status,
          isActive: input.isActive,
          updatedBy: input.updatedBy,
        },
        include: PRODUCT_INCLUDE,
      });
      return this.toEntity(product);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  }

  async restore(id: string, restoredBy: string): Promise<void> {
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: null, updatedBy: restoredBy },
    });
  }

  async search(params: ProductSearchParams): Promise<ProductSearchResult> {
    const where: Prisma.ProductWhereInput = {
      organizationId: params.organizationId,
      deletedAt: params.includeDeleted ? undefined : null,
      categoryId: params.categoryId,
      brandId: params.brandId,
      status: params.status,
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { sku: { contains: params.search, mode: 'insensitive' } },
              {
                barcodes: {
                  some: {
                    code: { contains: params.search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
      ...(params.createdFrom || params.createdTo
        ? { createdAt: { gte: params.createdFrom, lte: params.createdTo } }
        : {}),
      ...(params.updatedFrom || params.updatedTo
        ? { updatedAt: { gte: params.updatedFrom, lte: params.updatedTo } }
        : {}),
    };

    if (params.sortBy === 'price') {
      return this.searchSortedByPrice(where, params);
    }

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip,
        take: params.limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  /**
   * Prisma không hỗ trợ orderBy trực tiếp theo giá trị của quan hệ 1-n đã lọc
   * (ProductPrice là 1 product - nhiều loại giá) mà không dùng SQL raw. Giải pháp:
   * sắp thứ tự productId qua bảng ProductPrice (type=RETAIL) trước, rồi fetch
   * Product theo đúng thứ tự đó — vẫn thuần Prisma, không SQL raw.
   */
  private async searchSortedByPrice(
    where: Prisma.ProductWhereInput,
    params: ProductSearchParams,
  ): Promise<ProductSearchResult> {
    const total = await this.prisma.product.count({ where });
    const skip = (params.page - 1) * params.limit;

    const orderedPrices = await this.prisma.productPrice.findMany({
      where: { type: 'RETAIL', deletedAt: null, product: where },
      orderBy: { price: params.sortOrder },
      skip,
      take: params.limit,
      select: { productId: true },
    });

    const orderedIds = orderedPrices.map((p) => p.productId);
    if (orderedIds.length === 0) {
      return { items: [], total, page: params.page, limit: params.limit };
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: orderedIds } },
      include: PRODUCT_INCLUDE,
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = orderedIds
      .map((id) => byId.get(id))
      .filter((p): p is ProductWithRelations => !!p)
      .map((p) => this.toEntity(p));

    return { items, total, page: params.page, limit: params.limit };
  }

  async existsBySku(organizationId: string, sku: string): Promise<boolean> {
    const found = await this.prisma.product.findFirst({
      where: { organizationId, sku },
      select: { id: true },
    });
    return !!found;
  }

  async existsBySlug(
    organizationId: string,
    slug: string,
    excludeId?: string,
  ): Promise<boolean> {
    const found = await this.prisma.product.findFirst({
      where: {
        organizationId,
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return !!found;
  }

  async existsByBarcode(
    organizationId: string,
    code: string,
  ): Promise<boolean> {
    const found = await this.prisma.barcode.findFirst({
      where: { code, product: { organizationId } },
      select: { id: true },
    });
    return !!found;
  }

  async hasActiveProductsInCategory(categoryId: string): Promise<boolean> {
    const found = await this.prisma.product.findFirst({
      where: { categoryId, deletedAt: null },
      select: { id: true },
    });
    return !!found;
  }

  async hasActiveProductsInBrand(brandId: string): Promise<boolean> {
    const found = await this.prisma.product.findFirst({
      where: { brandId, deletedAt: null },
      select: { id: true },
    });
    return !!found;
  }

  async hasActiveProductsInUnit(unitId: string): Promise<boolean> {
    const found = await this.prisma.product.findFirst({
      where: { unitId, deletedAt: null },
      select: { id: true },
    });
    return !!found;
  }

  private translateWriteError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target =
          (error.meta?.target as string[] | undefined)?.join(', ') ??
          'trường dữ liệu';
        return new ConflictException(
          withCode(
            ErrorCode.PRODUCT_DUPLICATE,
            `Giá trị của "${target}" đã tồn tại`,
          ),
        );
      }
      if (error.code === 'P2003') {
        const field = (error.meta?.field_name as string | undefined) ?? '';
        const label = field.includes('categoryId')
          ? 'categoryId'
          : field.includes('brandId')
            ? 'brandId'
            : field.includes('unitId')
              ? 'unitId'
              : 'liên kết';
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

  private toEntity(product: ProductWithRelations): ProductEntity {
    return {
      id: product.id,
      organizationId: product.organizationId,
      categoryId: product.categoryId,
      brandId: product.brandId,
      unitId: product.unitId,
      sku: product.sku,
      slug: product.slug,
      name: product.name,
      description: product.description,
      costPrice: product.costPrice.toString(),
      vat: product.vat.toString(),
      weight: product.weight?.toString() ?? null,
      length: product.length?.toString() ?? null,
      width: product.width?.toString() ?? null,
      height: product.height?.toString() ?? null,
      minStock: product.minStock?.toString() ?? null,
      maxStock: product.maxStock?.toString() ?? null,
      isService: product.isService,
      allowSale: product.allowSale,
      status: product.status,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      deletedAt: product.deletedAt,
      prices: product.prices.map((p) => ({
        id: p.id,
        type: p.type,
        price: p.price.toString(),
      })),
      images: product.images.map((i) => ({
        id: i.id,
        url: i.url,
        sortOrder: i.sortOrder,
        isThumbnail: i.isThumbnail,
      })),
      barcodes: product.barcodes.map((b) => ({
        id: b.id,
        code: b.code,
        type: b.type,
        isDefault: b.isDefault,
      })),
    };
  }
}
