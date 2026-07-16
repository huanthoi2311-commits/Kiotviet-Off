import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { ProductEntity } from '../domain/entities/product.entity';
import { PRODUCT_REPOSITORY } from '../domain/repositories/product.repository.interface';
import type {
  IProductRepository,
  ProductSearchParams,
} from '../domain/repositories/product.repository.interface';
import { SKU_GENERATOR } from '../domain/services/sku-generator.interface';
import type { ISkuGenerator } from '../domain/services/sku-generator.interface';
import { SLUG_GENERATOR } from '../domain/services/slug-generator.interface';
import type { ISlugGenerator } from '../domain/services/slug-generator.interface';
import { CreateProductDto } from './dto/create-product.dto';
import {
  PaginatedProductResponseDto,
  ProductResponseDto,
} from './dto/product-response.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductMapper } from './mappers/product.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class ProductService {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
    @Inject(SKU_GENERATOR) private readonly skuGenerator: ISkuGenerator,
    @Inject(SLUG_GENERATOR) private readonly slugGenerator: ISlugGenerator,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    dto: CreateProductDto,
    actor: ActorContext,
  ): Promise<ProductResponseDto> {
    this.assertHasRetailPrice(dto.prices);

    const [sku, slug] = await Promise.all([
      this.skuGenerator.generate(actor.organizationId),
      this.slugGenerator.generateUnique(actor.organizationId, dto.name),
    ]);

    const created = await this.productRepository.create({
      organizationId: actor.organizationId,
      categoryId: dto.categoryId,
      brandId: dto.brandId ?? null,
      unitId: dto.unitId,
      sku,
      slug,
      name: dto.name,
      description: dto.description ?? null,
      costPrice: dto.costPrice,
      vat: dto.vat,
      weight: dto.weight,
      length: dto.length,
      width: dto.width,
      height: dto.height,
      // Cau noi tam thoi - CreateProductDto chua co field "type" (SPEC-PRODUCT-001 SS9, se lam o
      // Commit 4 cung DTO). CreateProductDto chua tung co "isService" (repository truoc day tu
      // default false) nen gia tri tuong duong dung hanh vi hien tai la hang so STANDARD.
      type: 'STANDARD',
      status: dto.status,
      isActive: dto.isActive,
      prices: dto.prices,
      images: dto.images,
      barcodes: dto.barcodes,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'product.create',
      entityType: 'Product',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return ProductMapper.toResponseDto(created);
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<ProductResponseDto> {
    const product = await this.productRepository.findById(id, organizationId);
    if (!product) throw this.notFound();
    return ProductMapper.toResponseDto(product);
  }

  async search(
    query: ProductQueryDto,
    organizationId: string,
  ): Promise<PaginatedProductResponseDto> {
    const params: ProductSearchParams = {
      organizationId,
      search: query.search,
      categoryId: query.categoryId,
      brandId: query.brandId,
      status: query.status,
      createdFrom: query.createdFrom ? new Date(query.createdFrom) : undefined,
      createdTo: query.createdTo ? new Date(query.createdTo) : undefined,
      updatedFrom: query.updatedFrom ? new Date(query.updatedFrom) : undefined,
      updatedTo: query.updatedTo ? new Date(query.updatedTo) : undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'desc',
    };

    const result = await this.productRepository.search(params);
    return {
      items: result.items.map((item) => ProductMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    actor: ActorContext,
  ): Promise<ProductResponseDto> {
    const existing = await this.productRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    const slug =
      dto.name && dto.name !== existing.name
        ? await this.slugGenerator.generateUnique(
            actor.organizationId,
            dto.name,
            id,
          )
        : undefined;

    // Cau noi tam thoi - UpdateProductDto chua co field "version" de client gui lai gia tri da
    // doc (SPEC-PRODUCT-001 SS4/SS9, se lam o Commit 4 cung DTO). Dung existing.version doc lai
    // ngay truoc do KHONG phai Optimistic Lock dung nghia (khong the phat hien xung dot tu request
    // khac) - chi la cau noi de Repository (da xong o Commit 3) compile va chay duoc tam thoi.
    const updated = await this.productRepository.update(id, existing.version, {
      categoryId: dto.categoryId,
      brandId: dto.brandId,
      unitId: dto.unitId,
      name: dto.name,
      slug,
      description: dto.description,
      costPrice: dto.costPrice,
      vat: dto.vat,
      weight: dto.weight,
      length: dto.length,
      width: dto.width,
      height: dto.height,
      status: dto.status,
      isActive: dto.isActive,
      updatedBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'product.update',
      entityType: 'Product',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return ProductMapper.toResponseDto(updated);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await this.productRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    await this.productRepository.softDelete(id, actor.userId);

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'product.delete',
      entityType: 'Product',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }

  async restore(id: string, actor: ActorContext): Promise<ProductResponseDto> {
    const existing = await this.productRepository.findByIdIncludingDeleted(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();
    if (!existing.deletedAt) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.PRODUCT_NOT_DELETED,
          'Sản phẩm chưa bị xóa, không thể khôi phục',
        ),
      );
    }

    await this.productRepository.restore(id, actor.userId);
    const restored = await this.productRepository.findById(
      id,
      actor.organizationId,
    );
    if (!restored) throw this.notFound();

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'product.restore',
      entityType: 'Product',
      entityId: id,
      newValue: this.toAuditSnapshot(restored),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return ProductMapper.toResponseDto(restored);
  }

  private assertHasRetailPrice(prices: CreateProductDto['prices']): void {
    const hasRetail = prices.some((p) => p.type === 'RETAIL');
    if (!hasRetail) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.PRODUCT_MISSING_RETAIL_PRICE,
          'Sản phẩm phải có ít nhất 1 mức giá RETAIL',
        ),
      );
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(ErrorCode.PRODUCT_NOT_FOUND, 'Không tìm thấy sản phẩm'),
    );
  }

  private toAuditSnapshot(product: ProductEntity): Record<string, unknown> {
    return {
      sku: product.sku,
      slug: product.slug,
      name: product.name,
      categoryId: product.categoryId,
      brandId: product.brandId,
      unitId: product.unitId,
      costPrice: product.costPrice,
      vat: product.vat,
      status: product.status,
      isActive: product.isActive,
    };
  }
}
