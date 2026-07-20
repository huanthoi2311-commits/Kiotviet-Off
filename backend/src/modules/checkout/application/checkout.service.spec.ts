import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CartDomainService } from '../../cart/application/cart-domain.service';
import { CartEntity } from '../../cart/domain/entities/cart.entity';
import { CustomerDomainService } from '../../customer/application/customer-domain.service';
import { CustomerPointDomainService } from '../../customer-point/application/customer-point-domain.service';
import { CustomerPointInsufficientBalanceError } from '../../customer-point/domain/repositories/customer-point.repository.interface';
import { InventoryDomainService } from '../../inventory/application/inventory-domain.service';
import {
  InventoryConcurrencyConflictError,
  InventoryInsufficientStockError,
} from '../../inventory/domain/errors/inventory.errors';
import { DiscountEngineService } from '../../discount/application/discount-engine.service';
import { AmountDiscountStrategy } from '../../discount/infrastructure/strategies/amount-discount.strategy';
import { BuyXGetYDiscountStrategy } from '../../discount/infrastructure/strategies/buy-x-get-y-discount.strategy';
import { FixedPriceDiscountStrategy } from '../../discount/infrastructure/strategies/fixed-price-discount.strategy';
import { PercentDiscountStrategy } from '../../discount/infrastructure/strategies/percent-discount.strategy';
import { InvoiceService } from '../../invoice/application/invoice.service';
import { PaymentService } from '../../payment/application/payment.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { UnitDomainService } from '../../unit/application/unit-domain.service';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { DomainEventPublisher } from '../../platform/events/domain-event-publisher.service';
import { VoucherConcurrencyConflictError } from '../domain/repositories/voucher.repository.interface';
import type { IVoucherRepository } from '../domain/repositories/voucher.repository.interface';
import type { VoucherEntity } from '../domain/entities/voucher.entity';
import {
  CHECKOUT_COMPLETED_EVENT,
  CHECKOUT_FAILED_EVENT,
} from '../domain/events/checkout.events';
import { POINT_USED_EVENT } from '../../customer-point/domain/events/customer-point.events';
import { CheckoutOperationService } from './checkout-operation.service';
import { ActorContext, CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let cartDomainService: jest.Mocked<
    Pick<CartDomainService, 'findByUserId' | 'clearAfterCheckout'>
  >;
  let customerDomainService: jest.Mocked<
    Pick<CustomerDomainService, 'findActiveById'>
  >;
  let customerPointDomainService: jest.Mocked<
    Pick<CustomerPointDomainService, 'usePoint'>
  >;
  let inventoryDomainService: jest.Mocked<
    Pick<InventoryDomainService, 'decrease'>
  >;
  let voucherRepository: jest.Mocked<IVoucherRepository>;
  let invoiceService: jest.Mocked<
    Pick<InvoiceService, 'createInvoice' | 'getById'>
  >;
  let paymentService: jest.Mocked<
    Pick<PaymentService, 'createPayment' | 'getById'>
  >;
  let productDomainService: jest.Mocked<Pick<ProductDomainService, 'findById'>>;
  let unitDomainService: jest.Mocked<
    Pick<UnitDomainService, 'findByIdForReference'>
  >;
  let checkoutOperationService: jest.Mocked<
    Pick<CheckoutOperationService, 'reserve' | 'markCompleted' | 'markFailed'>
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;
  let eventPublisher: jest.Mocked<Pick<DomainEventPublisher, 'publish'>>;
  let prisma: { $transaction: jest.Mock };

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };
  const idempotencyKey = 'idem-key-1';

  const cart: CartEntity = {
    organizationId: 'org-1',
    userId: 'user-1',
    items: [
      {
        productId: 'prod-1',
        productName: 'Áo thun',
        quantity: '2.000',
        price: '100000.00',
        discount: '0.00',
        promotion: '0.00',
        voucher: '0.00',
        tax: '20000.00',
        total: '220000.00',
      },
    ],
    subtotal: '200000.00',
    totalDiscount: '0.00',
    totalPromotion: '0.00',
    totalVoucher: '0.00',
    totalTax: '20000.00',
    totalAmount: '220000.00',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const baseDto: CheckoutDto = {
    branchId: 'branch-1',
    warehouseId: 'wh-1',
    paymentMethod: 'CASH',
  };

  const invoiceResponse = {
    id: 'inv-1',
    branchId: 'branch-1',
    orderId: null,
    customerId: null,
    code: 'HD000001',
    status: 'PAID',
    totalAmount: '220000.00',
    paidAmount: '220000.00',
    dueAmount: '0.00',
    dueDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    items: [],
  } as never;

  const paymentResponse = {
    id: 'pay-1',
    branchId: 'branch-1',
    invoiceId: 'inv-1',
    customerId: null,
    method: 'CASH',
    amount: '220000.00',
    paidAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
  } as never;

  const productFixture = {
    id: 'prod-1',
    unitId: 'unit-1',
    sku: 'SP000001',
    name: 'Áo thun',
    type: 'STANDARD',
  } as never;

  const serviceProductFixture = {
    id: 'prod-2',
    unitId: 'unit-1',
    sku: 'SP000002',
    name: 'Phí giao hàng',
    type: 'SERVICE',
  } as never;

  const unitFixture = {
    id: 'unit-1',
    name: 'Cái',
  } as never;

  const activeVoucher: VoucherEntity = {
    id: 'voucher-1',
    code: 'SALE10',
    type: 'PERCENTAGE',
    value: '10',
    minOrderAmount: null,
    maxDiscount: null,
    usageLimit: null,
    usedCount: 0,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2027-01-01'),
    status: 'ACTIVE',
  };

  beforeEach(() => {
    cartDomainService = {
      findByUserId: jest.fn().mockResolvedValue(cart),
      clearAfterCheckout: jest.fn(),
    };
    customerDomainService = { findActiveById: jest.fn() };
    customerPointDomainService = { usePoint: jest.fn() };
    inventoryDomainService = {
      decrease: jest
        .fn()
        .mockResolvedValue({ movement: {}, avgCostAfter: '0' }),
    };
    voucherRepository = {
      findActiveByCode: jest.fn(),
      incrementUsage: jest.fn(),
    };
    invoiceService = {
      createInvoice: jest.fn().mockResolvedValue(invoiceResponse),
      getById: jest.fn(),
    };
    paymentService = {
      createPayment: jest.fn().mockResolvedValue(paymentResponse),
      getById: jest.fn(),
    };
    productDomainService = {
      findById: jest.fn().mockResolvedValue(productFixture),
    };
    unitDomainService = {
      findByIdForReference: jest.fn().mockResolvedValue(unitFixture),
    };
    checkoutOperationService = {
      reserve: jest
        .fn()
        .mockResolvedValue({ kind: 'NEW', operationId: 'op-1' }),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    eventPublisher = { publish: jest.fn() };
    prisma = {
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({})),
    };

    const discountEngine = new DiscountEngineService([
      new PercentDiscountStrategy(),
      new AmountDiscountStrategy(),
      new FixedPriceDiscountStrategy(),
      new BuyXGetYDiscountStrategy(),
    ]);

    service = new CheckoutService(
      prisma as unknown as PrismaService,
      cartDomainService as unknown as CartDomainService,
      customerDomainService as unknown as CustomerDomainService,
      customerPointDomainService as unknown as CustomerPointDomainService,
      inventoryDomainService as unknown as InventoryDomainService,
      voucherRepository,
      discountEngine,
      invoiceService as unknown as InvoiceService,
      paymentService as unknown as PaymentService,
      productDomainService as unknown as ProductDomainService,
      unitDomainService as unknown as UnitDomainService,
      checkoutOperationService as unknown as CheckoutOperationService,
      auditLogService as unknown as AuditLogService,
      eventPublisher as unknown as DomainEventPublisher,
    );
  });

  describe('[T013] Idempotency — reserve() luôn được gọi đầu tiên', () => {
    it('gọi reserve() với branchId/idempotencyKey/payload/createdBy trước khi làm gì khác', async () => {
      await service.checkout(baseDto, actor, idempotencyKey);
      expect(checkoutOperationService.reserve).toHaveBeenCalledWith({
        organizationId: 'org-1',
        branchId: 'branch-1',
        idempotencyKey,
        payload: baseDto,
        createdBy: 'user-1',
      });
    });

    it('REPLAY — trả lại Invoice/Payment cũ, không đụng Cart/Inventory/Transaction', async () => {
      checkoutOperationService.reserve.mockResolvedValue({
        kind: 'REPLAY',
        invoiceId: 'inv-old',
        paymentId: 'pay-old',
      });
      invoiceService.getById.mockResolvedValue({ id: 'inv-old' } as never);
      paymentService.getById.mockResolvedValue({ id: 'pay-old' } as never);

      const result = await service.checkout(baseDto, actor, idempotencyKey);

      expect(result).toEqual({
        invoice: { id: 'inv-old' },
        payment: { id: 'pay-old' },
      });
      expect(cartDomainService.findByUserId).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(invoiceService.createInvoice).not.toHaveBeenCalled();
      expect(inventoryDomainService.decrease).not.toHaveBeenCalled();
    });

    it('reserve() ném ConflictException (key trùng payload khác/đang xử lý) — propagate thẳng, không markFailed', async () => {
      checkoutOperationService.reserve.mockRejectedValue(
        new ConflictException('idempotency conflict'),
      );
      await expect(
        service.checkout(baseDto, actor, idempotencyKey),
      ).rejects.toThrow(ConflictException);
      expect(checkoutOperationService.markFailed).not.toHaveBeenCalled();
    });

    it('checkout thành công — gọi markCompleted(tx) BÊN TRONG transaction trước khi trả kết quả', async () => {
      await service.checkout(baseDto, actor, idempotencyKey);
      expect(checkoutOperationService.markCompleted).toHaveBeenCalledWith(
        'op-1',
        'inv-1',
        'pay-1',
        expect.anything(),
      );
    });
  });

  describe('validation trước khi mở transaction (sau reserve() NEW)', () => {
    it('ném UnprocessableEntityException khi giỏ hàng trống, markFailed(operationId) được gọi', async () => {
      cartDomainService.findByUserId.mockResolvedValue(null);
      await expect(
        service.checkout(baseDto, actor, idempotencyKey),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(checkoutOperationService.markFailed).toHaveBeenCalledWith('op-1');
    });

    it('ném UnprocessableEntityException khi giỏ hàng có nhưng rỗng items', async () => {
      cartDomainService.findByUserId.mockResolvedValue({
        ...cart,
        items: [],
      });
      await expect(
        service.checkout(baseDto, actor, idempotencyKey),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('ném NotFoundException khi customerId không tồn tại, markFailed được gọi', async () => {
      customerDomainService.findActiveById.mockResolvedValue(null);
      await expect(
        service.checkout(
          { ...baseDto, customerId: 'cus-x' },
          actor,
          idempotencyKey,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(checkoutOperationService.markFailed).toHaveBeenCalledWith('op-1');
    });

    it('[T013 Phase 5] ném NotFoundException khi Product của dòng hàng không tồn tại, markFailed được gọi', async () => {
      productDomainService.findById.mockResolvedValue(null);
      await expect(
        service.checkout(baseDto, actor, idempotencyKey),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(checkoutOperationService.markFailed).toHaveBeenCalledWith('op-1');
    });

    it('[T013 Phase 5] ném NotFoundException khi Unit của Product không tồn tại, markFailed được gọi', async () => {
      unitDomainService.findByIdForReference.mockResolvedValue(null);
      await expect(
        service.checkout(baseDto, actor, idempotencyKey),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(checkoutOperationService.markFailed).toHaveBeenCalledWith('op-1');
    });

    it('ném khi voucher không tồn tại', async () => {
      voucherRepository.findActiveByCode.mockResolvedValue(null);
      await expect(
        service.checkout(
          { ...baseDto, voucherCode: 'NOPE' },
          actor,
          idempotencyKey,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(checkoutOperationService.markFailed).toHaveBeenCalledWith('op-1');
    });

    it('ném khi voucher đã hết hạn', async () => {
      voucherRepository.findActiveByCode.mockResolvedValue({
        ...activeVoucher,
        endDate: new Date('2020-01-01'),
      });
      await expect(
        service.checkout(
          { ...baseDto, voucherCode: 'SALE10' },
          actor,
          idempotencyKey,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('ném khi voucher đã hết lượt sử dụng', async () => {
      voucherRepository.findActiveByCode.mockResolvedValue({
        ...activeVoucher,
        usageLimit: 5,
        usedCount: 5,
      });
      await expect(
        service.checkout(
          { ...baseDto, voucherCode: 'SALE10' },
          actor,
          idempotencyKey,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('ném khi đơn hàng chưa đạt minOrderAmount của voucher', async () => {
      voucherRepository.findActiveByCode.mockResolvedValue({
        ...activeVoucher,
        minOrderAmount: '999999999',
      });
      await expect(
        service.checkout(
          { ...baseDto, voucherCode: 'SALE10' },
          actor,
          idempotencyKey,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('luồng thành công', () => {
    it('checkout tối giản (không customer/voucher/point/discount) — dùng đúng subtotal+tax', async () => {
      const result = await service.checkout(baseDto, actor, idempotencyKey);

      expect(invoiceService.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAmount: 220000,
          paidAmount: 220000,
          customerCodeSnapshot: null,
          customerNameSnapshot: null,
          customerPhoneSnapshot: null,
          items: [
            expect.objectContaining({
              productId: 'prod-1',
              productCodeSnapshot: 'SP000001',
              productNameSnapshot: 'Áo thun',
              unitNameSnapshot: 'Cái',
              barcodeId: null,
              barcodeSnapshot: null,
            }),
          ],
        }),
        expect.anything(),
      );
      expect(paymentService.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 220000, invoiceId: 'inv-1' }),
        expect.anything(),
      );
      expect(inventoryDomainService.decrease).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          productId: 'prod-1',
          quantity: 2,
          movementType: 'SALE',
          referenceType: 'POS',
          referenceId: 'inv-1',
        }),
      );
      expect(cartDomainService.clearAfterCheckout).toHaveBeenCalledWith(
        'org-1',
        'user-1',
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        CHECKOUT_COMPLETED_EVENT,
        expect.objectContaining({ invoiceId: 'inv-1', paymentId: 'pay-1' }),
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'checkout.completed',
          entityId: 'inv-1',
        }),
      );
      expect(result.invoice.id).toBe('inv-1');
      expect(result.payment.id).toBe('pay-1');
    });

    it('áp Manual discount (PERCENT 10%) — giảm đúng trên subtotal, cộng lại tax nguyên', async () => {
      await service.checkout(
        { ...baseDto, manualDiscount: { type: 'PERCENT', value: 10 } },
        actor,
        idempotencyKey,
      );
      // subtotal 200000 - 10% = 180000, + tax 20000 = 200000
      expect(invoiceService.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: 200000 }),
        expect.anything(),
      );
    });

    it('dùng điểm tích lũy — trừ đúng vào phần còn lại, publish POINT_USED_EVENT', async () => {
      customerDomainService.findActiveById.mockResolvedValue({
        id: 'cus-1',
      } as never);
      customerPointDomainService.usePoint.mockResolvedValue({
        id: 'ledger-1',
        organizationId: 'org-1',
        customerId: 'cus-1',
        referenceType: 'CHECKOUT',
        referenceId: null,
        point: -50000,
        balance: 50000,
        expiredAt: null,
        createdAt: new Date('2026-01-01'),
      });

      await service.checkout(
        { ...baseDto, customerId: 'cus-1', pointsToUse: 50000 },
        actor,
        idempotencyKey,
      );

      // subtotal 200000 - point 50000 = 150000, + tax 20000 = 170000
      expect(invoiceService.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: 170000 }),
        expect.anything(),
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        POINT_USED_EVENT,
        expect.objectContaining({ customerId: 'cus-1', balance: 50000 }),
      );
    });

    it('ném UnprocessableEntityException khi pointsToUse vượt quá giá trị đơn hàng còn lại, markFailed được gọi', async () => {
      customerDomainService.findActiveById.mockResolvedValue({
        id: 'cus-1',
      } as never);
      await expect(
        service.checkout(
          { ...baseDto, customerId: 'cus-1', pointsToUse: 999999 },
          actor,
          idempotencyKey,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(customerPointDomainService.usePoint).not.toHaveBeenCalled();
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        CHECKOUT_FAILED_EVENT,
        expect.anything(),
      );
      expect(checkoutOperationService.markFailed).toHaveBeenCalledWith('op-1');
    });

    it('áp Voucher PERCENTAGE — tính đúng và tăng usedCount', async () => {
      voucherRepository.findActiveByCode.mockResolvedValue(activeVoucher);
      voucherRepository.incrementUsage.mockResolvedValue(undefined);

      await service.checkout(
        { ...baseDto, voucherCode: 'SALE10' },
        actor,
        idempotencyKey,
      );

      // subtotal 200000 - 10% = 180000, + tax 20000 = 200000
      expect(invoiceService.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: 200000 }),
        expect.anything(),
      );
      expect(voucherRepository.incrementUsage).toHaveBeenCalledWith(
        'voucher-1',
        0,
        expect.anything(),
      );
    });

    it('[T013 Phase 5] có Customer — ghi customerCodeSnapshot/customerNameSnapshot/customerPhoneSnapshot', async () => {
      customerDomainService.findActiveById.mockResolvedValue({
        id: 'cus-1',
        code: 'KH000001',
        fullName: 'Nguyễn Văn A',
        phone: '0900000000',
      } as never);

      await service.checkout(
        { ...baseDto, customerId: 'cus-1' },
        actor,
        idempotencyKey,
      );

      expect(invoiceService.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          customerCodeSnapshot: 'KH000001',
          customerNameSnapshot: 'Nguyễn Văn A',
          customerPhoneSnapshot: '0900000000',
        }),
        expect.anything(),
      );
    });
  });

  describe('[T013 Phase 6] Service Product — không trừ tồn kho', () => {
    const mixedCart: CartEntity = {
      ...cart,
      items: [
        ...cart.items,
        {
          productId: 'prod-2',
          productName: 'Phí giao hàng',
          quantity: '1.000',
          price: '50000.00',
          discount: '0.00',
          promotion: '0.00',
          voucher: '0.00',
          tax: '0.00',
          total: '50000.00',
        },
      ],
    };

    it('giỏ hàng hỗn hợp (STOCK + SERVICE) — chỉ trừ tồn dòng STOCK, dòng SERVICE vẫn lên Invoice', async () => {
      cartDomainService.findByUserId.mockResolvedValue(mixedCart);
      productDomainService.findById.mockImplementation((productId) =>
        Promise.resolve(
          productId === 'prod-2' ? serviceProductFixture : productFixture,
        ),
      );

      await service.checkout(baseDto, actor, idempotencyKey);

      expect(inventoryDomainService.decrease).toHaveBeenCalledTimes(1);
      expect(inventoryDomainService.decrease).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ productId: 'prod-1' }),
      );
      expect(invoiceService.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ productId: 'prod-2' }),
          ]),
        }),
        expect.anything(),
      );
    });

    it('giỏ hàng toàn SERVICE — không gọi InventoryDomainService.decrease() lần nào', async () => {
      cartDomainService.findByUserId.mockResolvedValue({
        ...cart,
        items: [
          {
            productId: 'prod-2',
            productName: 'Phí giao hàng',
            quantity: '1.000',
            price: '50000.00',
            discount: '0.00',
            promotion: '0.00',
            voucher: '0.00',
            tax: '0.00',
            total: '50000.00',
          },
        ],
      });
      productDomainService.findById.mockResolvedValue(serviceProductFixture);

      const result = await service.checkout(baseDto, actor, idempotencyKey);

      expect(inventoryDomainService.decrease).not.toHaveBeenCalled();
      expect(result.invoice.id).toBe('inv-1');
    });
  });

  describe('rollback khi có lỗi giữa transaction — markFailed(operationId) luôn được gọi', () => {
    it('map InventoryInsufficientStockError -> 422, không xóa cart, publish CHECKOUT_FAILED_EVENT, markFailed', async () => {
      inventoryDomainService.decrease.mockRejectedValue(
        new InventoryInsufficientStockError('prod-1', '0'),
      );

      await expect(
        service.checkout(baseDto, actor, idempotencyKey),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(cartDomainService.clearAfterCheckout).not.toHaveBeenCalled();
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        CHECKOUT_FAILED_EVENT,
        expect.anything(),
      );
      expect(checkoutOperationService.markFailed).toHaveBeenCalledWith('op-1');
    });

    it('map InventoryConcurrencyConflictError -> 409', async () => {
      inventoryDomainService.decrease.mockRejectedValue(
        new InventoryConcurrencyConflictError('prod-1'),
      );
      await expect(
        service.checkout(baseDto, actor, idempotencyKey),
      ).rejects.toThrow(ConflictException);
      expect(checkoutOperationService.markFailed).toHaveBeenCalledWith('op-1');
    });

    it('map CustomerPointInsufficientBalanceError -> 422', async () => {
      customerDomainService.findActiveById.mockResolvedValue({
        id: 'cus-1',
      } as never);
      customerPointDomainService.usePoint.mockRejectedValue(
        new CustomerPointInsufficientBalanceError('cus-1', 10),
      );
      await expect(
        service.checkout(
          { ...baseDto, customerId: 'cus-1', pointsToUse: 100 },
          actor,
          idempotencyKey,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('map VoucherConcurrencyConflictError -> 409', async () => {
      voucherRepository.findActiveByCode.mockResolvedValue(activeVoucher);
      voucherRepository.incrementUsage.mockRejectedValue(
        new VoucherConcurrencyConflictError('voucher-1'),
      );
      await expect(
        service.checkout(
          { ...baseDto, voucherCode: 'SALE10' },
          actor,
          idempotencyKey,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('[RC Validation Lite] Kịch bản kết hợp thực tế (không cần Postgres/Redis thật)', () => {
    const realisticCart: CartEntity = {
      ...cart,
      items: [
        {
          productId: 'prod-1',
          productName: 'Áo thun',
          quantity: '2.000',
          price: '100000.00',
          discount: '0.00',
          promotion: '0.00',
          voucher: '0.00',
          tax: '20000.00',
          total: '220000.00',
        },
        {
          productId: 'prod-2',
          productName: 'Phí giao hàng',
          quantity: '1.000',
          price: '50000.00',
          discount: '0.00',
          promotion: '0.00',
          voucher: '0.00',
          tax: '0.00',
          total: '50000.00',
        },
      ],
      subtotal: '250000.00',
      totalTax: '20000.00',
    };

    it('Customer + điểm tích lũy + STOCK+SERVICE + phương thức thanh toán E_WALLET — trong CÙNG 1 lần checkout', async () => {
      cartDomainService.findByUserId.mockResolvedValue(realisticCart);
      productDomainService.findById.mockImplementation((productId) =>
        Promise.resolve(
          productId === 'prod-2' ? serviceProductFixture : productFixture,
        ),
      );
      customerDomainService.findActiveById.mockResolvedValue({
        id: 'cus-1',
        code: 'KH000001',
        fullName: 'Nguyễn Văn A',
        phone: '0900000000',
      } as never);
      customerPointDomainService.usePoint.mockResolvedValue({
        id: 'ledger-1',
        organizationId: 'org-1',
        customerId: 'cus-1',
        referenceType: 'CHECKOUT',
        referenceId: null,
        point: -30000,
        balance: 20000,
        expiredAt: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.checkout(
        {
          ...baseDto,
          customerId: 'cus-1',
          pointsToUse: 30000,
          paymentMethod: 'E_WALLET',
        },
        actor,
        idempotencyKey,
      );

      // subtotal 250000 - point 30000 = 220000, + tax 20000 = 240000
      expect(invoiceService.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAmount: 240000,
          paidAmount: 240000,
          customerCodeSnapshot: 'KH000001',
          customerNameSnapshot: 'Nguyễn Văn A',
          customerPhoneSnapshot: '0900000000',
          items: [
            expect.objectContaining({
              productId: 'prod-1',
              productCodeSnapshot: 'SP000001',
              unitNameSnapshot: 'Cái',
            }),
            expect.objectContaining({
              productId: 'prod-2',
              productCodeSnapshot: 'SP000002',
              unitNameSnapshot: 'Cái',
            }),
          ],
        }),
        expect.anything(),
      );
      expect(paymentService.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 240000, method: 'E_WALLET' }),
        expect.anything(),
      );
      // Chỉ trừ tồn dòng STOCK (prod-1), không đụng dòng SERVICE (prod-2)
      expect(inventoryDomainService.decrease).toHaveBeenCalledTimes(1);
      expect(inventoryDomainService.decrease).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ productId: 'prod-1' }),
      );
      expect(result.invoice.id).toBe('inv-1');
      expect(result.payment.id).toBe('pay-1');
    });

    it.each(['CASH', 'BANK_TRANSFER', 'CARD', 'E_WALLET'] as const)(
      'phương thức thanh toán %s truyền đúng xuống PaymentService, không đổi hành vi Checkout',
      async (paymentMethod) => {
        await service.checkout(
          { ...baseDto, paymentMethod },
          actor,
          idempotencyKey,
        );
        expect(paymentService.createPayment).toHaveBeenCalledWith(
          expect.objectContaining({ method: paymentMethod }),
          expect.anything(),
        );
      },
    );

    it('[Application-level race proxy] 2 lần gọi checkout() đồng thời cùng idempotencyKey — lần 2 REPLAY, không chạy lại transaction/Inventory', async () => {
      // Giả lập đúng những gì reserve() thật sẽ trả về khi 2 request đua nhau tới với CÙNG
      // idempotencyKey: request thắng race → NEW, request thua (query sau khi request kia đã
      // COMPLETED) → REPLAY. Đây là proxy ở mức application logic — KHÔNG thay thế cho concurrency
      // test thật trên Postgres (row lock/unique constraint race), vốn cần Docker/Postgres thật
      // (xem RC Validation Report — mục "Không kiểm chứng được trong môi trường này").
      let callCount = 0;
      checkoutOperationService.reserve.mockImplementation(() => {
        callCount += 1;
        return Promise.resolve(
          callCount === 1
            ? { kind: 'NEW', operationId: 'op-1' }
            : { kind: 'REPLAY', invoiceId: 'inv-1', paymentId: 'pay-1' },
        );
      });
      invoiceService.getById.mockResolvedValue(invoiceResponse);
      paymentService.getById.mockResolvedValue(paymentResponse);

      const [first, second] = await Promise.all([
        service.checkout(baseDto, actor, idempotencyKey),
        service.checkout(baseDto, actor, idempotencyKey),
      ]);

      expect(first.invoice.id).toBe('inv-1');
      expect(second.invoice.id).toBe('inv-1');
      // Toàn bộ Business Transaction (Invoice/Payment/Inventory) chỉ chạy đúng 1 lần cho request
      // NEW — request REPLAY không tạo thêm Invoice/Payment/Inventory Movement nào.
      expect(invoiceService.createInvoice).toHaveBeenCalledTimes(1);
      expect(inventoryDomainService.decrease).toHaveBeenCalledTimes(1);
    });
  });
});
