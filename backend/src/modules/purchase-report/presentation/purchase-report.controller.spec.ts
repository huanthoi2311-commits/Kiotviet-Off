import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { PurchaseReportService } from '../application/purchase-report.service';
import { PurchaseReportController } from './purchase-report.controller';

describe('PurchaseReportController', () => {
  let controller: PurchaseReportController;
  let purchaseReportService: jest.Mocked<
    Pick<
      PurchaseReportService,
      'getDashboard' | 'getBreakdown' | 'exportReport'
    >
  >;
  const reflector = new Reflector();

  const user = {
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: [],
    permissionVersion: 1,
    email: 'a@b.com',
  };

  beforeEach(() => {
    purchaseReportService = {
      getDashboard: jest.fn(),
      getBreakdown: jest.fn(),
      exportReport: jest.fn(),
    };
    controller = new PurchaseReportController(
      purchaseReportService as unknown as PurchaseReportService,
    );
  });

  describe('permission metadata (Prompt 030)', () => {
    it.each([
      ['getDashboard', 'report:view'],
      ['getBreakdown', 'report:view'],
      ['export', 'report:export'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('getDashboard chỉ truyền query và organizationId', async () => {
    purchaseReportService.getDashboard.mockResolvedValue({
      totalAmount: '0',
      totalOrders: 0,
      averageCost: '0',
      topSuppliers: [],
      topProducts: [],
      monthlyPurchase: [],
    });
    const query = { dateFrom: '2026-01-01' } as never;
    await controller.getDashboard(query, user as never);
    expect(purchaseReportService.getDashboard).toHaveBeenCalledWith(
      query,
      'org-1',
    );
  });

  it('getBreakdown chỉ truyền query và organizationId', async () => {
    purchaseReportService.getBreakdown.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { groupBy: 'SUPPLIER' } as never;
    await controller.getBreakdown(query, user as never);
    expect(purchaseReportService.getBreakdown).toHaveBeenCalledWith(
      query,
      'org-1',
    );
  });

  describe('export', () => {
    it('gửi buffer kèm đúng Content-Type/Content-Disposition', async () => {
      const buffer = Buffer.from('fake-xlsx');
      purchaseReportService.exportReport.mockResolvedValue({
        buffer,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileExtension: 'xlsx',
      });
      const setHeader = jest.fn();
      const send = jest.fn();
      const res = { setHeader, send } as unknown as Response;
      const query = { groupBy: 'SUPPLIER', format: 'EXCEL' } as never;

      await controller.export(query, user as never, res);

      expect(purchaseReportService.exportReport).toHaveBeenCalledWith(
        query,
        'org-1',
      );
      expect(setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('purchase-report-supplier.xlsx'),
      );
      expect(send).toHaveBeenCalledWith(buffer);
    });
  });
});
