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
import { UnitEntity } from '../domain/entities/unit.entity';
import { UnitConcurrencyConflictError } from '../domain/errors/unit.errors';
import { UNIT_REPOSITORY } from '../domain/repositories/unit.repository.interface';
import type { IUnitRepository } from '../domain/repositories/unit.repository.interface';
import { UnitQueryDto } from './dto/unit-query.dto';
import {
  PaginatedUnitResponseDto,
  UnitResponseDto,
} from './dto/unit-response.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UnitMapper } from './mappers/unit.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class UnitService {
  constructor(
    @Inject(UNIT_REPOSITORY) private readonly unitRepository: IUnitRepository,
    private readonly productDomainService: ProductDomainService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    dto: CreateUnitDto,
    actor: ActorContext,
  ): Promise<UnitResponseDto> {
    const created = await this.unitRepository.create({
      organizationId: actor.organizationId,
      ...dto,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'unit.create',
      entityType: 'Unit',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onUnitCreated(created);
    return UnitMapper.toResponseDto(created);
  }

  async findOne(id: string, organizationId: string): Promise<UnitResponseDto> {
    const unit = await this.unitRepository.findById(id, organizationId);
    if (!unit) throw this.notFound();
    return UnitMapper.toResponseDto(unit);
  }

  async search(
    query: UnitQueryDto,
    organizationId: string,
  ): Promise<PaginatedUnitResponseDto> {
    const result = await this.unitRepository.search({
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
      items: result.items.map((item) => UnitMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async update(
    id: string,
    dto: UpdateUnitDto,
    actor: ActorContext,
  ): Promise<UnitResponseDto> {
    const existing = await this.unitRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    let updated: UnitEntity;
    try {
      updated = await this.unitRepository.update(
        id,
        actor.organizationId,
        dto.version,
        {
          code: dto.code,
          name: dto.name,
          symbol: dto.symbol,
          status: dto.status,
          updatedBy: actor.userId,
        },
      );
    } catch (error) {
      if (error instanceof UnitConcurrencyConflictError) {
        throw new ConflictException(
          withCode(ErrorCode.UNIT_VERSION_CONFLICT, error.message),
        );
      }
      throw error;
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'unit.update',
      entityType: 'Unit',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onUnitUpdated(updated);
    return UnitMapper.toResponseDto(updated);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await this.unitRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    const hasProducts =
      await this.productDomainService.hasActiveProductsInUnit(id);
    if (hasProducts) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.UNIT_IN_USE,
          'Không thể xóa đơn vị tính đang có sản phẩm sử dụng',
        ),
      );
    }

    // Delete Guard cho Barcode (Decision RQ5/UP07) sẽ được thêm ở bước "Barcode Adjustment"
    // (đúng thứ tự đã ủy quyền: Repository → Application → Controller → Product Adjustment →
    // Barcode Adjustment) — BarcodeDomainService chưa tồn tại tại commit này.

    await this.unitRepository.softDelete(
      id,
      actor.organizationId,
      actor.userId,
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'unit.delete',
      entityType: 'Unit',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onUnitArchived(id);
  }

  /** SPEC-UNIT-001 §9 (Decision RQ3) — luôn trả status về INACTIVE, không tự động ACTIVE. */
  async restore(id: string, actor: ActorContext): Promise<UnitResponseDto> {
    const existing = await this.unitRepository.findByIdIncludingDeleted(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();
    if (!existing.deletedAt) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.UNIT_NOT_DELETED,
          'Đơn vị tính chưa bị xóa, không thể khôi phục',
        ),
      );
    }

    await this.unitRepository.restore(id, actor.organizationId, actor.userId);
    const restored = await this.unitRepository.findById(
      id,
      actor.organizationId,
    );
    if (!restored) throw this.notFound();

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'unit.restore',
      entityType: 'Unit',
      entityId: id,
      newValue: this.toAuditSnapshot(restored),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onUnitRestored(restored);
    return UnitMapper.toResponseDto(restored);
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(ErrorCode.UNIT_NOT_FOUND, 'Không tìm thấy đơn vị tính'),
    );
  }

  private toAuditSnapshot(unit: UnitEntity): Record<string, unknown> {
    return { code: unit.code, name: unit.name, symbol: unit.symbol };
  }

  /**
   * Điểm mở rộng Domain Event (SPEC-UNIT-001 §12, Decision RQ4) — cố ý để trống, KHÔNG publish
   * (đúng mẫu `CategoryService`/`BrandService`). Chỉ định nghĩa tên + thời điểm gọi, chờ Sprint
   * Event triển khai Outbox thật (ADR-0009/ADR-0011).
   */
  private onUnitCreated(unit: UnitEntity): void {
    void unit;
  }

  private onUnitUpdated(unit: UnitEntity): void {
    void unit;
  }

  private onUnitArchived(unitId: string): void {
    void unitId;
  }

  private onUnitRestored(unit: UnitEntity): void {
    void unit;
  }
}
