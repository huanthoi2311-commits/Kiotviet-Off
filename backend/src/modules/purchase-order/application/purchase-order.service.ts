import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { PurchaseOrderEntity } from '../domain/entities/purchase-order.entity';
import {
  CreatePurchaseItemInput,
  PURCHASE_ORDER_REPOSITORY,
  PurchaseOrderStatusConflictError,
} from '../domain/repositories/purchase-order.repository.interface';
import type { IPurchaseOrderRepository } from '../domain/repositories/purchase-order.repository.interface';
import { PURCHASE_ORDER_CODE_GENERATOR } from '../domain/services/purchase-order-code-generator.interface';
import type { IPurchaseOrderCodeGenerator } from '../domain/services/purchase-order-code-generator.interface';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import {
  PaginatedPurchaseOrderResponseDto,
  PurchaseOrderResponseDto,
} from './dto/purchase-order-response.dto';
import { PurchaseOrderMapper } from './mappers/purchase-order.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class PurchaseOrderService {
  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly purchaseOrderRepository: IPurchaseOrderRepository,
    @Inject(PURCHASE_ORDER_CODE_GENERATOR)
    private readonly codeGenerator: IPurchaseOrderCodeGenerator,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    dto: CreatePurchaseOrderDto,
    actor: ActorContext,
  ): Promise<PurchaseOrderResponseDto> {
    const items: CreatePurchaseItemInput[] = dto.items.map((item) => {
      const discount = item.discount ?? 0;
      const taxAmount = item.taxAmount ?? 0;
      const totalAmount = item.quantity * item.unitCost - discount + taxAmount;
      return {
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        discount,
        taxAmount,
        totalAmount,
      };
    });
    const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);

    const code = await this.codeGenerator.generate(actor.organizationId);
    const created = await this.purchaseOrderRepository.create({
      organizationId: actor.organizationId,
      branchId: dto.branchId,
      supplierId: dto.supplierId,
      code,
      expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
      totalAmount,
      items,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'purchase_order.create',
      entityType: 'PurchaseOrder',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return PurchaseOrderMapper.toResponseDto(created);
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<PurchaseOrderResponseDto> {
    const order = await this.purchaseOrderRepository.findById(
      id,
      organizationId,
    );
    if (!order) throw this.notFound();
    return PurchaseOrderMapper.toResponseDto(order);
  }

  async search(
    query: PurchaseOrderQueryDto,
    organizationId: string,
  ): Promise<PaginatedPurchaseOrderResponseDto> {
    const result = await this.purchaseOrderRepository.search({
      organizationId,
      search: query.search,
      status: query.status,
      supplierId: query.supplierId,
      branchId: query.branchId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });

    return {
      items: result.items.map((item) =>
        PurchaseOrderMapper.toResponseDto(item),
      ),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /** DRAFT → APPROVED — cổng phê duyệt thuần túy, không đụng tồn kho. */
  async approve(
    id: string,
    actor: ActorContext,
  ): Promise<PurchaseOrderResponseDto> {
    const order = await this.purchaseOrderRepository.findById(
      id,
      actor.organizationId,
    );
    if (!order) throw this.notFound();

    const updated = await this.transitionOrConflict(() =>
      this.purchaseOrderRepository.approve(
        id,
        actor.organizationId,
        actor.userId,
      ),
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'purchase_order.approve',
      entityType: 'PurchaseOrder',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return PurchaseOrderMapper.toResponseDto(updated);
  }

  /** APPROVED → RECEIVED — sinh InventoryMovement (PURCHASE) cho từng dòng hàng, đồng bộ Inventory + Average Cost. */
  async receive(
    id: string,
    actor: ActorContext,
  ): Promise<PurchaseOrderResponseDto> {
    const order = await this.purchaseOrderRepository.findById(
      id,
      actor.organizationId,
    );
    if (!order) throw this.notFound();

    const updated = await this.transitionOrConflict(() =>
      this.purchaseOrderRepository.receive(
        id,
        actor.organizationId,
        actor.userId,
      ),
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'purchase_order.receive',
      entityType: 'PurchaseOrder',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return PurchaseOrderMapper.toResponseDto(updated);
  }

  /** [DRAFT, PENDING, APPROVED] → CANCELLED. Không thể hủy sau khi đã Receive. */
  async cancel(
    id: string,
    actor: ActorContext,
  ): Promise<PurchaseOrderResponseDto> {
    const order = await this.purchaseOrderRepository.findById(
      id,
      actor.organizationId,
    );
    if (!order) throw this.notFound();

    const updated = await this.transitionOrConflict(() =>
      this.purchaseOrderRepository.cancel(
        id,
        actor.organizationId,
        actor.userId,
      ),
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'purchase_order.cancel',
      entityType: 'PurchaseOrder',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return PurchaseOrderMapper.toResponseDto(updated);
  }

  private async transitionOrConflict(
    fn: () => Promise<PurchaseOrderEntity>,
  ): Promise<PurchaseOrderEntity> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof PurchaseOrderStatusConflictError) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.PURCHASE_ORDER_INVALID_STATUS_TRANSITION,
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
        ErrorCode.PURCHASE_ORDER_NOT_FOUND,
        'Không tìm thấy đơn nhập hàng',
      ),
    );
  }

  private toAuditSnapshot(order: PurchaseOrderEntity): Record<string, unknown> {
    return {
      code: order.code,
      status: order.status,
      supplierId: order.supplierId,
      totalAmount: order.totalAmount,
      itemCount: order.items.length,
    };
  }
}
