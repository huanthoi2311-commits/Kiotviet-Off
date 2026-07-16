import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { InventoryConcurrencyConflictError } from '../../inventory/domain/errors/inventory.errors';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { InventoryAdjustmentEntity } from '../domain/entities/inventory-adjustment.entity';
import {
  INVENTORY_ADJUSTMENT_REPOSITORY,
  InventoryAdjustmentNegativeStockError,
  InventoryAdjustmentStatusConflictError,
} from '../domain/repositories/inventory-adjustment.repository.interface';
import type { IInventoryAdjustmentRepository } from '../domain/repositories/inventory-adjustment.repository.interface';
import { INVENTORY_ADJUSTMENT_CODE_GENERATOR } from '../domain/services/inventory-adjustment-code-generator.interface';
import type { IInventoryAdjustmentCodeGenerator } from '../domain/services/inventory-adjustment-code-generator.interface';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import {
  InventoryAdjustmentResponseDto,
  PaginatedInventoryAdjustmentResponseDto,
} from './dto/inventory-adjustment-response.dto';
import { InventoryAdjustmentQueryDto } from './dto/inventory-adjustment-query.dto';
import { InventoryAdjustmentMapper } from './mappers/inventory-adjustment.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class InventoryAdjustmentService {
  constructor(
    @Inject(INVENTORY_ADJUSTMENT_REPOSITORY)
    private readonly adjustmentRepository: IInventoryAdjustmentRepository,
    @Inject(INVENTORY_ADJUSTMENT_CODE_GENERATOR)
    private readonly codeGenerator: IInventoryAdjustmentCodeGenerator,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    dto: CreateInventoryAdjustmentDto,
    actor: ActorContext,
  ): Promise<InventoryAdjustmentResponseDto> {
    const code = await this.codeGenerator.generate(actor.organizationId);
    const created = await this.adjustmentRepository.create({
      organizationId: actor.organizationId,
      warehouseId: dto.warehouseId,
      code,
      reason: dto.reason,
      note: dto.note ?? null,
      items: dto.items,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'inventory_adjustment.create',
      entityType: 'InventoryAdjustment',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return InventoryAdjustmentMapper.toResponseDto(created);
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<InventoryAdjustmentResponseDto> {
    const adjustment = await this.adjustmentRepository.findById(
      id,
      organizationId,
    );
    if (!adjustment) throw this.notFound();
    return InventoryAdjustmentMapper.toResponseDto(adjustment);
  }

  async search(
    query: InventoryAdjustmentQueryDto,
    organizationId: string,
  ): Promise<PaginatedInventoryAdjustmentResponseDto> {
    const result = await this.adjustmentRepository.search({
      organizationId,
      search: query.search,
      status: query.status,
      reason: query.reason,
      warehouseId: query.warehouseId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });

    return {
      items: result.items.map((item) =>
        InventoryAdjustmentMapper.toResponseDto(item),
      ),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /** DRAFT → SUBMITTED, không thay đổi dữ liệu tồn kho. */
  async submit(
    id: string,
    actor: ActorContext,
  ): Promise<InventoryAdjustmentResponseDto> {
    const adjustment = await this.adjustmentRepository.findById(
      id,
      actor.organizationId,
    );
    if (!adjustment) throw this.notFound();

    const updated = await this.transitionOrConflict(() =>
      this.adjustmentRepository.submit(id, actor.organizationId, actor.userId),
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'inventory_adjustment.submit',
      entityType: 'InventoryAdjustment',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return InventoryAdjustmentMapper.toResponseDto(updated);
  }

  /** SUBMITTED → APPROVED — cổng phê duyệt thuần túy, không thay đổi dữ liệu tồn kho. */
  async approve(
    id: string,
    actor: ActorContext,
  ): Promise<InventoryAdjustmentResponseDto> {
    const adjustment = await this.adjustmentRepository.findById(
      id,
      actor.organizationId,
    );
    if (!adjustment) throw this.notFound();

    const updated = await this.transitionOrConflict(() =>
      this.adjustmentRepository.approve(id, actor.organizationId, actor.userId),
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'inventory_adjustment.approve',
      entityType: 'InventoryAdjustment',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return InventoryAdjustmentMapper.toResponseDto(updated);
  }

  /** APPROVED → COMPLETED — sinh InventoryMovement (ADJUSTMENT) cho từng item, đồng bộ Inventory. */
  async complete(
    id: string,
    actor: ActorContext,
  ): Promise<InventoryAdjustmentResponseDto> {
    const adjustment = await this.adjustmentRepository.findById(
      id,
      actor.organizationId,
    );
    if (!adjustment) throw this.notFound();

    const updated = await this.transitionOrConflict(() =>
      this.adjustmentRepository.complete(
        id,
        actor.organizationId,
        actor.userId,
      ),
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'inventory_adjustment.complete',
      entityType: 'InventoryAdjustment',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return InventoryAdjustmentMapper.toResponseDto(updated);
  }

  private async transitionOrConflict(
    fn: () => Promise<InventoryAdjustmentEntity>,
  ): Promise<InventoryAdjustmentEntity> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof InventoryAdjustmentStatusConflictError) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.INVENTORY_ADJUSTMENT_INVALID_STATUS_TRANSITION,
            error.message,
          ),
        );
      }
      if (error instanceof InventoryAdjustmentNegativeStockError) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.INVENTORY_ADJUSTMENT_NEGATIVE_STOCK_NOT_ALLOWED,
            error.message,
          ),
        );
      }
      if (error instanceof InventoryConcurrencyConflictError) {
        throw new ConflictException(
          withCode(
            ErrorCode.INVENTORY_ADJUSTMENT_INVENTORY_CONFLICT,
            error.message,
          ),
        );
      }
      throw error;
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(
        ErrorCode.INVENTORY_ADJUSTMENT_NOT_FOUND,
        'Không tìm thấy phiếu điều chỉnh tồn kho',
      ),
    );
  }

  private toAuditSnapshot(
    adjustment: InventoryAdjustmentEntity,
  ): Record<string, unknown> {
    return {
      code: adjustment.code,
      status: adjustment.status,
      reason: adjustment.reason,
      warehouseId: adjustment.warehouseId,
      itemCount: adjustment.items.length,
    };
  }
}
