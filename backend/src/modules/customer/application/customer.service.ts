import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { DomainEventPublisher } from '../../platform/events/domain-event-publisher.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { CustomerEntity } from '../domain/entities/customer.entity';
import {
  CUSTOMER_CREATED_EVENT,
  CUSTOMER_DELETED_EVENT,
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

  async create(
    dto: CreateCustomerDto,
    actor: ActorContext,
  ): Promise<CustomerResponseDto> {
    const code = await this.codeGenerator.generate(actor.organizationId);
    const created = await this.customerRepository.create({
      organizationId: actor.organizationId,
      code,
      customerType: dto.customerType,
      fullName: dto.fullName,
      phone: dto.phone,
      email: dto.email ?? null,
      birthday: dto.birthday ? new Date(dto.birthday) : null,
      gender: dto.gender ?? null,
      taxCode: dto.taxCode ?? null,
      companyName: dto.companyName ?? null,
      address: dto.address ?? null,
      province: dto.province ?? null,
      district: dto.district ?? null,
      ward: dto.ward ?? null,
      avatar: dto.avatar ?? null,
      note: dto.note ?? null,
      creditLimit: dto.creditLimit ?? null,
      status: dto.status,
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

    const updated = await this.customerRepository.update(id, {
      customerType: dto.customerType,
      fullName: dto.fullName,
      phone: dto.phone,
      email: dto.email,
      birthday: dto.birthday ? new Date(dto.birthday) : undefined,
      gender: dto.gender,
      taxCode: dto.taxCode,
      companyName: dto.companyName,
      address: dto.address,
      province: dto.province,
      district: dto.district,
      ward: dto.ward,
      avatar: dto.avatar,
      note: dto.note,
      creditLimit: dto.creditLimit,
      status: dto.status,
      updatedBy: actor.userId,
    });

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

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await this.customerRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    await this.customerRepository.softDelete(id, actor.userId);

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'customer.delete',
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

  async restore(id: string, actor: ActorContext): Promise<CustomerResponseDto> {
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

    await this.customerRepository.restore(id, actor.userId);
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

    return CustomerMapper.toResponseDto(restored);
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
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'desc',
    };
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
