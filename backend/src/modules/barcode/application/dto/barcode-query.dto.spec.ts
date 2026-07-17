import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BarcodeQueryDto } from './barcode-query.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(BarcodeQueryDto, plain);
  return validate(dto);
}

describe('BarcodeQueryDto validation', () => {
  it('hợp lệ khi rỗng — toàn bộ field có default (Decision SB08/SB09)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('mặc định sortBy=createdAt, sortOrder=desc (Decision SB08 — Barcode không có field name)', () => {
    const dto = plainToInstance(BarcodeQueryDto, {});
    expect(dto.sortBy).toBe('createdAt');
    expect(dto.sortOrder).toBe('desc');
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('từ chối status không nằm trong enum', async () => {
    const errors = await validateDto({ status: 'DELETED' });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('từ chối sortBy=name (Barcode không có field name)', async () => {
    const errors = await validateDto({ sortBy: 'name' });
    expect(errors.some((e) => e.property === 'sortBy')).toBe(true);
  });

  it('từ chối limit vượt quá 100', async () => {
    const errors = await validateDto({ limit: 101 });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('từ chối page nhỏ hơn 1', async () => {
    const errors = await validateDto({ page: 0 });
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('chấp nhận đầy đủ field tùy chọn', async () => {
    const errors = await validateDto({
      search: '893850',
      status: 'ACTIVE',
      isActive: true,
      page: 2,
      limit: 50,
      sortBy: 'code',
      sortOrder: 'asc',
    });
    expect(errors).toHaveLength(0);
  });
});
