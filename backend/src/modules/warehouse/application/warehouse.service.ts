import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { BranchService } from '../../branch/application/branch.service';
import { USER_REPOSITORY } from '../../user/domain/repositories/user.repository.interface';
import type { IUserRepository } from '../../user/domain/repositories/user.repository.interface';
import { WarehouseEntity } from '../domain/entities/warehouse.entity';
import { WAREHOUSE_REPOSITORY } from '../domain/repositories/warehouse.repository.interface';
import type {
  IWarehouseRepository,
  WarehouseSearchParams,
} from '../domain/repositories/warehouse.repository.interface';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import {
  PaginatedWarehouseResponseDto,
  WarehouseResponseDto,
} from './dto/warehouse-response.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseQueryDto } from './dto/warehouse-query.dto';
import { WarehouseMapper } from './mappers/warehouse.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class WarehouseService {
  constructor(
    @Inject(WAREHOUSE_REPOSITORY)
    private readonly warehouseRepository: IWarehouseRepository,
    private readonly auditLogService: AuditLogService,
    private readonly branchService: BranchService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async create(
    dto: CreateWarehouseDto,
    actor: ActorContext,
  ): Promise<WarehouseResponseDto> {
    // T053.05A — branchId/managerId là foreign id tenant-owned (Branch/User) — FK Prisma chỉ đảm
    // bảo hàng tồn tại, KHÔNG đảm bảo đúng tổ chức. Bắt buộc xác minh qua đúng port công khai đã
    // duyệt (BranchService.getById / USER_REPOSITORY.findById) TRƯỚC khi ghi Warehouse, cùng
    // pattern UserService.create đã dùng cho branchId (T051.06A).
    await this.branchService.getById(dto.branchId, {
      userId: actor.userId,
      organizationId: actor.organizationId,
    });
    if (dto.managerId) {
      await this.assertManagerInOrganization(
        dto.managerId,
        actor.organizationId,
      );
    }

    const created = await this.warehouseRepository.create({
      organizationId: actor.organizationId,
      ...dto,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'warehouse.create',
      entityType: 'Warehouse',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return WarehouseMapper.toResponseDto(created);
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<WarehouseResponseDto> {
    const warehouse = await this.warehouseRepository.findById(
      id,
      organizationId,
    );
    if (!warehouse) throw this.notFound();
    return WarehouseMapper.toResponseDto(warehouse);
  }

  async search(
    query: WarehouseQueryDto,
    organizationId: string,
  ): Promise<PaginatedWarehouseResponseDto> {
    const params: WarehouseSearchParams = {
      organizationId,
      search: query.search,
      branchId: query.branchId,
      type: query.type,
      status: query.status,
      archived: query.archived,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'desc',
    };

    const result = await this.warehouseRepository.search(params);
    return {
      items: result.items.map((item) => WarehouseMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async update(
    id: string,
    dto: UpdateWarehouseDto,
    actor: ActorContext,
  ): Promise<WarehouseResponseDto> {
    const existing = await this.warehouseRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    // T053.05A — branchId: chỉ xác minh khi CÓ mặt trong request (undefined = không đổi).
    // managerId: tri-state — undefined = giữ nguyên, null = xoá (KHÔNG cần tra User), string = xác
    // minh thuộc actor.organizationId trước khi ghi. KHÔNG được gộp undefined/null làm một.
    if (dto.branchId !== undefined) {
      await this.branchService.getById(dto.branchId, {
        userId: actor.userId,
        organizationId: actor.organizationId,
      });
    }
    if (dto.managerId !== undefined && dto.managerId !== null) {
      await this.assertManagerInOrganization(
        dto.managerId,
        actor.organizationId,
      );
    }

    const updated = await this.warehouseRepository.update(id, {
      ...dto,
      updatedBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'warehouse.update',
      entityType: 'Warehouse',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return WarehouseMapper.toResponseDto(updated);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await this.warehouseRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    const hasStockOrTransactions =
      await this.warehouseRepository.hasStockOrTransactions(id);
    if (hasStockOrTransactions) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.WAREHOUSE_HAS_STOCK_OR_TRANSACTIONS,
          'Không thể xóa kho đang còn tồn kho hoặc có giao dịch',
        ),
      );
    }

    await this.warehouseRepository.softDelete(id, actor.userId);

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'warehouse.delete',
      entityType: 'Warehouse',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }

  async restore(
    id: string,
    actor: ActorContext,
  ): Promise<WarehouseResponseDto> {
    const existing = await this.warehouseRepository.findByIdIncludingDeleted(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();
    if (!existing.deletedAt) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.WAREHOUSE_NOT_DELETED,
          'Kho chưa bị xóa, không thể khôi phục',
        ),
      );
    }

    await this.warehouseRepository.restore(id, actor.userId);
    const restored = await this.warehouseRepository.findById(
      id,
      actor.organizationId,
    );
    if (!restored) throw this.notFound();

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'warehouse.restore',
      entityType: 'Warehouse',
      entityId: id,
      newValue: this.toAuditSnapshot(restored),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return WarehouseMapper.toResponseDto(restored);
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(ErrorCode.WAREHOUSE_NOT_FOUND, 'Không tìm thấy kho'),
    );
  }

  /** T053.05A — `IUserRepository.findById` đã non-disclosing sẵn (cross-tenant hoặc không tồn tại
   * đều trả `null` như nhau — xem doc-comment interface), nên cross-tenant managerId và managerId
   * không tồn tại luôn ra CÙNG 1 USER_001, không có tín hiệu phân biệt nào rò rỉ ra ngoài. */
  private async assertManagerInOrganization(
    managerId: string,
    organizationId: string,
  ): Promise<void> {
    const manager = await this.userRepository.findById(
      managerId,
      organizationId,
    );
    if (!manager) {
      throw new NotFoundException(
        withCode(ErrorCode.USER_NOT_FOUND, 'Không tìm thấy người dùng'),
      );
    }
  }

  private toAuditSnapshot(warehouse: WarehouseEntity): Record<string, unknown> {
    return {
      branchId: warehouse.branchId,
      code: warehouse.code,
      name: warehouse.name,
      type: warehouse.type,
      status: warehouse.status,
    };
  }
}
