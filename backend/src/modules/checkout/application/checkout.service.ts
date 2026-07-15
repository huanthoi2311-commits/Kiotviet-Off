import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { DomainEventPublisher } from '../../platform/events/domain-event-publisher.service';
import { CART_REPOSITORY } from '../../cart/domain/repositories/cart.repository.interface';
import type { ICartRepository } from '../../cart/domain/repositories/cart.repository.interface';
import { CUSTOMER_REPOSITORY } from '../../customer/domain/repositories/customer.repository.interface';
import type { ICustomerRepository } from '../../customer/domain/repositories/customer.repository.interface';
import { POINT_USED_EVENT } from '../../customer-point/domain/events/customer-point.events';
import type { CustomerPointDomainEvent } from '../../customer-point/domain/events/customer-point.events';
import { CUSTOMER_POINT_REPOSITORY } from '../../customer-point/domain/repositories/customer-point.repository.interface';
import type { CustomerPointLedgerEntity } from '../../customer-point/domain/entities/customer-point-ledger.entity';
import type { ICustomerPointRepository } from '../../customer-point/domain/repositories/customer-point.repository.interface';
import { CustomerPointInsufficientBalanceError } from '../../customer-point/domain/repositories/customer-point.repository.interface';
import {
  INVENTORY_REPOSITORY,
  InventoryConcurrencyConflictError,
  InventoryInsufficientStockError,
} from '../../inventory/domain/repositories/inventory.repository.interface';
import type { IInventoryRepository } from '../../inventory/domain/repositories/inventory.repository.interface';
import { DiscountEngineService } from '../../discount/application/discount-engine.service';
import type {
  CandidateDiscount,
  DiscountLineItem,
} from '../../discount/domain/entities/discount.entity';
import { InvoiceService } from '../../invoice/application/invoice.service';
import { PaymentService } from '../../payment/application/payment.service';
import {
  VOUCHER_REPOSITORY,
  VoucherConcurrencyConflictError,
} from '../domain/repositories/voucher.repository.interface';
import type { IVoucherRepository } from '../domain/repositories/voucher.repository.interface';
import type { VoucherEntity } from '../domain/entities/voucher.entity';
import {
  CHECKOUT_COMPLETED_EVENT,
  CHECKOUT_FAILED_EVENT,
} from '../domain/events/checkout.events';
import { CheckoutDto } from './dto/checkout.dto';
import { CheckoutResponseDto } from './dto/checkout-response.dto';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

interface CheckoutOutcome {
  invoiceId: string;
  invoiceTotalAmount: string;
  paymentId: string;
  response: CheckoutResponseDto;
  pointUsage: CustomerPointLedgerEntity | null;
}

/**
 * "Toàn bộ → Một Transaction" (Prompt 035): CheckoutService là orchestrator DUY NHẤT mở
 * `PrismaService.$transaction()` bao trọn Point → Voucher → Invoice → Payment → Inventory
 * Movement — mọi repository/service con đều nhận `tx` để nằm CHUNG giao dịch này, không mở
 * transaction riêng của chính nó khi được gọi từ đây. Cart (Redis) và các Domain Event nằm
 * NGOÀI transaction Postgres — chỉ thực hiện SAU KHI transaction đã commit thành công.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CART_REPOSITORY) private readonly cartRepository: ICartRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepository: ICustomerRepository,
    @Inject(CUSTOMER_POINT_REPOSITORY)
    private readonly customerPointRepository: ICustomerPointRepository,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventoryRepository: IInventoryRepository,
    @Inject(VOUCHER_REPOSITORY)
    private readonly voucherRepository: IVoucherRepository,
    private readonly discountEngine: DiscountEngineService,
    private readonly invoiceService: InvoiceService,
    private readonly paymentService: PaymentService,
    private readonly auditLogService: AuditLogService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  async checkout(
    dto: CheckoutDto,
    actor: ActorContext,
  ): Promise<CheckoutResponseDto> {
    const cart = await this.cartRepository.findByUserId(
      actor.organizationId,
      actor.userId,
    );
    if (!cart || cart.items.length === 0) {
      throw new UnprocessableEntityException(
        withCode(ErrorCode.CHECKOUT_EMPTY_CART, 'Giỏ hàng đang trống'),
      );
    }

    if (dto.customerId) {
      const customer = await this.customerRepository.findById(
        dto.customerId,
        actor.organizationId,
      );
      if (!customer) {
        throw new NotFoundException(
          withCode(ErrorCode.CUSTOMER_NOT_FOUND, 'Không tìm thấy khách hàng'),
        );
      }
    }

    let voucher: VoucherEntity | null = null;
    if (dto.voucherCode) {
      voucher = await this.voucherRepository.findActiveByCode(
        actor.organizationId,
        dto.voucherCode,
      );
      this.assertVoucherApplicable(voucher, cart.subtotal, dto.voucherCode);
    }

    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const subtotal = new Prisma.Decimal(cart.subtotal);
        const totalTax = new Prisma.Decimal(cart.totalTax);
        const discountItems: DiscountLineItem[] = cart.items.map((item) => ({
          productId: item.productId,
          quantity: new Prisma.Decimal(item.quantity),
          unitPrice: new Prisma.Decimal(item.price),
        }));

        const manualCandidates: CandidateDiscount[] = dto.manualDiscount
          ? [{ source: 'MANUAL', ...dto.manualDiscount }]
          : [];
        const manualResult = this.discountEngine.calculate(
          discountItems,
          subtotal,
          manualCandidates,
        );
        let currentTotal = new Prisma.Decimal(manualResult.finalTotal);

        let pointUsage: CustomerPointLedgerEntity | null = null;
        if (dto.pointsToUse && dto.customerId) {
          if (dto.pointsToUse > Number(currentTotal)) {
            throw new UnprocessableEntityException(
              withCode(
                ErrorCode.CHECKOUT_POINTS_EXCEED_TOTAL,
                'Số điểm muốn dùng vượt quá giá trị đơn hàng còn lại',
              ),
            );
          }
          pointUsage = await this.customerPointRepository.usePoint(
            {
              organizationId: actor.organizationId,
              customerId: dto.customerId,
              point: dto.pointsToUse,
              referenceType: 'CHECKOUT',
              createdBy: actor.userId,
            },
            tx,
          );
          currentTotal = currentTotal.minus(dto.pointsToUse);
        }

        if (voucher) {
          const voucherCandidate: CandidateDiscount =
            voucher.type === 'PERCENTAGE'
              ? {
                  source: 'VOUCHER',
                  type: 'PERCENT',
                  value: Number(voucher.value),
                  maxDiscount: voucher.maxDiscount
                    ? Number(voucher.maxDiscount)
                    : undefined,
                }
              : {
                  source: 'VOUCHER',
                  type: 'AMOUNT',
                  value: Number(voucher.value),
                };
          const voucherResult = this.discountEngine.calculate(
            discountItems,
            currentTotal,
            [voucherCandidate],
          );
          currentTotal = new Prisma.Decimal(voucherResult.finalTotal);
          await this.voucherRepository.incrementUsage(
            voucher.id,
            voucher.usedCount,
            tx,
          );
        }

        const finalTotal = currentTotal.plus(totalTax);

        const invoice = await this.invoiceService.createInvoice(
          {
            organizationId: actor.organizationId,
            branchId: dto.branchId,
            customerId: dto.customerId ?? null,
            totalAmount: Number(finalTotal),
            paidAmount: Number(finalTotal),
            dueAmount: 0,
            status: 'PAID',
            items: cart.items.map((item) => ({
              productId: item.productId,
              quantity: Number(item.quantity),
              unitPrice: Number(item.price),
              discount: Number(item.discount),
              taxAmount: Number(item.tax),
              totalAmount: Number(item.total),
            })),
            createdBy: actor.userId,
          },
          tx,
        );

        const payment = await this.paymentService.createPayment(
          {
            organizationId: actor.organizationId,
            branchId: dto.branchId,
            invoiceId: invoice.id,
            customerId: dto.customerId ?? null,
            method: dto.paymentMethod,
            amount: Number(finalTotal),
            paidAt: new Date(),
            createdBy: actor.userId,
          },
          tx,
        );

        for (const item of cart.items) {
          await this.inventoryRepository.recordSaleMovement(
            {
              organizationId: actor.organizationId,
              warehouseId: dto.warehouseId,
              productId: item.productId,
              quantity: Number(item.quantity),
              referenceId: invoice.id,
              createdBy: actor.userId,
            },
            tx,
          );
        }

        const result: CheckoutOutcome = {
          invoiceId: invoice.id,
          invoiceTotalAmount: invoice.totalAmount,
          paymentId: payment.id,
          response: { invoice, payment },
          pointUsage,
        };
        return result;
      });

      await this.cartRepository.delete(actor.organizationId, actor.userId);

      this.eventPublisher.publish(CHECKOUT_COMPLETED_EVENT, {
        organizationId: actor.organizationId,
        userId: actor.userId,
        customerId: dto.customerId ?? null,
        invoiceId: outcome.invoiceId,
        paymentId: outcome.paymentId,
        totalAmount: outcome.invoiceTotalAmount,
        occurredAt: new Date(),
      });

      if (outcome.pointUsage) {
        const pointEvent: CustomerPointDomainEvent = {
          customerId: outcome.pointUsage.customerId,
          organizationId: actor.organizationId,
          ledgerId: outcome.pointUsage.id,
          point: outcome.pointUsage.point,
          balance: outcome.pointUsage.balance,
          occurredAt: new Date(),
        };
        this.eventPublisher.publish(POINT_USED_EVENT, pointEvent);
      }

      await this.auditLogService.log({
        organizationId: actor.organizationId,
        userId: actor.userId,
        action: 'checkout.completed',
        entityType: 'Invoice',
        entityId: outcome.invoiceId,
        newValue: {
          invoiceId: outcome.invoiceId,
          paymentId: outcome.paymentId,
          totalAmount: outcome.invoiceTotalAmount,
        },
        ip: actor.ip,
        userAgent: actor.userAgent,
      });

      return outcome.response;
    } catch (error) {
      this.eventPublisher.publish(CHECKOUT_FAILED_EVENT, {
        organizationId: actor.organizationId,
        userId: actor.userId,
        customerId: dto.customerId ?? null,
        reason: error instanceof Error ? error.message : 'Unknown error',
        occurredAt: new Date(),
      });
      throw this.mapError(error);
    }
  }

  private assertVoucherApplicable(
    voucher: VoucherEntity | null,
    subtotal: string,
    code: string,
  ): asserts voucher is VoucherEntity {
    if (!voucher) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.CHECKOUT_VOUCHER_INVALID,
          `Mã giảm giá "${code}" không tồn tại`,
        ),
      );
    }
    const now = new Date();
    if (
      voucher.status !== 'ACTIVE' ||
      now < voucher.startDate ||
      now > voucher.endDate
    ) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.CHECKOUT_VOUCHER_INVALID,
          'Mã giảm giá không còn hiệu lực',
        ),
      );
    }
    if (
      voucher.usageLimit !== null &&
      voucher.usedCount >= voucher.usageLimit
    ) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.CHECKOUT_VOUCHER_INVALID,
          'Mã giảm giá đã hết lượt sử dụng',
        ),
      );
    }
    if (
      voucher.minOrderAmount &&
      new Prisma.Decimal(subtotal).lessThan(voucher.minOrderAmount)
    ) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.CHECKOUT_VOUCHER_INVALID,
          `Đơn hàng phải tối thiểu ${voucher.minOrderAmount} để dùng mã "${code}"`,
        ),
      );
    }
  }

  private mapError(error: unknown): Error {
    if (error instanceof InventoryInsufficientStockError) {
      return new UnprocessableEntityException(
        withCode(ErrorCode.CHECKOUT_INSUFFICIENT_STOCK, error.message),
      );
    }
    if (error instanceof InventoryConcurrencyConflictError) {
      return new ConflictException(
        withCode(ErrorCode.CHECKOUT_INVENTORY_CONFLICT, error.message),
      );
    }
    if (error instanceof CustomerPointInsufficientBalanceError) {
      return new UnprocessableEntityException(
        withCode(ErrorCode.CUSTOMER_POINT_INSUFFICIENT_BALANCE, error.message),
      );
    }
    if (error instanceof VoucherConcurrencyConflictError) {
      return new ConflictException(
        withCode(ErrorCode.CHECKOUT_VOUCHER_CONFLICT, error.message),
      );
    }
    if (error instanceof HttpException) {
      return error;
    }
    return error instanceof Error ? error : new Error('Checkout failed');
  }
}
