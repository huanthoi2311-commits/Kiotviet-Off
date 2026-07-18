import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { SupplierDomainService } from '../../supplier/application/supplier-domain.service';
import { SupplierPaymentEntity } from '../domain/entities/supplier-debt.entity';
import {
  SUPPLIER_DEBT_REPOSITORY,
  SupplierPaymentExceedsBalanceError,
} from '../domain/repositories/supplier-debt.repository.interface';
import type { ISupplierDebtRepository } from '../domain/repositories/supplier-debt.repository.interface';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { SupplierDebtQueryDto } from './dto/supplier-debt-query.dto';
import { PaginatedSupplierDebtResponseDto } from './dto/supplier-debt-response.dto';
import { SupplierPaymentResponseDto } from './dto/supplier-payment-response.dto';
import { SupplierDebtMapper } from './mappers/supplier-debt.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class SupplierDebtService {
  constructor(
    @Inject(SUPPLIER_DEBT_REPOSITORY)
    private readonly supplierDebtRepository: ISupplierDebtRepository,
    private readonly supplierDomainService: SupplierDomainService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async search(
    query: SupplierDebtQueryDto,
    organizationId: string,
  ): Promise<PaginatedSupplierDebtResponseDto> {
    const result = await this.supplierDebtRepository.search({
      organizationId,
      search: query.search,
      supplierId: query.supplierId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });

    return {
      items: result.items.map((item) =>
        SupplierDebtMapper.toDebtResponseDto(item),
      ),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /** Ghi nhận thanh toán cho Nhà cung cấp — chặn thanh toán vượt quá công nợ hiện tại. */
  async createPayment(
    dto: CreateSupplierPaymentDto,
    actor: ActorContext,
  ): Promise<SupplierPaymentResponseDto> {
    const supplier = await this.supplierDomainService.findById(
      actor.organizationId,
      dto.supplierId,
    );
    if (!supplier) {
      throw new NotFoundException(
        withCode(ErrorCode.SUPPLIER_NOT_FOUND, 'Không tìm thấy nhà cung cấp'),
      );
    }

    let payment: SupplierPaymentEntity;
    try {
      payment = await this.supplierDebtRepository.createPayment({
        organizationId: actor.organizationId,
        branchId: dto.branchId,
        supplierId: dto.supplierId,
        purchaseOrderId: dto.purchaseOrderId ?? null,
        method: dto.method,
        amount: dto.amount,
        paidAt: new Date(dto.paidAt),
        createdBy: actor.userId,
      });
    } catch (error) {
      if (error instanceof SupplierPaymentExceedsBalanceError) {
        throw new UnprocessableEntityException(
          withCode(ErrorCode.SUPPLIER_PAYMENT_EXCEEDS_BALANCE, error.message),
        );
      }
      throw error;
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'supplier_payment.create',
      entityType: 'SupplierPayment',
      entityId: payment.id,
      newValue: {
        supplierId: payment.supplierId,
        purchaseOrderId: payment.purchaseOrderId,
        method: payment.method,
        amount: payment.amount,
      },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return SupplierDebtMapper.toPaymentResponseDto(payment);
  }
}
