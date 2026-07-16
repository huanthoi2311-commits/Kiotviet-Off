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
import {
  TransferEntity,
  TransferStatus,
} from '../domain/entities/transfer.entity';
import {
  TRANSFER_REPOSITORY,
  TransferNegativeStockError,
  TransferStatusConflictError,
} from '../domain/repositories/transfer.repository.interface';
import type {
  ITransferRepository,
  TransferMovementInput,
} from '../domain/repositories/transfer.repository.interface';
import { TRANSFER_CODE_GENERATOR } from '../domain/services/transfer-code-generator.interface';
import type { ITransferCodeGenerator } from '../domain/services/transfer-code-generator.interface';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferQueryDto } from './dto/transfer-query.dto';
import {
  PaginatedTransferResponseDto,
  TransferResponseDto,
} from './dto/transfer-response.dto';
import { TransferMapper } from './mappers/transfer.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

const CANCELLABLE_STATUSES: TransferStatus[] = ['DRAFT', 'PENDING', 'APPROVED'];

@Injectable()
export class TransferService {
  constructor(
    @Inject(TRANSFER_REPOSITORY)
    private readonly transferRepository: ITransferRepository,
    @Inject(TRANSFER_CODE_GENERATOR)
    private readonly codeGenerator: ITransferCodeGenerator,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    dto: CreateTransferDto,
    actor: ActorContext,
  ): Promise<TransferResponseDto> {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.TRANSFER_SAME_WAREHOUSE,
          'Kho nguồn và kho đích không được trùng nhau',
        ),
      );
    }
    if (dto.items.length === 0) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.TRANSFER_EMPTY_ITEMS,
          'Phiếu điều chuyển phải có ít nhất 1 sản phẩm',
        ),
      );
    }

    const code = await this.codeGenerator.generate(actor.organizationId);
    const created = await this.transferRepository.create({
      organizationId: actor.organizationId,
      fromWarehouseId: dto.fromWarehouseId,
      toWarehouseId: dto.toWarehouseId,
      code,
      note: dto.note ?? null,
      items: dto.items,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'transfer.create',
      entityType: 'Transfer',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return TransferMapper.toResponseDto(created);
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<TransferResponseDto> {
    const transfer = await this.transferRepository.findById(id, organizationId);
    if (!transfer) throw this.notFound();
    return TransferMapper.toResponseDto(transfer);
  }

  async search(
    query: TransferQueryDto,
    organizationId: string,
  ): Promise<PaginatedTransferResponseDto> {
    const result = await this.transferRepository.search({
      organizationId,
      search: query.search,
      status: query.status,
      fromWarehouseId: query.fromWarehouseId,
      toWarehouseId: query.toWarehouseId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });

    return {
      items: result.items.map((item) => TransferMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /** Duyệt phiếu → trừ Kho nguồn ngay (KHÔNG cộng Kho đích — chỉ Receive mới cộng). */
  async approve(id: string, actor: ActorContext): Promise<TransferResponseDto> {
    const transfer = await this.transferRepository.findById(
      id,
      actor.organizationId,
    );
    if (!transfer) throw this.notFound();

    const movements: TransferMovementInput[] = transfer.items.map((item) => ({
      transferItemId: item.id,
      warehouseId: transfer.fromWarehouseId,
      productId: item.productId,
      quantity: Number(item.quantity),
      direction: 'OUT',
      captureUnitCostToItem: true,
    }));

    const updated = await this.transitionOrConflict(
      id,
      ['PENDING'],
      'APPROVED',
      movements,
      actor.userId,
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'transfer.approve',
      entityType: 'Transfer',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return TransferMapper.toResponseDto(updated);
  }

  /** Nhận hàng → cộng Kho đích, dùng đúng Average Cost của Kho nguồn đã ghi lại lúc Approve. */
  async receive(id: string, actor: ActorContext): Promise<TransferResponseDto> {
    const transfer = await this.transferRepository.findById(
      id,
      actor.organizationId,
    );
    if (!transfer) throw this.notFound();

    const movements: TransferMovementInput[] = transfer.items.map((item) => ({
      transferItemId: item.id,
      warehouseId: transfer.toWarehouseId,
      productId: item.productId,
      quantity: Number(item.quantity),
      unitCost: item.unitCost != null ? Number(item.unitCost) : null,
      direction: 'IN',
    }));

    const updated = await this.transitionOrConflict(
      id,
      ['APPROVED'],
      'RECEIVED',
      movements,
      actor.userId,
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'transfer.receive',
      entityType: 'Transfer',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return TransferMapper.toResponseDto(updated);
  }

  /**
   * Hủy phiếu. Nếu đã Approve (đã trừ Kho nguồn), hoàn lại đúng số lượng + giá vốn đã
   * ghi nhận cho Kho nguồn. DRAFT/PENDING chưa trừ gì nên hủy không sinh Movement nào.
   */
  async cancel(id: string, actor: ActorContext): Promise<TransferResponseDto> {
    const transfer = await this.transferRepository.findById(
      id,
      actor.organizationId,
    );
    if (!transfer) throw this.notFound();

    if (!CANCELLABLE_STATUSES.includes(transfer.status)) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.TRANSFER_INVALID_STATUS_TRANSITION,
          `Không thể hủy phiếu đang ở trạng thái ${transfer.status}`,
        ),
      );
    }

    const movements: TransferMovementInput[] =
      transfer.status === 'APPROVED'
        ? transfer.items.map((item) => ({
            transferItemId: item.id,
            warehouseId: transfer.fromWarehouseId,
            productId: item.productId,
            quantity: Number(item.quantity),
            unitCost: item.unitCost != null ? Number(item.unitCost) : null,
            direction: 'IN',
          }))
        : [];

    const updated = await this.transitionOrConflict(
      id,
      [transfer.status],
      'CANCELLED',
      movements,
      actor.userId,
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'transfer.cancel',
      entityType: 'Transfer',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return TransferMapper.toResponseDto(updated);
  }

  private async transitionOrConflict(
    id: string,
    expectedStatuses: TransferStatus[],
    nextStatus: TransferStatus,
    movements: TransferMovementInput[],
    updatedBy: string,
  ): Promise<TransferEntity> {
    try {
      return await this.transferRepository.transitionStatus(
        id,
        expectedStatuses,
        nextStatus,
        movements,
        updatedBy,
      );
    } catch (error) {
      if (error instanceof TransferStatusConflictError) {
        throw new UnprocessableEntityException(
          withCode(ErrorCode.TRANSFER_INVALID_STATUS_TRANSITION, error.message),
        );
      }
      if (error instanceof TransferNegativeStockError) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.TRANSFER_NEGATIVE_STOCK_NOT_ALLOWED,
            error.message,
          ),
        );
      }
      if (error instanceof InventoryConcurrencyConflictError) {
        throw new ConflictException(
          withCode(ErrorCode.TRANSFER_INVENTORY_CONFLICT, error.message),
        );
      }
      throw error;
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(
        ErrorCode.TRANSFER_NOT_FOUND,
        'Không tìm thấy phiếu điều chuyển',
      ),
    );
  }

  private toAuditSnapshot(transfer: TransferEntity): Record<string, unknown> {
    return {
      code: transfer.code,
      status: transfer.status,
      fromWarehouseId: transfer.fromWarehouseId,
      toWarehouseId: transfer.toWarehouseId,
    };
  }
}
