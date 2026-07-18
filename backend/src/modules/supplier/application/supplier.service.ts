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
import {
  SupplierEntity,
  SupplierStatus,
} from '../domain/entities/supplier.entity';
import { SupplierConcurrencyConflictError } from '../domain/errors/supplier.errors';
import { SUPPLIER_REPOSITORY } from '../domain/repositories/supplier.repository.interface';
import type {
  ISupplierRepository,
  SupplierSearchParams,
} from '../domain/repositories/supplier.repository.interface';
import { SUPPLIER_CODE_GENERATOR } from '../domain/services/supplier-code-generator.interface';
import type { ISupplierCodeGenerator } from '../domain/services/supplier-code-generator.interface';
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
    @Inject(SUPPLIER_CODE_GENERATOR)
    private readonly codeGenerator: ISupplierCodeGenerator,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Decision SR07/SP05 — code optional: client cung cấp → validate+unique; không cung cấp → generator (atomic). */
  async create(
    dto: CreateSupplierDto,
    actor: ActorContext,
  ): Promise<SupplierResponseDto> {
    let code: string;
    if (dto.code) {
      code = dto.code.trim().toUpperCase();
      await this.assertCodeNotDuplicate(actor.organizationId, code);
    } else {
      code = await this.codeGenerator.generate(actor.organizationId);
    }

    const created = await this.supplierRepository.create({
      organizationId: actor.organizationId,
      code,
      taxCode: dto.taxCode ?? null,
      companyName: dto.companyName,
      contactName: dto.contactName ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      website: dto.website ?? null,
      address: dto.address ?? null,
      province: dto.province ?? null,
      district: dto.district ?? null,
      ward: dto.ward ?? null,
      bankName: dto.bankName ?? null,
      bankAccount: dto.bankAccount ?? null,
      paymentTerm: dto.paymentTerm ?? null,
      creditLimit: dto.creditLimit ?? null,
      note: dto.note ?? null,
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

    let updated: SupplierEntity;
    try {
      updated = await this.supplierRepository.update(
        id,
        actor.organizationId,
        dto.version,
        {
          taxCode: dto.taxCode,
          companyName: dto.companyName,
          contactName: dto.contactName,
          phone: dto.phone,
          email: dto.email,
          website: dto.website,
          address: dto.address,
          province: dto.province,
          district: dto.district,
          ward: dto.ward,
          bankName: dto.bankName,
          bankAccount: dto.bankAccount,
          paymentTerm: dto.paymentTerm,
          creditLimit: dto.creditLimit,
          note: dto.note,
          updatedBy: actor.userId,
        },
      );
    } catch (error) {
      throw this.translateConcurrencyError(error);
    }

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

  /** Archive Guard (BR08) — chuẩn hóa, KHÔNG viết lại (Decision SR02/SR03): `hasPurchaseOrders()`
   * giữ nguyên 100% logic nghiệp vụ hiện có, chỉ thêm version check bao quanh. */
  async remove(
    id: string,
    version: number,
    actor: ActorContext,
  ): Promise<void> {
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

    try {
      await this.supplierRepository.softDelete(
        id,
        actor.organizationId,
        version,
        actor.userId,
      );
    } catch (error) {
      throw this.translateConcurrencyError(error);
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'supplier.archive',
      entityType: 'Supplier',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }

  /** Luôn trả status về INACTIVE, không tự động ACTIVE (đúng thiết kế Customer T011). */
  async restore(
    id: string,
    version: number,
    actor: ActorContext,
  ): Promise<SupplierResponseDto> {
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

    try {
      await this.supplierRepository.restore(
        id,
        actor.organizationId,
        version,
        actor.userId,
      );
    } catch (error) {
      throw this.translateConcurrencyError(error);
    }

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

  /** INACTIVE → ACTIVE (transition duy nhất hợp lệ cho activate). */
  async activate(
    id: string,
    version: number,
    actor: ActorContext,
  ): Promise<SupplierResponseDto> {
    return this.changeStatus(
      id,
      version,
      'INACTIVE',
      'ACTIVE',
      actor,
      'supplier.activate',
    );
  }

  /** ACTIVE → INACTIVE (transition duy nhất hợp lệ cho deactivate). */
  async deactivate(
    id: string,
    version: number,
    actor: ActorContext,
  ): Promise<SupplierResponseDto> {
    return this.changeStatus(
      id,
      version,
      'ACTIVE',
      'INACTIVE',
      actor,
      'supplier.deactivate',
    );
  }

  private async changeStatus(
    id: string,
    version: number,
    requiredCurrentStatus: SupplierStatus,
    targetStatus: SupplierStatus,
    actor: ActorContext,
    auditAction: string,
  ): Promise<SupplierResponseDto> {
    const existing = await this.supplierRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();
    if (existing.status !== requiredCurrentStatus) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.SUPPLIER_INVALID_TRANSITION,
          `Không thể chuyển nhà cung cấp từ trạng thái ${existing.status} sang ${targetStatus}`,
        ),
      );
    }

    let updated: SupplierEntity;
    try {
      updated = await this.supplierRepository.changeStatusWithVersion(
        id,
        actor.organizationId,
        version,
        targetStatus,
        actor.userId,
      );
    } catch (error) {
      throw this.translateConcurrencyError(error);
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: auditAction,
      entityType: 'Supplier',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return SupplierMapper.toResponseDto(updated);
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

  /** Pre-check TRƯỚC khi ghi (SPEC §9.2) — giữ nguyên P2002 làm lớp bảo vệ cuối. */
  private async assertCodeNotDuplicate(
    organizationId: string,
    code: string,
  ): Promise<void> {
    const exists = await this.supplierRepository.existsByCode(
      organizationId,
      code,
    );
    if (exists) {
      throw new ConflictException(
        withCode(
          ErrorCode.SUPPLIER_DUPLICATE,
          'Mã nhà cung cấp này đã tồn tại trong tổ chức',
        ),
      );
    }
  }

  private translateConcurrencyError(error: unknown): Error {
    if (error instanceof SupplierConcurrencyConflictError) {
      return new ConflictException(
        withCode(ErrorCode.SUPPLIER_VERSION_CONFLICT, error.message),
      );
    }
    return error as Error;
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
