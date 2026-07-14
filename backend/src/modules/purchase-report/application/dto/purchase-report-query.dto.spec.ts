import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PurchaseReportBreakdownQueryDto,
  PurchaseReportExportQueryDto,
  PurchaseReportFilterDto,
} from './purchase-report-query.dto';

describe('PurchaseReportFilterDto validation', () => {
  it('hợp lệ khi không có filter nào', async () => {
    const dto = plainToInstance(PurchaseReportFilterDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('hợp lệ với dateFrom/dateTo dạng ISO 8601', async () => {
    const dto = plainToInstance(PurchaseReportFilterDto, {
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-01-31T23:59:59.000Z',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối dateFrom không đúng định dạng ISO', async () => {
    const dto = plainToInstance(PurchaseReportFilterDto, {
      dateFrom: 'not-a-date',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'dateFrom')).toBe(true);
  });
});

describe('PurchaseReportBreakdownQueryDto validation', () => {
  it('hợp lệ khi có groupBy', async () => {
    const dto = plainToInstance(PurchaseReportBreakdownQueryDto, {
      groupBy: 'PRODUCT',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối khi thiếu groupBy', async () => {
    const dto = plainToInstance(PurchaseReportBreakdownQueryDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'groupBy')).toBe(true);
  });

  it('từ chối groupBy không nằm trong 6 chiều cho phép', async () => {
    const dto = plainToInstance(PurchaseReportBreakdownQueryDto, {
      groupBy: 'BRANCH',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'groupBy')).toBe(true);
  });
});

describe('PurchaseReportExportQueryDto validation', () => {
  it('hợp lệ với groupBy + format', async () => {
    const dto = plainToInstance(PurchaseReportExportQueryDto, {
      groupBy: 'CATEGORY',
      format: 'PDF',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối format không nằm trong EXCEL/CSV/PDF', async () => {
    const dto = plainToInstance(PurchaseReportExportQueryDto, {
      groupBy: 'CATEGORY',
      format: 'WORD',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'format')).toBe(true);
  });
});
