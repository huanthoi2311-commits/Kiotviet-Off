import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { SupplierEntity } from '../../supplier/domain/entities/supplier.entity';
import { ISupplierRepository } from '../../supplier/domain/repositories/supplier.repository.interface';
import { SupplierPaymentEntity } from '../domain/entities/supplier-debt.entity';
import {
  ISupplierDebtRepository,
  SupplierPaymentExceedsBalanceError,
} from '../domain/repositories/supplier-debt.repository.interface';
import { ActorContext, SupplierDebtService } from './supplier-debt.service';

describe('SupplierDebtService', () => {
  let service: SupplierDebtService;
  let supplierDebtRepository: jest.Mocked<ISupplierDebtRepository>;
  let supplierRepository: jest.Mocked<Pick<ISupplierRepository, 'findById'>>;
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
    supplierRepository = { findById: jest.fn() };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new SupplierDebtService(
      supplierDebtRepository,
      supplierRepository as unknown as ISupplierRepository,
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
      supplierRepository.findById.mockResolvedValue(null);
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
      supplierRepository.findById.mockResolvedValue(makeSupplier());
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

    it('dịch SupplierPaymentExceedsBalanceError sang UnprocessableEntityException', async () => {
      supplierRepository.findById.mockResolvedValue(makeSupplier());
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
