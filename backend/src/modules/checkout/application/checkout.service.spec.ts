import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ICartRepository } from '../../cart/domain/repositories/cart.repository.interface';
import { CartEntity } from '../../cart/domain/entities/cart.entity';
import type { ICustomerRepository } from '../../customer/domain/repositories/customer.repository.interface';
import { CustomerPointInsufficientBalanceError } from '../../customer-point/domain/repositories/customer-point.repository.interface';
import type { ICustomerPointRepository } from '../../customer-point/domain/repositories/customer-point.repository.interface';
import {
  InventoryConcurrencyConflictError,
  InventoryInsufficientStockError,
} from '../../inventory/domain/repositories/inventory.repository.interface';
import type { IInventoryRepository } from '../../inventory/domain/repositories/inventory.repository.interface';
import { DiscountEngineService } from '../../discount/application/discount-engine.service';
import { AmountDiscountStrategy } from '../../discount/infrastructure/strategies/amount-discount.strategy';
import { BuyXGetYDiscountStrategy } from '../../discount/infrastructure/strategies/buy-x-get-y-discount.strategy';
import { FixedPriceDiscountStrategy } from '../../discount/infrastructure/strategies/fixed-price-discount.strategy';
import { PercentDiscountStrategy } from '../../discount/infrastructure/strategies/percent-discount.strategy';
import { InvoiceService } from '../../invoice/application/invoice.service';
import { PaymentService } from '../../payment/application/payment.service';
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
import { ActorContext, CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let cartRepository: jest.Mocked<ICartRepository>;
  let customerRepository: jest.Mocked<Pick<ICustomerRepository, 'findById'>>;
  let customerPointRepository: jest.Mocked<ICustomerPointRepository>;
  let inventoryRepository: jest.Mocked<IInventoryRepository>;
  let voucherRepository: jest.Mocked<IVoucherRepository>;
  let invoiceService: jest.Mocked<Pick<InvoiceService, 'createInvoice'>>;
  let paymentService: jest.Mocked<Pick<PaymentService, 'createPayment'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;
  let eventPublisher: jest.Mocked<Pick<DomainEventPublisher, 'publish'>>;
  let prisma: { $transaction: jest.Mock };

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

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
    cartRepository = {
      findByUserId: jest.fn().mockResolvedValue(cart),
      save: jest.fn(),
      delete: jest.fn(),
    };
    customerRepository = { findById: jest.fn() };
    customerPointRepository = {
      addPoint: jest.fn(),
      usePoint: jest.fn(),
      getHistory: jest.fn(),
      getBalance: jest.fn(),
    };
    inventoryRepository = {
      search: jest.fn(),
      getByProduct: jest.fn(),
      getHistory: jest.fn(),
      recordMovement: jest.fn(),
      recordSaleMovement: jest.fn().mockResolvedValue({}),
    };
    voucherRepository = {
      findActiveByCode: jest.fn(),
      incrementUsage: jest.fn(),
    };
    invoiceService = {
      createInvoice: jest.fn().mockResolvedValue(invoiceResponse),
    };
    paymentService = {
      createPayment: jest.fn().mockResolvedValue(paymentResponse),
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
      cartRepository,
      customerRepository as unknown as ICustomerRepository,
      customerPointRepository,
      inventoryRepository,
      voucherRepository,
      discountEngine,
      invoiceService as unknown as InvoiceService,
      paymentService as unknown as PaymentService,
      auditLogService as unknown as AuditLogService,
      eventPublisher as unknown as DomainEventPublisher,
    );
  });

  describe('validation trước khi mở transaction', () => {
    it('ném UnprocessableEntityException khi giỏ hàng trống', async () => {
      cartRepository.findByUserId.mockResolvedValue(null);
      await expect(service.checkout(baseDto, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ném UnprocessableEntityException khi giỏ hàng có nhưng rỗng items', async () => {
      cartRepository.findByUserId.mockResolvedValue({ ...cart, items: [] });
      await expect(service.checkout(baseDto, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('ném NotFoundException khi customerId không tồn tại', async () => {
      customerRepository.findById.mockResolvedValue(null);
      await expect(
        service.checkout({ ...baseDto, customerId: 'cus-x' }, actor),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ném khi voucher không tồn tại', async () => {
      voucherRepository.findActiveByCode.mockResolvedValue(null);
      await expect(
        service.checkout({ ...baseDto, voucherCode: 'NOPE' }, actor),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ném khi voucher đã hết hạn', async () => {
      voucherRepository.findActiveByCode.mockResolvedValue({
        ...activeVoucher,
        endDate: new Date('2020-01-01'),
      });
      await expect(
        service.checkout({ ...baseDto, voucherCode: 'SALE10' }, actor),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('ném khi voucher đã hết lượt sử dụng', async () => {
      voucherRepository.findActiveByCode.mockResolvedValue({
        ...activeVoucher,
        usageLimit: 5,
        usedCount: 5,
      });
      await expect(
        service.checkout({ ...baseDto, voucherCode: 'SALE10' }, actor),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('ném khi đơn hàng chưa đạt minOrderAmount của voucher', async () => {
      voucherRepository.findActiveByCode.mockResolvedValue({
        ...activeVoucher,
        minOrderAmount: '999999999',
      });
      await expect(
        service.checkout({ ...baseDto, voucherCode: 'SALE10' }, actor),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('luồng thành công', () => {
    it('checkout tối giản (không customer/voucher/point/discount) — dùng đúng subtotal+tax', async () => {
      const result = await service.checkout(baseDto, actor);

      expect(invoiceService.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: 220000, paidAmount: 220000 }),
        expect.anything(),
      );
      expect(paymentService.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 220000, invoiceId: 'inv-1' }),
        expect.anything(),
      );
      expect(inventoryRepository.recordSaleMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          quantity: 2,
          referenceId: 'inv-1',
        }),
        expect.anything(),
      );
      expect(cartRepository.delete).toHaveBeenCalledWith('org-1', 'user-1');
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
      );
      // subtotal 200000 - 10% = 180000, + tax 20000 = 200000
      expect(invoiceService.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: 200000 }),
        expect.anything(),
      );
    });

    it('dùng điểm tích lũy — trừ đúng vào phần còn lại, publish POINT_USED_EVENT', async () => {
      customerRepository.findById.mockResolvedValue({ id: 'cus-1' } as never);
      customerPointRepository.usePoint.mockResolvedValue({
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

    it('ném UnprocessableEntityException khi pointsToUse vượt quá giá trị đơn hàng còn lại', async () => {
      customerRepository.findById.mockResolvedValue({ id: 'cus-1' } as never);
      await expect(
        service.checkout(
          { ...baseDto, customerId: 'cus-1', pointsToUse: 999999 },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(customerPointRepository.usePoint).not.toHaveBeenCalled();
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        CHECKOUT_FAILED_EVENT,
        expect.anything(),
      );
    });

    it('áp Voucher PERCENTAGE — tính đúng và tăng usedCount', async () => {
      voucherRepository.findActiveByCode.mockResolvedValue(activeVoucher);
      voucherRepository.incrementUsage.mockResolvedValue(undefined);

      await service.checkout({ ...baseDto, voucherCode: 'SALE10' }, actor);

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
  });

  describe('rollback khi có lỗi giữa transaction', () => {
    it('map InventoryInsufficientStockError -> 422, không xóa cart, publish CHECKOUT_FAILED_EVENT', async () => {
      inventoryRepository.recordSaleMovement.mockRejectedValue(
        new InventoryInsufficientStockError('prod-1', '0'),
      );

      await expect(service.checkout(baseDto, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(cartRepository.delete).not.toHaveBeenCalled();
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        CHECKOUT_FAILED_EVENT,
        expect.anything(),
      );
    });

    it('map InventoryConcurrencyConflictError -> 409', async () => {
      inventoryRepository.recordSaleMovement.mockRejectedValue(
        new InventoryConcurrencyConflictError('prod-1'),
      );
      await expect(service.checkout(baseDto, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('map CustomerPointInsufficientBalanceError -> 422', async () => {
      customerRepository.findById.mockResolvedValue({ id: 'cus-1' } as never);
      customerPointRepository.usePoint.mockRejectedValue(
        new CustomerPointInsufficientBalanceError('cus-1', 10),
      );
      await expect(
        service.checkout(
          { ...baseDto, customerId: 'cus-1', pointsToUse: 100 },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('map VoucherConcurrencyConflictError -> 409', async () => {
      voucherRepository.findActiveByCode.mockResolvedValue(activeVoucher);
      voucherRepository.incrementUsage.mockRejectedValue(
        new VoucherConcurrencyConflictError('voucher-1'),
      );
      await expect(
        service.checkout({ ...baseDto, voucherCode: 'SALE10' }, actor),
      ).rejects.toThrow(ConflictException);
    });
  });
});
