import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { SupplierEntity } from '../domain/entities/supplier.entity';
import { SUPPLIER_REPOSITORY } from '../domain/repositories/supplier.repository.interface';
import type {
  ISupplierRepository,
  SupplierSearchParams,
} from '../domain/repositories/supplier.repository.interface';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import {
  PaginatedSupplierResponseDto,
  SupplierResponseDto,
} from './dto/supplier-response.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierMapper } from './mappers/supplier.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class SupplierService {
  constructor(
    @Inject(SUPPLIER_REPOSITORY)
    private readonly supplierRepository: ISupplierRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    dto: CreateSupplierDto,
    actor: ActorContext,
  ): Promise<SupplierResponseDto> {
    const created = await this.supplierRepository.create({
      organizationId: actor.organizationId,
      ...dto,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'supplier.create',
      entityType: 'Supplier',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return SupplierMapper.toResponseDto(created);
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<SupplierResponseDto> {
    const supplier = await this.supplierRepository.findById(id, organizationId);
    if (!supplier) throw this.notFound();
    return SupplierMapper.toResponseDto(supplier);
  }

  async search(
    query: SupplierQueryDto,
    organizationId: string,
  ): Promise<PaginatedSupplierResponseDto> {
    const params = this.toSearchParams(query, organizationId);
    const result = await this.supplierRepository.search(params);

    return {
      items: result.items.map((item) => SupplierMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async update(
    id: string,
    dto: UpdateSupplierDto,
    actor: ActorContext,
  ): Promise<SupplierResponseDto> {
    const existing = await this.supplierRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    const updated = await this.supplierRepository.update(id, {
      ...dto,
      updatedBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'supplier.update',
      entityType: 'Supplier',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return SupplierMapper.toResponseDto(updated);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await this.supplierRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    const hasPurchaseOrders =
      await this.supplierRepository.hasPurchaseOrders(id);
    if (hasPurchaseOrders) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.SUPPLIER_HAS_PURCHASE_ORDERS,
          'Không thể xóa nhà cung cấp đã có đơn nhập hàng',
        ),
      );
    }

    await this.supplierRepository.softDelete(id, actor.userId);

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'supplier.delete',
      entityType: 'Supplier',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }

  async restore(id: string, actor: ActorContext): Promise<SupplierResponseDto> {
    const existing = await this.supplierRepository.findByIdIncludingDeleted(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();
    if (!existing.deletedAt) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.SUPPLIER_NOT_DELETED,
          'Nhà cung cấp chưa bị xóa, không thể khôi phục',
        ),
      );
    }

    await this.supplierRepository.restore(id, actor.userId);
    const restored = await this.supplierRepository.findById(
      id,
      actor.organizationId,
    );
    if (!restored) throw this.notFound();

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'supplier.restore',
      entityType: 'Supplier',
      entityId: id,
      newValue: this.toAuditSnapshot(restored),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return SupplierMapper.toResponseDto(restored);
  }

  toSearchParams(
    query: SupplierQueryDto,
    organizationId: string,
  ): SupplierSearchParams {
    return {
      organizationId,
      search: query.search,
      status: query.status,
      province: query.province,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'desc',
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(ErrorCode.SUPPLIER_NOT_FOUND, 'Không tìm thấy nhà cung cấp'),
    );
  }

  private toAuditSnapshot(supplier: SupplierEntity): Record<string, unknown> {
    return {
      code: supplier.code,
      companyName: supplier.companyName,
      taxCode: supplier.taxCode,
      status: supplier.status,
    };
  }
}
