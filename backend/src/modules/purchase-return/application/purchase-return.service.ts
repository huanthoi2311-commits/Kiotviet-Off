import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { PURCHASE_ORDER_REPOSITORY } from '../../purchase-order/domain/repositories/purchase-order.repository.interface';
import type { IPurchaseOrderRepository } from '../../purchase-order/domain/repositories/purchase-order.repository.interface';
import { PurchaseReturnEntity } from '../domain/entities/purchase-return.entity';
import {
  CreatePurchaseReturnItemInput,
  PURCHASE_RETURN_REPOSITORY,
  PurchaseReturnExceedsReceivedError,
  PurchaseReturnNegativeStockError,
  PurchaseReturnStatusConflictError,
} from '../domain/repositories/purchase-return.repository.interface';
import type { IPurchaseReturnRepository } from '../domain/repositories/purchase-return.repository.interface';
import { PURCHASE_RETURN_CODE_GENERATOR } from '../domain/services/purchase-return-code-generator.interface';
import type { IPurchaseReturnCodeGenerator } from '../domain/services/purchase-return-code-generator.interface';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import { PurchaseReturnQueryDto } from './dto/purchase-return-query.dto';
import {
  PaginatedPurchaseReturnResponseDto,
  PurchaseReturnResponseDto,
} from './dto/purchase-return-response.dto';
import { PurchaseReturnMapper } from './mappers/purchase-return.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

const RETURNABLE_ORDER_STATUSES = ['RECEIVED', 'COMPLETED'];

@Injectable()
export class PurchaseReturnService {
  constructor(
    @Inject(PURCHASE_RETURN_REPOSITORY)
    private readonly purchaseReturnRepository: IPurchaseReturnRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly purchaseOrderRepository: IPurchaseOrderRepository,
    @Inject(PURCHASE_RETURN_CODE_GENERATOR)
    private readonly codeGenerator: IPurchaseReturnCodeGenerator,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Chỉ được trả hàng từ Purchase Order đã RECEIVED — không thể trả hàng chưa từng nhận. */
  async create(
    dto: CreatePurchaseReturnDto,
    actor: ActorContext,
  ): Promise<PurchaseReturnResponseDto> {
    const purchaseOrder = await this.purchaseOrderRepository.findById(
      dto.purchaseOrderId,
      actor.organizationId,
    );
    if (!purchaseOrder) {
      throw new NotFoundException(
        withCode(
          ErrorCode.PURCHASE_ORDER_NOT_FOUND,
          'Không tìm thấy đơn nhập hàng',
        ),
      );
    }
    if (!RETURNABLE_ORDER_STATUSES.includes(purchaseOrder.status)) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.PURCHASE_RETURN_ORDER_NOT_RECEIVED,
          'Chỉ có thể trả hàng của đơn nhập đã nhận hàng (RECEIVED)',
        ),
      );
    }

    const items: CreatePurchaseReturnItemInput[] = dto.items.map(
      (returnItem) => {
        const purchaseItem = purchaseOrder.items.find(
          (item) => item.id === returnItem.purchaseItemId,
        );
        if (!purchaseItem) {
          throw new UnprocessableEntityException(
            withCode(
              ErrorCode.PURCHASE_RETURN_ITEM_NOT_IN_ORDER,
              `Dòng hàng ${returnItem.purchaseItemId} không thuộc đơn nhập này`,
            ),
          );
        }
        const unitCost = Number(purchaseItem.unitCost);
        return {
          purchaseItemId: purchaseItem.id,
          productId: purchaseItem.productId,
          warehouseId: purchaseItem.warehouseId,
          quantity: returnItem.quantity,
          unitCost,
          totalAmount: returnItem.quantity * unitCost,
        };
      },
    );
    const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);

    const code = await this.codeGenerator.generate(actor.organizationId);
    let created: PurchaseReturnEntity;
    try {
      created = await this.purchaseReturnRepository.create({
        organizationId: actor.organizationId,
        purchaseOrderId: dto.purchaseOrderId,
        supplierId: purchaseOrder.supplierId,
        code,
        reason: dto.reason,
        note: dto.note ?? null,
        totalAmount,
        items,
        createdBy: actor.userId,
      });
    } catch (error) {
      if (error instanceof PurchaseReturnExceedsReceivedError) {
        throw new UnprocessableEntityException(
          withCode(ErrorCode.PURCHASE_RETURN_EXCEEDS_RECEIVED, error.message),
        );
      }
      throw error;
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'purchase_return.create',
      entityType: 'PurchaseReturn',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return PurchaseReturnMapper.toResponseDto(created);
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<PurchaseReturnResponseDto> {
    const purchaseReturn = await this.purchaseReturnRepository.findById(
      id,
      organizationId,
    );
    if (!purchaseReturn) throw this.notFound();
    return PurchaseReturnMapper.toResponseDto(purchaseReturn);
  }

  async search(
    query: PurchaseReturnQueryDto,
    organizationId: string,
  ): Promise<PaginatedPurchaseReturnResponseDto> {
    const result = await this.purchaseReturnRepository.search({
      organizationId,
      search: query.search,
      status: query.status,
      purchaseOrderId: query.purchaseOrderId,
      supplierId: query.supplierId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });

    return {
      items: result.items.map((item) =>
        PurchaseReturnMapper.toResponseDto(item),
      ),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /** DRAFT → APPROVED — cổng phê duyệt thuần túy, không đụng tồn kho/công nợ. */
  async approve(
    id: string,
    actor: ActorContext,
  ): Promise<PurchaseReturnResponseDto> {
    const purchaseReturn = await this.purchaseReturnRepository.findById(
      id,
      actor.organizationId,
    );
    if (!purchaseReturn) throw this.notFound();

    const updated = await this.transitionOrConflict(() =>
      this.purchaseReturnRepository.approve(
        id,
        actor.organizationId,
        actor.userId,
      ),
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'purchase_return.approve',
      entityType: 'PurchaseReturn',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return PurchaseReturnMapper.toResponseDto(updated);
  }

  /** APPROVED → COMPLETED — Inventory Out (InventoryMovement RETURN) + Debt Reduce (Debt PAYABLE âm), 1 transaction. */
  async complete(
    id: string,
    actor: ActorContext,
  ): Promise<PurchaseReturnResponseDto> {
    const purchaseReturn = await this.purchaseReturnRepository.findById(
      id,
      actor.organizationId,
    );
    if (!purchaseReturn) throw this.notFound();

    const updated = await this.transitionOrConflict(() =>
      this.purchaseReturnRepository.complete(
        id,
        actor.organizationId,
        actor.userId,
      ),
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'purchase_return.complete',
      entityType: 'PurchaseReturn',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return PurchaseReturnMapper.toResponseDto(updated);
  }

  /** [DRAFT, APPROVED] → CANCELLED. Không thể hủy sau khi đã Complete. */
  async cancel(
    id: string,
    actor: ActorContext,
  ): Promise<PurchaseReturnResponseDto> {
    const purchaseReturn = await this.purchaseReturnRepository.findById(
      id,
      actor.organizationId,
    );
    if (!purchaseReturn) throw this.notFound();

    const updated = await this.transitionOrConflict(() =>
      this.purchaseReturnRepository.cancel(
        id,
        actor.organizationId,
        actor.userId,
      ),
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'purchase_return.cancel',
      entityType: 'PurchaseReturn',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return PurchaseReturnMapper.toResponseDto(updated);
  }

  private async transitionOrConflict(
    fn: () => Promise<PurchaseReturnEntity>,
  ): Promise<PurchaseReturnEntity> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof PurchaseReturnStatusConflictError) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.PURCHASE_RETURN_INVALID_STATUS_TRANSITION,
            error.message,
          ),
        );
      }
      if (error instanceof PurchaseReturnNegativeStockError) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.PURCHASE_RETURN_NEGATIVE_STOCK_NOT_ALLOWED,
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
        ErrorCode.PURCHASE_RETURN_NOT_FOUND,
        'Không tìm thấy phiếu trả hàng',
      ),
    );
  }

  private toAuditSnapshot(
    purchaseReturn: PurchaseReturnEntity,
  ): Record<string, unknown> {
    return {
      code: purchaseReturn.code,
      status: purchaseReturn.status,
      reason: purchaseReturn.reason,
      purchaseOrderId: purchaseReturn.purchaseOrderId,
      supplierId: purchaseReturn.supplierId,
      totalAmount: purchaseReturn.totalAmount,
      itemCount: purchaseReturn.items.length,
    };
  }
}
