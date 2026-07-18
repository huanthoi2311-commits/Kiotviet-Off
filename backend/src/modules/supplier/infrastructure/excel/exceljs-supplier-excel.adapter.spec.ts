import ExcelJS from 'exceljs';
import { SupplierEntity } from '../../domain/entities/supplier.entity';
import { ExceljsSupplierExcelAdapter } from './exceljs-supplier-excel.adapter';

describe('ExceljsSupplierExcelAdapter', () => {
  let adapter: ExceljsSupplierExcelAdapter;

  const makeSupplier = (
    overrides: Partial<SupplierEntity> = {},
  ): SupplierEntity => ({
    id: 'sup-1',
    organizationId: 'org-1',
    code: 'NCC001',
    taxCode: '0101234567',
    companyName: 'Công ty TNHH Đức An',
    contactName: 'Nguyễn Văn A',
    phone: '0987654321',
    email: 'a@ducan.vn',
    website: 'https://ducan.vn',
    address: '123 Đường ABC',
    province: 'Hà Nội',
    district: 'Cầu Giấy',
    ward: 'Dịch Vọng',
    bankName: 'Vietcombank',
    bankAccount: '0011002233',
    paymentTerm: 30,
    creditLimit: '50000000',
    status: 'ACTIVE',
    version: 1,
    note: 'Nhà cung cấp lâu năm',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    adapter = new ExceljsSupplierExcelAdapter();
  });

  it('buildWorkbookBuffer sinh ra buffer hợp lệ (magic bytes ZIP/OOXML)', async () => {
    const buffer = await adapter.buildWorkbookBuffer([makeSupplier()]);
    expect(buffer.length).toBeGreaterThan(0);
    // .xlsx là file ZIP — 2 byte đầu luôn là "PK"
    expect(buffer.subarray(0, 2).toString('ascii')).toBe('PK');
  });

  it('round-trip: build rồi parse lại đúng dữ liệu', async () => {
    const suppliers = [
      makeSupplier(),
      makeSupplier({ code: 'NCC002', companyName: 'Công ty B', taxCode: null }),
    ];
    const buffer = await adapter.buildWorkbookBuffer(suppliers);

    const rows = await adapter.parseRows(buffer);
    expect(rows).toHaveLength(2);
    expect(rows[0].code).toBe('NCC001');
    expect(rows[0].companyName).toBe('Công ty TNHH Đức An');
    expect(rows[0].paymentTerm).toBe(30);
    expect(rows[1].code).toBe('NCC002');
    expect(rows[1].taxCode).toBeUndefined();
  });

  it('parseRows bỏ qua dòng trống', async () => {
    const buffer = await adapter.buildWorkbookBuffer([makeSupplier()]);
    const rows = await adapter.parseRows(buffer);
    expect(rows.every((row) => row.code)).toBe(true);
  });

  it('parseRows trả về mảng rỗng khi workbook không có worksheet nào', async () => {
    const emptyWorkbook = new ExcelJS.Workbook();
    const emptyBuffer = Buffer.from(await emptyWorkbook.xlsx.writeBuffer());
    const rows = await adapter.parseRows(emptyBuffer);
    expect(rows).toEqual([]);
  });
});
