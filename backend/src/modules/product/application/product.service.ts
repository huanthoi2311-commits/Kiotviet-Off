import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { ProductEntity, ProductType } from '../domain/entities/product.entity';
import { ProductConcurrencyConflictError } from '../domain/errors/product.errors';
import { PRODUCT_REPOSITORY } from '../domain/repositories/product.repository.interface';
import type {
  IProductRepository,
  ProductSearchParams,
} from '../domain/repositories/product.repository.interface';
import { SKU_GENERATOR } from '../domain/services/sku-generator.interface';
import type { ISkuGenerator } from '../domain/services/sku-generator.interface';
import { SLUG_GENERATOR } from '../domain/services/slug-generator.interface';
import type { ISlugGenerator } from '../domain/services/slug-generator.interface';
import { isProductRefactorEnabled } from '../product-refactor.flag';
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
    await this.assertValidVariantRelationship(
      dto.type,
      dto.parentProductId ?? null,
      dto.categoryId,
      actor.organizationId,
    );

    const [sku, slug] = await Promise.all([
      this.skuGenerator.generate(actor.organizationId),
      this.slugGenerator.generateUnique(actor.organizationId, dto.name),
    ]);

    const created = await this.productRepository.create({
      organizationId: actor.organizationId,
      categoryId: dto.categoryId,
      brandId: dto.brandId ?? null,
      unitId: dto.unitId,
      parentProductId: dto.parentProductId ?? null,
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
      type: dto.type,
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

    this.onProductCreated(created);
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
      unitId: query.unitId,
      parentProductId: query.parentProductId,
      status: query.status,
      type: query.type,
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

    const effectiveType = dto.type ?? existing.type;
    const effectiveParentProductId =
      dto.parentProductId !== undefined
        ? dto.parentProductId
        : existing.parentProductId;
    const effectiveCategoryId = dto.categoryId ?? existing.categoryId;
    await this.assertValidVariantRelationship(
      effectiveType,
      effectiveParentProductId,
      effectiveCategoryId,
      actor.organizationId,
    );

    // Product Type Rule (Decision A06) - gate sau Feature Flag (Decision A12/C03): tat thi giu
    // hanh vi truoc refactor (doi type tu do, dung "type" chua tung ton tai truoc SPEC nay nen
    // khong co hanh vi cu nao can bao ve).
    if (
      isProductRefactorEnabled() &&
      dto.type !== undefined &&
      dto.type !== existing.type
    ) {
      const hasTransactions =
        await this.productRepository.hasTransactionHistory(id);
      if (hasTransactions) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.PRODUCT_TYPE_CHANGE_BLOCKED,
            'Không thể đổi loại sản phẩm vì đã phát sinh giao dịch',
          ),
        );
      }
    }

    const slug =
      dto.name && dto.name !== existing.name
        ? await this.slugGenerator.generateUnique(
            actor.organizationId,
            dto.name,
            id,
          )
        : undefined;

    // Optimistic Lock (Decision A02/A09) - gate sau Feature Flag: tat thi dung lai version doc
    // ngay truoc do (khong phat hien duoc xung dot tu request khac, giu hanh vi truoc refactor
    // vi UpdateProductDto truoc SPEC nay chua tung co field "version" de client gui len).
    const expectedVersion = isProductRefactorEnabled()
      ? dto.version
      : existing.version;

    let updated: ProductEntity;
    try {
      updated = await this.productRepository.update(id, expectedVersion, {
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        unitId: dto.unitId,
        parentProductId: dto.parentProductId,
        name: dto.name,
        slug,
        description: dto.description,
        costPrice: dto.costPrice,
        vat: dto.vat,
        weight: dto.weight,
        length: dto.length,
        width: dto.width,
        height: dto.height,
        type: dto.type,
        status: dto.status,
        isActive: dto.isActive,
        updatedBy: actor.userId,
      });
    } catch (error) {
      if (error instanceof ProductConcurrencyConflictError) {
        throw new ConflictException(
          withCode(ErrorCode.PRODUCT_VERSION_CONFLICT, error.message),
        );
      }
      throw error;
    }

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

    this.onProductUpdated(updated);
    if (updated.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      this.onProductActivated(updated);
    }

    return ProductMapper.toResponseDto(updated);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await this.productRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    // Archive Rule (RFC §8) - gate sau Feature Flag: tat thi cho Archive tu do (giu hanh vi truoc
    // refactor vi Variant Child chua tung ton tai truoc SPEC nay, khong co gi can bao ve).
    if (isProductRefactorEnabled()) {
      const hasActiveVariants =
        await this.productRepository.hasActiveVariantChildren(id);
      if (hasActiveVariants) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.PRODUCT_ARCHIVE_BLOCKED_ACTIVE_VARIANTS,
            'Không thể lưu trữ sản phẩm vì còn Variant đang hoạt động',
          ),
        );
      }
    }

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

    this.onProductArchived(id);
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

    // Decision A05: restore luon tra status ve INACTIVE (khong phai ACTIVE) - da xu ly o
    // PrismaProductRepository.restore() (Commit 3), khong lap lai logic o day.
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

  /**
   * Bất biến Variant (RFC §8, SPEC-PRODUCT-001 §5) - luôn thực thi, không gate Feature Flag vì
   * `type=VARIANT_CHILD`/`VARIANT_PARENT` chưa từng tồn tại trước SPEC này, không có hành vi cũ
   * nào cần bảo vệ (khác với A06/Archive Rule vốn thay đổi hành vi ĐÃ CÓ trước đây).
   *
   * Bổ sung T006 (RFC-0002 §7, SPEC-CATEGORY-001 §5, Decision Q8/S03): Variant Child bắt buộc
   * cùng `categoryId` với Variant Parent - invariant thuộc domain Category nhưng thực thi ở
   * đây vì đây là nơi duy nhất Product biết cả `type`/`parentProductId`/`categoryId` cùng lúc.
   */
  private async assertValidVariantRelationship(
    type: ProductType,
    parentProductId: string | null,
    categoryId: string,
    organizationId: string,
  ): Promise<void> {
    if (type === 'VARIANT_CHILD') {
      if (!parentProductId) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.PRODUCT_VARIANT_PARENT_REQUIRED,
            'Sản phẩm loại VARIANT_CHILD phải chỉ định parentProductId',
          ),
        );
      }
      const parent = await this.productRepository.findById(
        parentProductId,
        organizationId,
      );
      if (!parent || parent.type !== 'VARIANT_PARENT') {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.PRODUCT_VARIANT_PARENT_INVALID,
            'parentProductId phải trỏ tới 1 sản phẩm loại VARIANT_PARENT',
          ),
        );
      }
      if (parent.categoryId !== categoryId) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.PRODUCT_VARIANT_CATEGORY_MISMATCH,
            'Variant Child phải cùng danh mục với Variant Parent',
          ),
        );
      }
      return;
    }

    if (parentProductId) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.PRODUCT_VARIANT_PARENT_NOT_ALLOWED,
          'parentProductId chỉ được phép khi type=VARIANT_CHILD',
        ),
      );
    }
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
      parentProductId: product.parentProductId,
      costPrice: product.costPrice,
      vat: product.vat,
      type: product.type,
      status: product.status,
      isActive: product.isActive,
      version: product.version,
    };
  }

  /**
   * Điểm mở rộng Domain Event (SPEC-PRODUCT-001 §10) - cố ý để trống, KHÔNG publish ở Sprint-01
   * (đúng mẫu `InventoryDomainService.onMovementRecorded()`, T004). Chỉ định nghĩa tên +
   * thời điểm gọi, chờ Sprint Event triển khai cơ chế Outbox thật (ADR-0009/ADR-0011).
   */
  private onProductCreated(product: ProductEntity): void {
    void product;
  }

  private onProductUpdated(product: ProductEntity): void {
    void product;
  }

  private onProductArchived(productId: string): void {
    void productId;
  }

  private onProductActivated(product: ProductEntity): void {
    void product;
  }
}
