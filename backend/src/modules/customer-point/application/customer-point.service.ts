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
import { CustomerDomainService } from '../../customer/application/customer-domain.service';
import { CustomerPointLedgerEntity } from '../domain/entities/customer-point-ledger.entity';
import {
  POINT_ADDED_EVENT,
  POINT_USED_EVENT,
} from '../domain/events/customer-point.events';
import {
  CUSTOMER_POINT_REPOSITORY,
  CustomerPointInsufficientBalanceError,
} from '../domain/repositories/customer-point.repository.interface';
import type { ICustomerPointRepository } from '../domain/repositories/customer-point.repository.interface';
import { AddPointDto } from './dto/add-point.dto';
import { CustomerPointHistoryQueryDto } from './dto/customer-point-history-query.dto';
import {
  CustomerPointLedgerResponseDto,
  PaginatedCustomerPointLedgerResponseDto,
} from './dto/customer-point-response.dto';
import { UsePointDto } from './dto/use-point.dto';
import { CustomerPointMapper } from './mappers/customer-point.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class CustomerPointService {
  constructor(
    @Inject(CUSTOMER_POINT_REPOSITORY)
    private readonly customerPointRepository: ICustomerPointRepository,
    private readonly customerDomainService: CustomerDomainService,
    private readonly auditLogService: AuditLogService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  async addPoint(
    dto: AddPointDto,
    actor: ActorContext,
  ): Promise<CustomerPointLedgerResponseDto> {
    await this.assertCustomerExists(dto.customerId, actor.organizationId);

    const created = await this.customerPointRepository.addPoint({
      organizationId: actor.organizationId,
      customerId: dto.customerId,
      point: dto.point,
      referenceType: dto.referenceType ?? null,
      referenceId: dto.referenceId ?? null,
      expiredAt: dto.expiredAt ? new Date(dto.expiredAt) : null,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'customer_point.add',
      entityType: 'CustomerPointLedger',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.eventPublisher.publish(POINT_ADDED_EVENT, {
      customerId: created.customerId,
      organizationId: actor.organizationId,
      ledgerId: created.id,
      point: created.point,
      balance: created.balance,
      occurredAt: new Date(),
    });

    return CustomerPointMapper.toResponseDto(created);
  }

  async usePoint(
    dto: UsePointDto,
    actor: ActorContext,
  ): Promise<CustomerPointLedgerResponseDto> {
    await this.assertCustomerExists(dto.customerId, actor.organizationId);

    let created: CustomerPointLedgerEntity;
    try {
      created = await this.customerPointRepository.usePoint({
        organizationId: actor.organizationId,
        customerId: dto.customerId,
        point: dto.point,
        referenceType: dto.referenceType ?? null,
        referenceId: dto.referenceId ?? null,
        createdBy: actor.userId,
      });
    } catch (error) {
      if (error instanceof CustomerPointInsufficientBalanceError) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.CUSTOMER_POINT_INSUFFICIENT_BALANCE,
            error.message,
          ),
        );
      }
      throw error;
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'customer_point.use',
      entityType: 'CustomerPointLedger',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    this.eventPublisher.publish(POINT_USED_EVENT, {
      customerId: created.customerId,
      organizationId: actor.organizationId,
      ledgerId: created.id,
      point: created.point,
      balance: created.balance,
      occurredAt: new Date(),
    });

    return CustomerPointMapper.toResponseDto(created);
  }

  async getHistory(
    query: CustomerPointHistoryQueryDto,
    organizationId: string,
  ): Promise<PaginatedCustomerPointLedgerResponseDto> {
    await this.assertCustomerExists(query.customerId, organizationId);

    const result = await this.customerPointRepository.getHistory({
      organizationId,
      customerId: query.customerId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });

    return {
      items: result.items.map((item) =>
        CustomerPointMapper.toResponseDto(item),
      ),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  private async assertCustomerExists(
    customerId: string,
    organizationId: string,
  ): Promise<void> {
    // T011 (SPEC-T011-CUSTOMER-001 §9.4) — findById() giữ nguyên (không findActiveById()):
    // đồng bộ điểm không phải giao dịch bán hàng mới, không áp dụng ràng buộc BR04.
    const customer = await this.customerDomainService.findById(
      organizationId,
      customerId,
    );
    if (!customer) {
      throw new NotFoundException(
        withCode(ErrorCode.CUSTOMER_NOT_FOUND, 'Không tìm thấy khách hàng'),
      );
    }
  }

  private toAuditSnapshot(
    entry: CustomerPointLedgerEntity,
  ): Record<string, unknown> {
    return {
      customerId: entry.customerId,
      point: entry.point,
      balance: entry.balance,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
    };
  }
}
