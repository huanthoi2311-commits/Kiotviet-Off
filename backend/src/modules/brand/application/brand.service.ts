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
import { ProductDomainService } from '../../product/application/product-domain.service';
import { BrandEntity } from '../domain/entities/brand.entity';
import { BrandConcurrencyConflictError } from '../domain/errors/brand.errors';
import { BRAND_REPOSITORY } from '../domain/repositories/brand.repository.interface';
import type { IBrandRepository } from '../domain/repositories/brand.repository.interface';
import { BrandQueryDto } from './dto/brand-query.dto';
import {
  BrandResponseDto,
  PaginatedBrandResponseDto,
} from './dto/brand-response.dto';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { BrandMapper } from './mappers/brand.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class BrandService {
  constructor(
    @Inject(BRAND_REPOSITORY)
    private readonly brandRepository: IBrandRepository,
    private readonly productDomainService: ProductDomainService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    dto: CreateBrandDto,
    actor: ActorContext,
  ): Promise<BrandResponseDto> {
    const created = await this.brandRepository.create({
      organizationId: actor.organizationId,
      ...dto,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'brand.create',
      entityType: 'Brand',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onBrandCreated(created);
    return BrandMapper.toResponseDto(created);
  }

  async findOne(id: string, organizationId: string): Promise<BrandResponseDto> {
    const brand = await this.brandRepository.findById(id, organizationId);
    if (!brand) throw this.notFound();
    return BrandMapper.toResponseDto(brand);
  }

  async search(
    query: BrandQueryDto,
    organizationId: string,
  ): Promise<PaginatedBrandResponseDto> {
    const result = await this.brandRepository.search({
      organizationId,
      search: query.search,
      status: query.status,
      isActive: query.isActive,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortBy: query.sortBy ?? 'name',
      sortOrder: query.sortOrder ?? 'asc',
    });

    return {
      items: result.items.map((item) => BrandMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async update(
    id: string,
    dto: UpdateBrandDto,
    actor: ActorContext,
  ): Promise<BrandResponseDto> {
    const existing = await this.brandRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    let updated: BrandEntity;
    try {
      updated = await this.brandRepository.update(id, dto.version, {
        code: dto.code,
        name: dto.name,
        logo: dto.logo,
        description: dto.description,
        website: dto.website,
        country: dto.country,
        status: dto.status,
        updatedBy: actor.userId,
      });
    } catch (error) {
      if (error instanceof BrandConcurrencyConflictError) {
        throw new ConflictException(
          withCode(ErrorCode.BRAND_VERSION_CONFLICT, error.message),
        );
      }
      throw error;
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'brand.update',
      entityType: 'Brand',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onBrandUpdated(updated);
    return BrandMapper.toResponseDto(updated);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await this.brandRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    const hasProducts =
      await this.productDomainService.hasActiveProductsInBrand(id);
    if (hasProducts) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.BRAND_HAS_PRODUCTS,
          'Không thể xóa thương hiệu đang có sản phẩm sử dụng',
        ),
      );
    }

    await this.brandRepository.softDelete(id, actor.userId);

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'brand.delete',
      entityType: 'Brand',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onBrandArchived(id);
  }

  /** SPEC-BRAND-001 §8 (Decision B02.3/RQ2) — luôn trả status về INACTIVE, không tự động ACTIVE. */
  async restore(id: string, actor: ActorContext): Promise<BrandResponseDto> {
    const existing = await this.brandRepository.findByIdIncludingDeleted(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();
    if (!existing.deletedAt) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.BRAND_NOT_DELETED,
          'Thương hiệu chưa bị xóa, không thể khôi phục',
        ),
      );
    }

    await this.brandRepository.restore(id, actor.userId);
    const restored = await this.brandRepository.findById(
      id,
      actor.organizationId,
    );
    if (!restored) throw this.notFound();

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'brand.restore',
      entityType: 'Brand',
      entityId: id,
      newValue: this.toAuditSnapshot(restored),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onBrandRestored(restored);
    return BrandMapper.toResponseDto(restored);
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(ErrorCode.BRAND_NOT_FOUND, 'Không tìm thấy thương hiệu'),
    );
  }

  private toAuditSnapshot(brand: BrandEntity): Record<string, unknown> {
    return { code: brand.code, name: brand.name, status: brand.status };
  }

  /**
   * Điểm mở rộng Domain Event (RFC-0003 §Out of Scope, SPEC-BRAND-001 §10, Decision B02.9) — cố
   * ý để trống, KHÔNG publish (đúng mẫu `CategoryService.onCategoryCreated()` v.v., T006). Chỉ
   * định nghĩa tên + thời điểm gọi, chờ Sprint Event triển khai Outbox thật (ADR-0009/ADR-0011).
   */
  private onBrandCreated(brand: BrandEntity): void {
    void brand;
  }

  private onBrandUpdated(brand: BrandEntity): void {
    void brand;
  }

  private onBrandArchived(brandId: string): void {
    void brandId;
  }

  private onBrandRestored(brand: BrandEntity): void {
    void brand;
  }
}
