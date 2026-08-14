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
import { PURCHASE_ORDER_REPOSITORY } from '../../purchase-order/domain/repositories/purchase-order.repository.interface';
import type { IPurchaseOrderRepository } from '../../purchase-order/domain/repositories/purchase-order.repository.interface';
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
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly purchaseOrderRepository: IPurchaseOrderRepository,
    private readonly supplierDomainService: SupplierDomainService,
    private readonly branchService: BranchService,
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

    // T052.01 — branchId trước đây chảy thẳng từ DTO vào Payment.create() không qua bất kỳ xác
    // minh organizationId nào (FK Prisma chỉ đảm bảo Branch TỒN TẠI ở đâu đó, không đảm bảo thuộc
    // ĐÚNG tổ chức của actor) — lỗ hổng độc lập phát hiện ở T052.01A, sửa ở đây bằng đúng port
    // công khai đã duyệt (`BranchService.getById`, T051.06A), ném 404 KHÔNG PHÂN BIỆT branchId
    // không tồn tại hay thuộc tổ chức khác — không tiết lộ sự tồn tại cross-tenant.
    await this.branchService.getById(dto.branchId, actor);

    // T052.01C — purchaseOrderId (tùy chọn) trước đây CŨNG chảy thẳng vào Payment.create() không
    // qua bất kỳ xác minh organizationId nào — cùng lớp lỗ hổng như branchId, phát hiện độc lập
    // trong lần review T052.01B. `PurchaseOrderModule` CHỦ Ý chỉ export `PURCHASE_ORDER_REPOSITORY`
    // (không export `PurchaseOrderService`) — tái dùng ĐÚNG pattern cross-module đã có sẵn
    // (`PurchaseReturnService.create()` dùng chính xác cùng repository + cùng lỗi), không tự tạo
    // boundary mới. Không kiểm tra purchaseOrder.supplierId === dto.supplierId — không có bằng
    // chứng nào trong nguồn/spec (kể cả thiết kế gốc, prompt-029-report.md §6: "purchaseOrderId...
    // có thể là thanh toán CHUNG cho công nợ NCC") xác lập bất biến "phải cùng nhà cung cấp"; tự
    // thêm quy tắc đó sẽ là suy diễn ngoài phạm vi được uỷ quyền.
    if (dto.purchaseOrderId) {
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
