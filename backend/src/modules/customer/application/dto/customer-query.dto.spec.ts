import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CustomerQueryDto } from './customer-query.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CustomerQueryDto, plain);
  return validate(dto);
}

describe('CustomerQueryDto validation', () => {
  it('hợp lệ khi rỗng — toàn bộ field có default', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('mặc định sortBy=fullName, sortOrder=asc (RFC-T011 §12 — "name ASC")', () => {
    const dto = plainToInstance(CustomerQueryDto, {});
    expect(dto.sortBy).toBe('fullName');
    expect(dto.sortOrder).toBe('asc');
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('chấp nhận status=ARCHIVED (3 giá trị, khác v1 chỉ ACTIVE/INACTIVE)', async () => {
    const errors = await validateDto({ status: 'ARCHIVED' });
    expect(errors).toHaveLength(0);
  });

  it('từ chối status không nằm trong enum', async () => {
    const errors = await validateDto({ status: 'DELETED' });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
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
      search: 'Nguyễn',
      customerType: 'RETAIL',
      status: 'ACTIVE',
      page: 2,
      limit: 50,
      sortBy: 'code',
      sortOrder: 'desc',
    });
    expect(errors).toHaveLength(0);
  });
});
