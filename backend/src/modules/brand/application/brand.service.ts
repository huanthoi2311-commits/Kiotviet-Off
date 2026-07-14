import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { PRODUCT_REPOSITORY } from '../../product/domain/repositories/product.repository.interface';
import type { IProductRepository } from '../../product/domain/repositories/product.repository.interface';
import { BrandEntity } from '../domain/entities/brand.entity';
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
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
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
      page: query.page ?? 1,
      limit: query.limit ?? 20,
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

    const updated = await this.brandRepository.update(id, {
      ...dto,
      updatedBy: actor.userId,
    });

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

    return BrandMapper.toResponseDto(updated);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await this.brandRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    const hasProducts =
      await this.productRepository.hasActiveProductsInBrand(id);
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
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(ErrorCode.BRAND_NOT_FOUND, 'Không tìm thấy thương hiệu'),
    );
  }

  private toAuditSnapshot(brand: BrandEntity): Record<string, unknown> {
    return { code: brand.code, name: brand.name, status: brand.status };
  }
}
