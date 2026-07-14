import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { StockCountEntity } from '../domain/entities/stock-count.entity';
import {
  STOCK_COUNT_REPOSITORY,
  StockCountItemMismatchError,
  StockCountStatusConflictError,
} from '../domain/repositories/stock-count.repository.interface';
import type { IStockCountRepository } from '../domain/repositories/stock-count.repository.interface';
import { STOCK_COUNT_CODE_GENERATOR } from '../domain/services/stock-count-code-generator.interface';
import type { IStockCountCodeGenerator } from '../domain/services/stock-count-code-generator.interface';
import { CompleteStockCountDto } from './dto/complete-stock-count.dto';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import {
  PaginatedStockCountResponseDto,
  StockCountResponseDto,
} from './dto/stock-count-response.dto';
import { StockCountQueryDto } from './dto/stock-count-query.dto';
import { StockCountMapper } from './mappers/stock-count.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class StockCountService {
  constructor(
    @Inject(STOCK_COUNT_REPOSITORY)
    private readonly stockCountRepository: IStockCountRepository,
    @Inject(STOCK_COUNT_CODE_GENERATOR)
    private readonly codeGenerator: IStockCountCodeGenerator,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    dto: CreateStockCountDto,
    actor: ActorContext,
  ): Promise<StockCountResponseDto> {
    const code = await this.codeGenerator.generate(actor.organizationId);
    const created = await this.stockCountRepository.create({
      organizationId: actor.organizationId,
      warehouseId: dto.warehouseId,
      code,
      note: dto.note ?? null,
      productIds: dto.productIds,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'stock_count.create',
      entityType: 'StockCount',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return StockCountMapper.toResponseDto(created);
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<StockCountResponseDto> {
    const stockCount = await this.stockCountRepository.findById(
      id,
      organizationId,
    );
    if (!stockCount) throw this.notFound();
    return StockCountMapper.toResponseDto(stockCount);
  }

  async search(
    query: StockCountQueryDto,
    organizationId: string,
  ): Promise<PaginatedStockCountResponseDto> {
    const result = await this.stockCountRepository.search({
      organizationId,
      search: query.search,
      status: query.status,
      warehouseId: query.warehouseId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });

    return {
      items: result.items.map((item) => StockCountMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /** DRAFT → COUNTING, không thay đổi dữ liệu tồn kho. */
  async start(id: string, actor: ActorContext): Promise<StockCountResponseDto> {
    const stockCount = await this.stockCountRepository.findById(
      id,
      actor.organizationId,
    );
    if (!stockCount) throw this.notFound();

    const updated = await this.transitionOrConflict(() =>
      this.stockCountRepository.start(id, actor.organizationId, actor.userId),
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'stock_count.start',
      entityType: 'StockCount',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return StockCountMapper.toResponseDto(updated);
  }

  /**
   * COUNTING → COMPLETED. Với mỗi item được submit, ghi actualQty/difference; nếu
   * difference ≠ 0, sinh InventoryMovement (COUNT) + đồng bộ Inventory trong cùng
   * transaction với việc đổi trạng thái phiếu.
   */
  async complete(
    id: string,
    dto: CompleteStockCountDto,
    actor: ActorContext,
  ): Promise<StockCountResponseDto> {
    const stockCount = await this.stockCountRepository.findById(
      id,
      actor.organizationId,
    );
    if (!stockCount) throw this.notFound();

    const updated = await this.transitionOrConflict(() =>
      this.stockCountRepository.complete(
        id,
        actor.organizationId,
        dto.items,
        actor.userId,
      ),
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'stock_count.complete',
      entityType: 'StockCount',
      entityId: id,
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return StockCountMapper.toResponseDto(updated);
  }

  private async transitionOrConflict(
    fn: () => Promise<StockCountEntity>,
  ): Promise<StockCountEntity> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof StockCountStatusConflictError) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.STOCK_COUNT_INVALID_STATUS_TRANSITION,
            error.message,
          ),
        );
      }
      if (error instanceof StockCountItemMismatchError) {
        throw new UnprocessableEntityException(
          withCode(ErrorCode.STOCK_COUNT_ITEM_MISMATCH, error.message),
        );
      }
      throw error;
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(ErrorCode.STOCK_COUNT_NOT_FOUND, 'Không tìm thấy phiếu kiểm kê'),
    );
  }

  private toAuditSnapshot(
    stockCount: StockCountEntity,
  ): Record<string, unknown> {
    return {
      code: stockCount.code,
      status: stockCount.status,
      warehouseId: stockCount.warehouseId,
      itemCount: stockCount.items.length,
    };
  }
}
