import { PurchaseReportDashboardEntity } from '../domain/entities/purchase-report.entity';
import { IPurchaseReportRepository } from '../domain/repositories/purchase-report.repository.interface';
import { IPurchaseReportExportPort } from '../domain/services/purchase-report-export.interface';
import { PurchaseReportService } from './purchase-report.service';

describe('PurchaseReportService', () => {
  let service: PurchaseReportService;
  let purchaseReportRepository: jest.Mocked<IPurchaseReportRepository>;
  let exportPort: jest.Mocked<IPurchaseReportExportPort>;

  const makeDashboard = (): PurchaseReportDashboardEntity => ({
    totalAmount: '1000000',
    totalOrders: 10,
    averageCost: '9000',
    topSuppliers: [
      {
        key: 'supplier-1',
        code: 'NCC001',
        label: 'NCC A',
        totalAmount: '500000',
        totalQuantity: '50',
        orderCount: 5,
      },
    ],
    topProducts: [
      {
        key: 'product-1',
        code: 'SP001',
        label: 'Sản phẩm A',
        totalAmount: '300000',
        totalQuantity: '30',
        orderCount: 3,
      },
    ],
    monthlyPurchase: [
      {
        key: '2026-01',
        code: null,
        label: '2026-01',
        totalAmount: '1000000',
        totalQuantity: '100',
        orderCount: 10,
      },
    ],
  });

  beforeEach(() => {
    purchaseReportRepository = {
      getDashboard: jest.fn(),
      getBreakdown: jest.fn(),
    };
    exportPort = {
      buildExcel: jest.fn(),
      buildCsv: jest.fn(),
      buildPdf: jest.fn(),
    };
    service = new PurchaseReportService(purchaseReportRepository, exportPort);
  });

  describe('getDashboard', () => {
    it('map filter sang params kèm organizationId, chuyển đổi entity sang response dto', async () => {
      purchaseReportRepository.getDashboard.mockResolvedValue(makeDashboard());

      const result = await service.getDashboard(
        { dateFrom: '2026-01-01', dateTo: '2026-01-31' },
        'org-1',
      );

      expect(result.totalAmount).toBe('1000000');
      expect(result.topSuppliers[0].code).toBe('NCC001');
      expect(purchaseReportRepository.getDashboard).toHaveBeenCalledWith({
        organizationId: 'org-1',
        dateFrom: new Date('2026-01-01'),
        dateTo: new Date('2026-01-31'),
      });
    });

    it('không truyền dateFrom/dateTo khi không có filter', async () => {
      purchaseReportRepository.getDashboard.mockResolvedValue(makeDashboard());
      await service.getDashboard({}, 'org-1');
      expect(purchaseReportRepository.getDashboard).toHaveBeenCalledWith({
        organizationId: 'org-1',
        dateFrom: undefined,
        dateTo: undefined,
      });
    });
  });

  describe('getBreakdown', () => {
    it('map query sang params với page/limit mặc định', async () => {
      purchaseReportRepository.getBreakdown.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const result = await service.getBreakdown(
        { groupBy: 'SUPPLIER' },
        'org-1',
      );
      expect(result.total).toBe(0);
      expect(purchaseReportRepository.getBreakdown).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          groupBy: 'SUPPLIER',
          page: 1,
          limit: 20,
        }),
      );
    });
  });

  describe('exportReport', () => {
    beforeEach(() => {
      purchaseReportRepository.getBreakdown.mockResolvedValue({
        items: [
          {
            key: 'supplier-1',
            code: 'NCC001',
            label: 'NCC A',
            totalAmount: '500000',
            totalQuantity: '50',
            orderCount: 5,
          },
        ],
        total: 1,
        page: 1,
        limit: 100000,
      });
    });

    it('EXCEL trả về đúng contentType/extension và gọi buildExcel', async () => {
      exportPort.buildExcel.mockResolvedValue(Buffer.from('excel'));
      const result = await service.exportReport(
        { groupBy: 'SUPPLIER', format: 'EXCEL' },
        'org-1',
      );
      expect(result.fileExtension).toBe('xlsx');
      expect(result.contentType).toContain('spreadsheetml');
      expect(exportPort.buildExcel).toHaveBeenCalled();
    });

    it('CSV trả về đúng contentType/extension kèm BOM và gọi buildCsv', async () => {
      exportPort.buildCsv.mockReturnValue('code,label\nNCC001,NCC A');
      const result = await service.exportReport(
        { groupBy: 'SUPPLIER', format: 'CSV' },
        'org-1',
      );
      expect(result.fileExtension).toBe('csv');
      expect(result.contentType).toContain('text/csv');
      expect(result.buffer.toString('utf-8')).toContain('NCC001');
      expect(exportPort.buildCsv).toHaveBeenCalled();
    });

    it('PDF trả về đúng contentType/extension và gọi buildPdf', async () => {
      exportPort.buildPdf.mockResolvedValue(Buffer.from('pdf'));
      const result = await service.exportReport(
        { groupBy: 'SUPPLIER', format: 'PDF' },
        'org-1',
      );
      expect(result.fileExtension).toBe('pdf');
      expect(result.contentType).toBe('application/pdf');
      expect(exportPort.buildPdf).toHaveBeenCalled();
    });

    it('luôn gọi getBreakdown với limit lớn (không phân trang khi export)', async () => {
      exportPort.buildCsv.mockReturnValue('');
      await service.exportReport(
        { groupBy: 'PRODUCT', format: 'CSV' },
        'org-1',
      );
      expect(purchaseReportRepository.getBreakdown).toHaveBeenCalledWith(
        expect.objectContaining({
          groupBy: 'PRODUCT',
          page: 1,
          limit: 100_000,
        }),
      );
    });
  });
});
