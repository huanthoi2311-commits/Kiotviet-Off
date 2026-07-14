import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { PurchaseReportBreakdownItemEntity } from '../../domain/entities/purchase-report.entity';
import { PurchaseReportExportAdapter } from './purchase-report-export.adapter';

describe('PurchaseReportExportAdapter', () => {
  let adapter: PurchaseReportExportAdapter;

  const items: PurchaseReportBreakdownItemEntity[] = [
    {
      key: 'supplier-1',
      code: 'NCC001',
      label: 'Nhà cung cấp, "Đức An"',
      totalAmount: '1000000',
      totalQuantity: '100',
      orderCount: 3,
    },
    {
      key: 'supplier-2',
      code: null,
      label: 'NCC B',
      totalAmount: '500000',
      totalQuantity: '50',
      orderCount: 1,
    },
  ];

  beforeEach(() => {
    adapter = new PurchaseReportExportAdapter();
  });

  describe('buildExcel', () => {
    it('sinh ra buffer .xlsx hợp lệ (magic bytes ZIP) và đọc lại đúng dữ liệu', async () => {
      const buffer = await adapter.buildExcel(
        'Báo cáo theo Nhà cung cấp',
        items,
      );
      expect(buffer.subarray(0, 2).toString('ascii')).toBe('PK');

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.read(Readable.from(buffer));
      const worksheet = workbook.worksheets[0];
      expect(worksheet.getRow(2).getCell(1).value).toBe('NCC001');
      expect(worksheet.getRow(2).getCell(3).value).toBe('1000000');
    });
  });

  describe('buildCsv', () => {
    it('sinh header + đúng số dòng, escape dấu phẩy/ngoặc kép trong label', () => {
      const csv = adapter.buildCsv(items);
      const lines = csv.split('\r\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain('Mã');
      expect(lines[1]).toContain('"Nhà cung cấp, ""Đức An"""');
    });

    it('trả về chỉ header khi không có dòng nào', () => {
      const csv = adapter.buildCsv([]);
      expect(csv.split('\r\n')).toHaveLength(1);
    });
  });

  describe('buildPdf', () => {
    it('sinh ra buffer PDF hợp lệ (magic bytes %PDF)', async () => {
      const buffer = await adapter.buildPdf('Báo cáo theo Nhà cung cấp', items);
      expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    });

    it('vẫn sinh PDF hợp lệ khi danh sách rỗng', async () => {
      const buffer = await adapter.buildPdf('Báo cáo rỗng', []);
      expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    });
  });
});
