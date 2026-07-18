import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { DomainEventPublisher } from '../../platform/events/domain-event-publisher.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import {
  CustomerEntity,
  CustomerStatus,
} from '../domain/entities/customer.entity';
import { CustomerConcurrencyConflictError } from '../domain/errors/customer.errors';
import {
  CUSTOMER_ACTIVATED_EVENT,
  CUSTOMER_CREATED_EVENT,
  CUSTOMER_DEACTIVATED_EVENT,
  CUSTOMER_DELETED_EVENT,
  CUSTOMER_RESTORED_EVENT,
  CUSTOMER_UPDATED_EVENT,
} from '../domain/events/customer.events';
import { CUSTOMER_REPOSITORY } from '../domain/repositories/customer.repository.interface';
import type {
  CustomerSearchParams,
  ICustomerRepository,
} from '../domain/repositories/customer.repository.interface';
import { CUSTOMER_CODE_GENERATOR } from '../domain/services/customer-code-generator.interface';
import type { ICustomerCodeGenerator } from '../domain/services/customer-code-generator.interface';
import { CreateCustomerDto } from './dto/create-customer.dto';
import {
  CustomerResponseDto,
  PaginatedCustomerResponseDto,
} from './dto/customer-response.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerMapper } from './mappers/customer.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class CustomerService {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepository: ICustomerRepository,
    @Inject(CUSTOMER_CODE_GENERATOR)
    private readonly codeGenerator: ICustomerCodeGenerator,
    private readonly auditLogService: AuditLogService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  /** Decision CR05/SR08 — code optional: client cung cấp → validate+unique; không cung cấp → generator (atomic). */
  async create(
    dto: CreateCustomerDto,
    actor: ActorContext,
  ): Promise<CustomerResponseDto> {
    let code: string;
    if (dto.code) {
      code = dto.code.trim().toUpperCase();
      await this.assertCodeNotDuplicate(actor.organizationId, code);
    } else {
      code = await this.codeGenerator.generate(actor.organizationId);
    }

    const created = await this.customerRepository.create({
      organizationId: actor.organizationId,
      code,
      customerType: dto.customerType,
      fullName: dto.fullName,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      birthday: dto.birthday ? new Date(dto.birthday) : null,
      gender: dto.gender ?? null,
      taxCode: dto.taxCode ?? null,
      companyName: dto.companyName ?? null,
      contactName: dto.contactName ?? null,
      address: dto.address ?? null,
      province: dto.province ?? null,
      district: dto.district ?? null,
      ward: dto.ward ?? null,
      avatar: dto.avatar ?? null,
      note: dto.note ?? null,
      creditLimit: dto.creditLimit ?? null,
      paymentTermDays: dto.paymentTermDays ?? null,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'customer.create',
      entityType: 'Customer',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.eventPublisher.publish(CUSTOMER_CREATED_EVENT, {
      customerId: created.id,
      organizationId: actor.organizationId,
      occurredAt: new Date(),
    });

    return CustomerMapper.toResponseDto(created);
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findById(id, organizationId);
    if (!customer) throw this.notFound();
    return CustomerMapper.toResponseDto(customer);
  }

  async search(
    query: CustomerQueryDto,
    organizationId: string,
  ): Promise<PaginatedCustomerResponseDto> {
    const params = this.toSearchParams(query, organizationId);
    const result = await this.customerRepository.search(params);

    return {
      items: result.items.map((item) => CustomerMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
    actor: ActorContext,
  ): Promise<CustomerResponseDto> {
    const existing = await this.customerRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    let updated: CustomerEntity;
    try {
      updated = await this.customerRepository.update(
        id,
        actor.organizationId,
        dto.version,
        {
          customerType: dto.customerType,
          fullName: dto.fullName,
          phone: dto.phone,
          email: dto.email,
          birthday: dto.birthday ? new Date(dto.birthday) : undefined,
          gender: dto.gender,
          taxCode: dto.taxCode,
          companyName: dto.companyName,
          contactName: dto.contactName,
          address: dto.address,
          province: dto.province,
          district: dto.district,
          ward: dto.ward,
          avatar: dto.avatar,
          note: dto.note,
          creditLimit: dto.creditLimit,
          paymentTermDays: dto.paymentTermDays,
          updatedBy: actor.userId,
        },
      );
    } catch (error) {
      throw this.translateConcurrencyError(error);
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'customer.update',
      entityType: 'Customer',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.eventPublisher.publish(CUSTOMER_UPDATED_EVENT, {
      customerId: id,
      organizationId: actor.organizationId,
      occurredAt: new Date(),
    });

    return CustomerMapper.toResponseDto(updated);
  }

  /** Archive (BR07 — T011 không implement Guard thật, chưa có Sales/Debt Ledger — xem SPEC §8). */
  async remove(
    id: string,
    version: number,
    actor: ActorContext,
  ): Promise<void> {
    const existing = await this.customerRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    try {
      await this.customerRepository.softDelete(
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
      action: 'customer.archive',
      entityType: 'Customer',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.eventPublisher.publish(CUSTOMER_DELETED_EVENT, {
      customerId: id,
      organizationId: actor.organizationId,
      occurredAt: new Date(),
    });
  }

  /** Luôn trả status về INACTIVE, không tự động ACTIVE (RFC §8). */
  async restore(
    id: string,
    version: number,
    actor: ActorContext,
  ): Promise<CustomerResponseDto> {
    const existing = await this.customerRepository.findByIdIncludingDeleted(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();
    if (!existing.deletedAt) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.CUSTOMER_NOT_DELETED,
          'Khách hàng chưa bị xóa, không thể khôi phục',
        ),
      );
    }

    try {
      await this.customerRepository.restore(
        id,
        actor.organizationId,
        version,
        actor.userId,
      );
    } catch (error) {
      throw this.translateConcurrencyError(error);
    }

    const restored = await this.customerRepository.findById(
      id,
      actor.organizationId,
    );
    if (!restored) throw this.notFound();

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'customer.restore',
      entityType: 'Customer',
      entityId: id,
      newValue: this.toAuditSnapshot(restored),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.eventPublisher.publish(CUSTOMER_RESTORED_EVENT, {
      customerId: id,
      organizationId: actor.organizationId,
      occurredAt: new Date(),
    });

    return CustomerMapper.toResponseDto(restored);
  }

  /** INACTIVE → ACTIVE (RFC §8 — transition duy nhất hợp lệ cho activate). */
  async activate(
    id: string,
    version: number,
    actor: ActorContext,
  ): Promise<CustomerResponseDto> {
    return this.changeStatus(
      id,
      version,
      'INACTIVE',
      'ACTIVE',
      actor,
      'customer.activate',
      CUSTOMER_ACTIVATED_EVENT,
    );
  }

  /** ACTIVE → INACTIVE (RFC §8 — transition duy nhất hợp lệ cho deactivate). */
  async deactivate(
    id: string,
    version: number,
    actor: ActorContext,
  ): Promise<CustomerResponseDto> {
    return this.changeStatus(
      id,
      version,
      'ACTIVE',
      'INACTIVE',
      actor,
      'customer.deactivate',
      CUSTOMER_DEACTIVATED_EVENT,
    );
  }

  private async changeStatus(
    id: string,
    version: number,
    requiredCurrentStatus: CustomerStatus,
    targetStatus: CustomerStatus,
    actor: ActorContext,
    auditAction: string,
    event: string,
  ): Promise<CustomerResponseDto> {
    const existing = await this.customerRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();
    if (existing.status !== requiredCurrentStatus) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.CUSTOMER_INVALID_TRANSITION,
          `Không thể chuyển khách hàng từ trạng thái ${existing.status} sang ${targetStatus}`,
        ),
      );
    }

    let updated: CustomerEntity;
    try {
      updated = await this.customerRepository.changeStatusWithVersion(
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
      entityType: 'Customer',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.eventPublisher.publish(event, {
      customerId: id,
      organizationId: actor.organizationId,
      occurredAt: new Date(),
    });

    return CustomerMapper.toResponseDto(updated);
  }

  toSearchParams(
    query: CustomerQueryDto,
    organizationId: string,
  ): CustomerSearchParams {
    return {
      organizationId,
      search: query.search,
      customerType: query.customerType,
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortBy: query.sortBy ?? 'fullName',
      sortOrder: query.sortOrder ?? 'asc',
    };
  }

  /** Decision BQ6-style pre-check (đúng mẫu Barcode) — TRƯỚC khi ghi, giữ nguyên P2002 làm lớp bảo vệ cuối. */
  private async assertCodeNotDuplicate(
    organizationId: string,
    code: string,
  ): Promise<void> {
    const exists = await this.customerRepository.existsByCode(
      organizationId,
      code,
    );
    if (exists) {
      throw new ConflictException(
        withCode(
          ErrorCode.CUSTOMER_DUPLICATE,
          'Mã khách hàng này đã tồn tại trong tổ chức',
        ),
      );
    }
  }

  private translateConcurrencyError(error: unknown): Error {
    if (error instanceof CustomerConcurrencyConflictError) {
      return new ConflictException(
        withCode(ErrorCode.CUSTOMER_VERSION_CONFLICT, error.message),
      );
    }
    return error as Error;
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(ErrorCode.CUSTOMER_NOT_FOUND, 'Không tìm thấy khách hàng'),
    );
  }

  private toAuditSnapshot(customer: CustomerEntity): Record<string, unknown> {
    return {
      code: customer.code,
      fullName: customer.fullName,
      phone: customer.phone,
      customerType: customer.customerType,
      status: customer.status,
    };
  }
}
