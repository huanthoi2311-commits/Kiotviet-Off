import { PrismaService } from '../../../../prisma/prisma.service';
import { CustomerPointInsufficientBalanceError } from '../../domain/repositories/customer-point.repository.interface';
import { PrismaCustomerPointRepository } from './prisma-customer-point.repository';

const rawEntry = {
  id: 'ledger-1',
  organizationId: 'org-1',
  customerId: 'cus-1',
  referenceType: 'ORDER',
  referenceId: 'order-1',
  point: 100,
  balance: 100,
  expiredAt: null,
  createdBy: 'user-1',
  createdAt: new Date('2026-01-01'),
};

describe('PrismaCustomerPointRepository', () => {
  let repository: PrismaCustomerPointRepository;
  let prisma: {
    customerPointLedger: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  function makeTx(lastEntry: unknown) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      customerPointLedger: {
        findFirst: jest.fn().mockResolvedValue(lastEntry),
        create: jest.fn().mockResolvedValue(rawEntry),
      },
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn(tx)),
    );
    return tx;
  }

  beforeEach(() => {
    prisma = {
      customerPointLedger: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    repository = new PrismaCustomerPointRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('addPoint', () => {
    const input = {
      organizationId: 'org-1',
      customerId: 'cus-1',
      point: 100,
      createdBy: 'user-1',
    };

    it('khóa dòng Customer, cộng điểm từ 0 khi chưa có lịch sử', async () => {
      const tx = makeTx(null);
      const result = await repository.addPoint(input);

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.customerPointLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ point: 100, balance: 100 }),
        }),
      );
      expect(result.id).toBe('ledger-1');
    });

    it('cộng dồn đúng lên số dư đã có', async () => {
      const tx = makeTx({ balance: 50 });
      await repository.addPoint(input);

      expect(tx.customerPointLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ point: 100, balance: 150 }),
        }),
      );
    });
  });

  describe('usePoint', () => {
    const input = {
      organizationId: 'org-1',
      customerId: 'cus-1',
      point: 30,
      createdBy: 'user-1',
    };

    it('trừ đúng điểm khi đủ số dư, point ghi số âm', async () => {
      const tx = makeTx({ balance: 100 });
      await repository.usePoint(input);

      expect(tx.customerPointLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ point: -30, balance: 70 }),
        }),
      );
    });

    it('ném CustomerPointInsufficientBalanceError khi vượt quá số dư', async () => {
      const tx = makeTx({ balance: 10 });
      await expect(repository.usePoint(input)).rejects.toThrow(
        CustomerPointInsufficientBalanceError,
      );
      expect(tx.customerPointLedger.create).not.toHaveBeenCalled();
    });

    it('ném lỗi khi chưa từng có điểm nào (balance mặc định 0)', async () => {
      makeTx(null);
      await expect(repository.usePoint(input)).rejects.toThrow(
        CustomerPointInsufficientBalanceError,
      );
    });
  });

  describe('getHistory', () => {
    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawEntry], 1]);
      const result = await repository.getHistory({
        organizationId: 'org-1',
        customerId: 'cus-1',
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe('ledger-1');
    });
  });

  describe('getBalance', () => {
    it('trả về balance của dòng gần nhất', async () => {
      prisma.customerPointLedger.findFirst.mockResolvedValue({ balance: 75 });
      await expect(repository.getBalance('org-1', 'cus-1')).resolves.toBe(75);
    });

    it('trả về 0 khi chưa có dòng nào', async () => {
      prisma.customerPointLedger.findFirst.mockResolvedValue(null);
      await expect(repository.getBalance('org-1', 'cus-1')).resolves.toBe(0);
    });
  });
});
