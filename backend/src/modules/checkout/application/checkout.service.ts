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
import { CartDomainService } from '../../cart/application/cart-domain.service';
import { CustomerDomainService } from '../../customer/application/customer-domain.service';
import type { CustomerEntity } from '../../customer/domain/entities/customer.entity';
import { POINT_USED_EVENT } from '../../customer-point/domain/events/customer-point.events';
import type { CustomerPointDomainEvent } from '../../customer-point/domain/events/customer-point.events';
import type { CustomerPointLedgerEntity } from '../../customer-point/domain/entities/customer-point-ledger.entity';
import { CustomerPointInsufficientBalanceError } from '../../customer-point/domain/repositories/customer-point.repository.interface';
import { CustomerPointDomainService } from '../../customer-point/application/customer-point-domain.service';
import { InventoryDomainService } from '../../inventory/application/inventory-domain.service';
import {
  InventoryConcurrencyConflictError,
  InventoryInsufficientStockError,
} from '../../inventory/domain/errors/inventory.errors';
import { DiscountEngineService } from '../../discount/application/discount-engine.service';
import type {
  CandidateDiscount,
  DiscountLineItem,
} from '../../discount/domain/entities/discount.entity';
import { InvoiceService } from '../../invoice/application/invoice.service';
import { PaymentService } from '../../payment/application/payment.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { UnitDomainService } from '../../unit/application/unit-domain.service';
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
import { CheckoutOperationService } from './checkout-operation.service';
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
 * "Toàn bộ → Một Transaction" (Prompt 035, giữ nguyên qua T013 Phase 3 — Decision AD07/AD10):
 * CheckoutService là orchestrator DUY NHẤT mở `PrismaService.$transaction()` bao trọn
 * Point → Voucher → Invoice → Payment → Inventory Movement — mọi repository/service con đều
 * nhận `tx` để nằm CHUNG giao dịch này, không mở transaction riêng của chính nó khi được gọi
 * từ đây. Cart (Redis) và các Domain Event nằm NGOÀI transaction Postgres — chỉ thực hiện SAU
 * KHI transaction đã commit thành công.
 *
 * T013 Phase 3 (SPEC-T013-SALES-FOUNDATION-001 §13.2) bổ sung bước "Reserve" (Idempotency) làm
 * bước ĐẦU TIÊN, TRƯỚC cả validate Cart — đây là 1 transaction/statement RIÊNG BIỆT, tuần tự,
 * KHÔNG lồng vào Business Transaction chính (đúng nguyên tắc Transaction Propagation, SPEC §14).
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartDomainService: CartDomainService,
    private readonly customerDomainService: CustomerDomainService,
    private readonly customerPointDomainService: CustomerPointDomainService,
    private readonly inventoryDomainService: InventoryDomainService,
    @Inject(VOUCHER_REPOSITORY)
    private readonly voucherRepository: IVoucherRepository,
    private readonly discountEngine: DiscountEngineService,
    private readonly invoiceService: InvoiceService,
    private readonly paymentService: PaymentService,
    private readonly productDomainService: ProductDomainService,
    private readonly unitDomainService: UnitDomainService,
    private readonly checkoutOperationService: CheckoutOperationService,
    private readonly auditLogService: AuditLogService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  async checkout(
    dto: CheckoutDto,
    actor: ActorContext,
    idempotencyKey: string,
  ): Promise<CheckoutResponseDto> {
    // Bước 1 — Reserve (SPEC §13.2), TRƯỚC mọi validate khác. Transaction/statement riêng,
    // không lồng vào Business Transaction chính bên dưới.
    const reserveOutcome = await this.checkoutOperationService.reserve({
      organizationId: actor.organizationId,
      branchId: dto.branchId,
      idempotencyKey,
      payload: dto as unknown as Record<string, unknown>,
      createdBy: actor.userId,
    });

    if (reserveOutcome.kind === 'REPLAY') {
      const [invoice, payment] = await Promise.all([
        this.invoiceService.getById(
          reserveOutcome.invoiceId,
          actor.organizationId,
        ),
        this.paymentService.getById(
          reserveOutcome.paymentId,
          actor.organizationId,
        ),
      ]);
      return { invoice, payment };
    }

    const operationId = reserveOutcome.operationId;

    try {
      const cart = await this.cartDomainService.findByUserId(
        actor.organizationId,
        actor.userId,
      );
      if (!cart || cart.items.length === 0) {
        throw new UnprocessableEntityException(
          withCode(ErrorCode.CHECKOUT_EMPTY_CART, 'Giỏ hàng đang trống'),
        );
      }

      let customer: CustomerEntity | null = null;
      if (dto.customerId) {
        // T011 (SPEC-T011-CUSTOMER-001 §9.4) — findActiveById() thay findById() trực tiếp:
        // đúng BR04 ("Archived Customer không được sử dụng cho giao dịch bán hàng mới").
        customer = await this.customerDomainService.findActiveById(
          actor.organizationId,
          dto.customerId,
        );
        if (!customer) {
          throw new NotFoundException(
            withCode(ErrorCode.CUSTOMER_NOT_FOUND, 'Không tìm thấy khách hàng'),
          );
        }
      }

      // T013 Phase 5 (SPEC-T013-SALES-FOUNDATION-001 §1.3) — Mandatory Snapshot: đọc Product +
      // Unit hiện tại của MỖI dòng hàng trước khi vào Business Transaction (đọc thuần, giống
      // Customer/Voucher ở trên) để ghi productCodeSnapshot/productNameSnapshot/unitNameSnapshot.
      const productById = new Map(
        await Promise.all(
          [...new Set(cart.items.map((item) => item.productId))].map(
            async (productId) => {
              const product = await this.productDomainService.findById(
                productId,
                actor.organizationId,
              );
              if (!product) {
                throw new NotFoundException(
                  withCode(
                    ErrorCode.PRODUCT_NOT_FOUND,
                    'Không tìm thấy sản phẩm',
                  ),
                );
              }
              return [productId, product] as const;
            },
          ),
        ),
      );
      const unitById = new Map(
        await Promise.all(
          [...new Set([...productById.values()].map((p) => p.unitId))].map(
            async (unitId) => {
              const unit = await this.unitDomainService.findByIdForReference(
                actor.organizationId,
                unitId,
              );
              if (!unit) {
                throw new NotFoundException(
                  withCode(
                    ErrorCode.UNIT_NOT_FOUND,
                    'Không tìm thấy đơn vị tính',
                  ),
                );
              }
              return [unitId, unit] as const;
            },
          ),
        ),
      );

      let voucher: VoucherEntity | null = null;
      if (dto.voucherCode) {
        voucher = await this.voucherRepository.findActiveByCode(
          actor.organizationId,
          dto.voucherCode,
        );
        this.assertVoucherApplicable(voucher, cart.subtotal, dto.voucherCode);
      }

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
          pointUsage = await this.customerPointDomainService.usePoint(
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
            customerCodeSnapshot: customer?.code ?? null,
            customerNameSnapshot: customer?.fullName ?? null,
            customerPhoneSnapshot: customer?.phone ?? null,
            items: cart.items.map((item) => {
              const product = productById.get(item.productId)!;
              const unit = unitById.get(product.unitId)!;
              return {
                productId: item.productId,
                quantity: Number(item.quantity),
                unitPrice: Number(item.price),
                discount: Number(item.discount),
                taxAmount: Number(item.tax),
                totalAmount: Number(item.total),
                productCodeSnapshot: product.sku,
                productNameSnapshot: product.name,
                unitNameSnapshot: unit.name,
                // Conditional Snapshot (SPEC §1.3) — Cart hiện chưa lưu vết "được thêm qua quét
                // Barcode cụ thể nào" (CartItemEntity không có field này), nên null ở mọi dòng
                // hàng cho tới khi Cart được mở rộng để capture nguồn gốc thêm hàng.
                barcodeId: null,
                barcodeSnapshot: null,
              };
            }),
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

        // T013 Phase 6 (SPEC-T013-SALES-FOUNDATION-001 §12, Decision SP06) — Product SERVICE
        // không trừ tồn: được phép bán, có mặt trên InvoiceItem/Payment như bình thường, CHỈ
        // loại trừ khỏi bước gọi Inventory. Dùng lại `productById` (đã fetch ở Bước lookup
        // Snapshot, Phase 5) — không gọi thêm `productDomainService.findById()` lần nữa.
        for (const item of cart.items) {
          const product = productById.get(item.productId)!;
          if (product.type === 'SERVICE') {
            continue;
          }
          await this.inventoryDomainService.decrease(tx, {
            organizationId: actor.organizationId,
            warehouseId: dto.warehouseId,
            productId: item.productId,
            quantity: Number(item.quantity),
            movementType: 'SALE',
            referenceType: 'POS',
            referenceId: invoice.id,
            createdBy: actor.userId,
          });
        }

        // Bước cuối BÊN TRONG Business Transaction chính (SPEC §13.2) — cùng transaction với
        // Invoice/Payment/Inventory. Nếu bất kỳ bước nào ở trên throw, dòng này không chạy và
        // toàn bộ rollback — row checkout_operations (đã commit riêng ở Bước 1) vẫn ở PROCESSING.
        await this.checkoutOperationService.markCompleted(
          operationId,
          invoice.id,
          payment.id,
          tx,
        );

        const result: CheckoutOutcome = {
          invoiceId: invoice.id,
          invoiceTotalAmount: invoice.totalAmount,
          paymentId: payment.id,
          response: { invoice, payment },
          pointUsage,
        };
        return result;
      });

      await this.cartDomainService.clearAfterCheckout(
        actor.organizationId,
        actor.userId,
      );

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
      // Giải phóng Idempotency-Key ngay (không đợi 2 phút stuck-timeout) — áp dụng cho MỌI
      // nhánh lỗi kể từ sau khi reserve() thành công, kể cả lỗi validate sớm (Cart/Customer/
      // Voucher) chứ không chỉ lỗi trong Business Transaction — khác hành vi CHECKOUT_FAILED_EVENT
      // trước T013 (trước đây chỉ phát khi lỗi xảy ra trong/sau transaction).
      await this.checkoutOperationService.markFailed(operationId);
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
