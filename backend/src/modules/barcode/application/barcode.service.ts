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
import { UnitDomainService } from '../../unit/application/unit-domain.service';
import { BarcodeEntity } from '../domain/entities/barcode.entity';
import { BarcodeConcurrencyConflictError } from '../domain/errors/barcode.errors';
import { BARCODE_REPOSITORY } from '../domain/repositories/barcode.repository.interface';
import type { IBarcodeRepository } from '../domain/repositories/barcode.repository.interface';
import { BarcodeQueryDto } from './dto/barcode-query.dto';
import {
  BarcodeResponseDto,
  PaginatedBarcodeResponseDto,
} from './dto/barcode-response.dto';
import { CreateBarcodeDto } from './dto/create-barcode.dto';
import { UpdateBarcodeDto } from './dto/update-barcode.dto';
import { BarcodeMapper } from './mappers/barcode.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class BarcodeService {
  constructor(
    @Inject(BARCODE_REPOSITORY)
    private readonly barcodeRepository: IBarcodeRepository,
    private readonly productDomainService: ProductDomainService,
    private readonly unitDomainService: UnitDomainService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listByProduct(
    productId: string,
    organizationId: string,
  ): Promise<BarcodeResponseDto[]> {
    await this.assertProductExists(productId, organizationId);
    const barcodes = await this.barcodeRepository.listByProduct(
      productId,
      organizationId,
    );
    return barcodes.map((barcode) => BarcodeMapper.toResponseDto(barcode));
  }

  /** SPEC-BARCODE-001 §4.2 — tra cứu org-wide, dùng cho GET /barcodes. */
  async search(
    query: BarcodeQueryDto,
    organizationId: string,
  ): Promise<PaginatedBarcodeResponseDto> {
    const result = await this.barcodeRepository.search({
      organizationId,
      search: query.search,
      status: query.status,
      isActive: query.isActive,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'desc',
    });

    return {
      items: result.items.map((item) => BarcodeMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async create(
    productId: string,
    dto: CreateBarcodeDto,
    actor: ActorContext,
  ): Promise<BarcodeResponseDto> {
    await this.assertProductExists(productId, actor.organizationId);
    await this.assertCodeNotDuplicate(actor.organizationId, dto.code);
    await this.assertUnitUsable(dto.unitId, actor.organizationId);

    const created = await this.barcodeRepository.create({
      productId,
      organizationId: actor.organizationId,
      unitId: dto.unitId ?? null,
      code: dto.code,
      type: dto.type,
      isDefault: dto.isDefault,
      status: dto.status,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'barcode.create',
      entityType: 'Barcode',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onBarcodeCreated(created);
    return BarcodeMapper.toResponseDto(created);
  }

  async update(
    id: string,
    dto: UpdateBarcodeDto,
    actor: ActorContext,
  ): Promise<BarcodeResponseDto> {
    const existing = await this.barcodeRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    if (dto.code && dto.code !== existing.code) {
      await this.assertCodeNotDuplicate(actor.organizationId, dto.code, id);
    }
    if (dto.unitId !== undefined) {
      await this.assertUnitUsable(
        dto.unitId ?? undefined,
        actor.organizationId,
      );
    }

    let updated: BarcodeEntity;
    try {
      updated = await this.barcodeRepository.update(
        id,
        actor.organizationId,
        dto.version,
        {
          code: dto.code,
          type: dto.type,
          unitId: dto.unitId,
          status: dto.status,
          updatedBy: actor.userId,
        },
      );
    } catch (error) {
      if (error instanceof BarcodeConcurrencyConflictError) {
        throw new ConflictException(
          withCode(ErrorCode.BARCODE_VERSION_CONFLICT, error.message),
        );
      }
      throw error;
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'barcode.update',
      entityType: 'Barcode',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onBarcodeUpdated(updated);
    return BarcodeMapper.toResponseDto(updated);
  }

  /** SPEC-BARCODE-001 §8 (Decision BQ2) — chỉ chặn khi isDefault=true VÀ Product đang ACTIVE. */
  async remove(
    id: string,
    version: number,
    actor: ActorContext,
  ): Promise<void> {
    const existing = await this.barcodeRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    if (existing.isDefault) {
      const product = await this.productDomainService.findById(
        existing.productId,
        actor.organizationId,
      );
      if (product?.status === 'ACTIVE') {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.BARCODE_CANNOT_ARCHIVE_DEFAULT,
            'Không thể xóa mã vạch mặc định khi sản phẩm đang hoạt động — đặt mã khác làm mặc định hoặc chuyển sản phẩm sang ngừng hoạt động trước',
          ),
        );
      }
    }

    try {
      await this.barcodeRepository.softDelete(
        id,
        actor.organizationId,
        version,
        actor.userId,
      );
    } catch (error) {
      if (error instanceof BarcodeConcurrencyConflictError) {
        throw new ConflictException(
          withCode(ErrorCode.BARCODE_VERSION_CONFLICT, error.message),
        );
      }
      throw error;
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'barcode.delete',
      entityType: 'Barcode',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onBarcodeArchived(id);
  }

  /** SPEC-BARCODE-001 §4.1 (Decision BQ3) — luôn trả status về INACTIVE, không tự động ACTIVE. */
  async restore(
    id: string,
    version: number,
    actor: ActorContext,
  ): Promise<BarcodeResponseDto> {
    const existing = await this.barcodeRepository.findByIdIncludingDeleted(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();
    if (!existing.deletedAt) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.BARCODE_NOT_DELETED,
          'Mã vạch chưa bị xóa, không thể khôi phục',
        ),
      );
    }

    try {
      await this.barcodeRepository.restore(
        id,
        actor.organizationId,
        version,
        actor.userId,
      );
    } catch (error) {
      if (error instanceof BarcodeConcurrencyConflictError) {
        throw new ConflictException(
          withCode(ErrorCode.BARCODE_VERSION_CONFLICT, error.message),
        );
      }
      throw error;
    }

    const restored = await this.barcodeRepository.findById(
      id,
      actor.organizationId,
    );
    if (!restored) throw this.notFound();

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'barcode.restore',
      entityType: 'Barcode',
      entityId: id,
      newValue: this.toAuditSnapshot(restored),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.onBarcodeRestored(restored);
    return BarcodeMapper.toResponseDto(restored);
  }

  async setDefault(
    id: string,
    version: number,
    actor: ActorContext,
  ): Promise<BarcodeResponseDto> {
    const existing = await this.barcodeRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    let updated: BarcodeEntity;
    try {
      updated = await this.barcodeRepository.setDefault(
        id,
        actor.organizationId,
        existing.productId,
        version,
        actor.userId,
      );
    } catch (error) {
      if (error instanceof BarcodeConcurrencyConflictError) {
        throw new ConflictException(
          withCode(ErrorCode.BARCODE_VERSION_CONFLICT, error.message),
        );
      }
      throw error;
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'barcode.set_default',
      entityType: 'Barcode',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return BarcodeMapper.toResponseDto(updated);
  }

  private async assertProductExists(
    productId: string,
    organizationId: string,
  ): Promise<void> {
    const product = await this.productDomainService.findById(
      productId,
      organizationId,
    );
    if (!product) {
      throw new NotFoundException(
        withCode(
          ErrorCode.BARCODE_PRODUCT_NOT_FOUND,
          'Không tìm thấy sản phẩm',
        ),
      );
    }
  }

  /** Decision BQ6 — pre-check nghiệp vụ TRƯỚC khi ghi, giữ nguyên P2002 làm lớp bảo vệ cuối. */
  private async assertCodeNotDuplicate(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const exists = await this.barcodeRepository.existsByCode(
      organizationId,
      code,
      excludeId,
    );
    if (exists) {
      throw new ConflictException(
        withCode(
          ErrorCode.BARCODE_DUPLICATE,
          'Mã vạch này đã tồn tại trong hệ thống',
        ),
      );
    }
  }

  /** Decision BQ11 — Unit (nếu có) phải cùng Organization và chưa bị Archive. */
  private async assertUnitUsable(
    unitId: string | undefined,
    organizationId: string,
  ): Promise<void> {
    if (!unitId) return;
    const unit = await this.unitDomainService.findByIdForReference(
      organizationId,
      unitId,
    );
    if (!unit || unit.status === 'ARCHIVED') {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.BARCODE_UNIT_NOT_USABLE,
          'Đơn vị tính không tồn tại, khác tổ chức, hoặc đã bị lưu trữ',
        ),
      );
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(ErrorCode.BARCODE_NOT_FOUND, 'Không tìm thấy mã vạch'),
    );
  }

  private toAuditSnapshot(barcode: BarcodeEntity): Record<string, unknown> {
    return {
      productId: barcode.productId,
      code: barcode.code,
      type: barcode.type,
      isDefault: barcode.isDefault,
      status: barcode.status,
    };
  }

  /**
   * Điểm mở rộng Domain Event (SPEC-BARCODE-001 §11) — cố ý để trống, KHÔNG publish (đúng mẫu
   * `UnitService`/`BrandService`). Chỉ định nghĩa tên + thời điểm gọi, chờ Sprint Event triển
   * khai Outbox thật (ADR-0009/ADR-0011).
   */
  private onBarcodeCreated(barcode: BarcodeEntity): void {
    void barcode;
  }

  private onBarcodeUpdated(barcode: BarcodeEntity): void {
    void barcode;
  }

  private onBarcodeArchived(barcodeId: string): void {
    void barcodeId;
  }

  private onBarcodeRestored(barcode: BarcodeEntity): void {
    void barcode;
  }
}
