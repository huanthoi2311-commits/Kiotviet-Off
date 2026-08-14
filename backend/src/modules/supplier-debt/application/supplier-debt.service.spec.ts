import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { BranchService } from '../../branch/application/branch.service';
import type { IPurchaseOrderRepository } from '../../purchase-order/domain/repositories/purchase-order.repository.interface';
import { SupplierDomainService } from '../../supplier/application/supplier-domain.service';
import { SupplierEntity } from '../../supplier/domain/entities/supplier.entity';
import { SupplierPaymentEntity } from '../domain/entities/supplier-debt.entity';
import {
  ISupplierDebtRepository,
  SupplierPaymentExceedsBalanceError,
} from '../domain/repositories/supplier-debt.repository.interface';
import { ActorContext, SupplierDebtService } from './supplier-debt.service';

describe('SupplierDebtService', () => {
  let service: SupplierDebtService;
  let supplierDebtRepository: jest.Mocked<ISupplierDebtRepository>;
  let supplierDomainService: jest.Mocked<
    Pick<SupplierDomainService, 'findById'>
  >;
  let branchService: jest.Mocked<Pick<BranchService, 'getById'>>;
  let purchaseOrderRepository: jest.Mocked<
    Pick<IPurchaseOrderRepository, 'findById'>
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeSupplier = (
    overrides: Partial<SupplierEntity> = {},
  ): SupplierEntity =>
    ({
      id: 'supplier-1',
      organizationId: 'org-1',
      code: 'NCC001',
      companyName: 'NCC A',
      ...overrides,
    }) as SupplierEntity;

  const makePayment = (
    overrides: Partial<SupplierPaymentEntity> = {},
  ): SupplierPaymentEntity => ({
    id: 'payment-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    supplierId: 'supplier-1',
    purchaseOrderId: null,
    method: 'CASH',
    amount: '500000',
    paidAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });

  beforeEach(() => {
    supplierDebtRepository = {
      search: jest.fn(),
      getBalance: jest.fn(),
      createPayment: jest.fn(),
    };
    supplierDomainService = { findById: jest.fn() };
    branchService = { getById: jest.fn().mockResolvedValue(undefined) };
    purchaseOrderRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'po-1' }),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new SupplierDebtService(
      supplierDebtRepository,
      purchaseOrderRepository as unknown as IPurchaseOrderRepository,
      supplierDomainService as unknown as SupplierDomainService,
      branchService as unknown as BranchService,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('search', () => {
    it('map query sang search params với page/limit mặc định', async () => {
      supplierDebtRepository.search.mockResolvedValue({
        items: [
          {
            supplierId: 'supplier-1',
            supplierCode: 'NCC001',
            supplierName: 'NCC A',
            totalDebt: '1000000',
            totalPaid: '400000',
            balance: '600000',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await service.search({ search: 'NCC' }, 'org-1');
      expect(result.total).toBe(1);
      expect(result.items[0].balance).toBe('600000');
      expect(supplierDebtRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          search: 'NCC',
          page: 1,
          limit: 20,
        }),
      );
    });
  });

  describe('createPayment', () => {
    it('ném NotFoundException khi supplier không tồn tại', async () => {
      supplierDomainService.findById.mockResolvedValue(null);
      await expect(
        service.createPayment(
          {
            branchId: 'branch-1',
            supplierId: 'supplier-1',
            method: 'CASH',
            amount: 100000,
            paidAt: '2026-01-01T00:00:00.000Z',
          },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('tạo payment thành công và ghi audit log', async () => {
      supplierDomainService.findById.mockResolvedValue(makeSupplier());
      supplierDebtRepository.createPayment.mockResolvedValue(makePayment());

      const result = await service.createPayment(
        {
          branchId: 'branch-1',
          supplierId: 'supplier-1',
          method: 'CASH',
          amount: 500000,
          paidAt: '2026-01-01T00:00:00.000Z',
        },
        actor,
      );

      expect(result.id).toBe('payment-1');
      // T052.01 — branchId phải được xác minh thuộc actor.organizationId qua đúng port công khai
      // đã duyệt (BranchService.getById), TRƯỚC KHI tạo Payment.
      expect(branchService.getById).toHaveBeenCalledWith('branch-1', actor);
      expect(supplierDebtRepository.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          branchId: 'branch-1',
          supplierId: 'supplier-1',
          method: 'CASH',
          amount: 500000,
        }),
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'supplier_payment.create' }),
      );
    });

    // T052.01 — branchId trước đây chảy thẳng vào Payment.create() không qua bất kỳ xác minh
    // organizationId nào (lỗ hổng độc lập phát hiện ở T052.01A). `BranchService.getById` ném
    // ĐÚNG 1 loại lỗi (NotFoundException/BRANCH_NOT_FOUND) cho CẢ 2 trường hợp "branchId không
    // tồn tại" và "branchId thuộc tổ chức khác" — đây CHÍNH LÀ tính chất không-tiết-lộ
    // (non-disclosure): SupplierDebtService không có cách nào (và không cần) phân biệt 2 trường
    // hợp, nên không thể vô tình rò rỉ sự tồn tại cross-tenant qua khác biệt response.
    it('branchId thuộc tổ chức khác bị từ chối với ĐÚNG lỗi 404 như branchId không tồn tại, không tạo Payment', async () => {
      supplierDomainService.findById.mockResolvedValue(makeSupplier());
      const notFound = new NotFoundException(
        withCode(ErrorCode.BRANCH_NOT_FOUND, 'Không tìm thấy chi nhánh'),
      );
      branchService.getById.mockRejectedValue(notFound);

      await expect(
        service.createPayment(
          {
            branchId: 'branch-from-other-org',
            supplierId: 'supplier-1',
            method: 'CASH',
            amount: 100000,
            paidAt: '2026-01-01T00:00:00.000Z',
          },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(supplierDebtRepository.createPayment).not.toHaveBeenCalled();
    });

    it('branchId không tồn tại bị từ chối với CÙNG loại lỗi như branchId thuộc tổ chức khác (không tạo Payment)', async () => {
      supplierDomainService.findById.mockResolvedValue(makeSupplier());
      branchService.getById.mockRejectedValue(
        new NotFoundException(
          withCode(ErrorCode.BRANCH_NOT_FOUND, 'Không tìm thấy chi nhánh'),
        ),
      );

      await expect(
        service.createPayment(
          {
            branchId: 'branch-does-not-exist',
            supplierId: 'supplier-1',
            method: 'CASH',
            amount: 100000,
            paidAt: '2026-01-01T00:00:00.000Z',
          },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(supplierDebtRepository.createPayment).not.toHaveBeenCalled();
    });

    // T052.01C — purchaseOrderId (tùy chọn) trước đây chảy thẳng vào Payment.create() không qua
    // xác minh organizationId nào — cùng lớp lỗ hổng như branchId, phát hiện độc lập trong lần
    // review T052.01B. Tái dùng đúng port đã có sẵn (`PURCHASE_ORDER_REPOSITORY.findById`, cùng
    // pattern PurchaseReturnService đã dùng) — ném ĐÚNG 1 loại lỗi (NotFoundException/
    // PURCHASE_ORDER_NOT_FOUND) cho CẢ 2 trường hợp "không tồn tại" và "thuộc tổ chức khác".
    it('purchaseOrderId thuộc tổ chức khác bị từ chối với lỗi 404 PURCHASE_ORDER_NOT_FOUND, không tạo Payment', async () => {
      supplierDomainService.findById.mockResolvedValue(makeSupplier());
      purchaseOrderRepository.findById.mockResolvedValue(null);

      await expect(
        service.createPayment(
          {
            branchId: 'branch-1',
            supplierId: 'supplier-1',
            purchaseOrderId: 'po-from-other-org',
            method: 'CASH',
            amount: 100000,
            paidAt: '2026-01-01T00:00:00.000Z',
          },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(purchaseOrderRepository.findById).toHaveBeenCalledWith(
        'po-from-other-org',
        'org-1',
      );
      expect(supplierDebtRepository.createPayment).not.toHaveBeenCalled();
    });

    it('purchaseOrderId không tồn tại bị từ chối với CÙNG loại lỗi như purchaseOrderId thuộc tổ chức khác (không tạo Payment)', async () => {
      supplierDomainService.findById.mockResolvedValue(makeSupplier());
      purchaseOrderRepository.findById.mockResolvedValue(null);

      await expect(
        service.createPayment(
          {
            branchId: 'branch-1',
            supplierId: 'supplier-1',
            purchaseOrderId: 'po-does-not-exist',
            method: 'CASH',
            amount: 100000,
            paidAt: '2026-01-01T00:00:00.000Z',
          },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(supplierDebtRepository.createPayment).not.toHaveBeenCalled();
    });

    it('purchaseOrderId cùng tổ chức được chấp nhận, payment tạo bình thường', async () => {
      supplierDomainService.findById.mockResolvedValue(makeSupplier());
      purchaseOrderRepository.findById.mockResolvedValue({
        id: 'po-1',
      } as never);
      supplierDebtRepository.createPayment.mockResolvedValue(
        makePayment({ purchaseOrderId: 'po-1' }),
      );

      const result = await service.createPayment(
        {
          branchId: 'branch-1',
          supplierId: 'supplier-1',
          purchaseOrderId: 'po-1',
          method: 'CASH',
          amount: 500000,
          paidAt: '2026-01-01T00:00:00.000Z',
        },
        actor,
      );

      expect(result.id).toBe('payment-1');
      expect(purchaseOrderRepository.findById).toHaveBeenCalledWith(
        'po-1',
        'org-1',
      );
      expect(supplierDebtRepository.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ purchaseOrderId: 'po-1' }),
      );
    });

    it('purchaseOrderId bị bỏ trống (undefined) giữ nguyên hành vi hiện tại — không gọi purchaseOrderRepository.findById, payment vẫn tạo thành công', async () => {
      supplierDomainService.findById.mockResolvedValue(makeSupplier());
      supplierDebtRepository.createPayment.mockResolvedValue(makePayment());

      const result = await service.createPayment(
        {
          branchId: 'branch-1',
          supplierId: 'supplier-1',
          method: 'CASH',
          amount: 500000,
          paidAt: '2026-01-01T00:00:00.000Z',
        },
        actor,
      );

      expect(result.id).toBe('payment-1');
      expect(purchaseOrderRepository.findById).not.toHaveBeenCalled();
      expect(supplierDebtRepository.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ purchaseOrderId: null }),
      );
    });

    it('dịch SupplierPaymentExceedsBalanceError sang UnprocessableEntityException', async () => {
      supplierDomainService.findById.mockResolvedValue(makeSupplier());
      supplierDebtRepository.createPayment.mockRejectedValue(
        new SupplierPaymentExceedsBalanceError('supplier-1', '100000'),
      );

      await expect(
        service.createPayment(
          {
            branchId: 'branch-1',
            supplierId: 'supplier-1',
            method: 'CASH',
            amount: 999999,
            paidAt: '2026-01-01T00:00:00.000Z',
          },
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
