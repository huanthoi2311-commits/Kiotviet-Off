import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BrandQueryDto } from './brand-query.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(BrandQueryDto, plain);
  return validate(dto);
}

describe('BrandQueryDto validation', () => {
  it('hợp lệ khi rỗng (toàn bộ field optional)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('hợp lệ với isActive=true (chuyển đổi từ query string)', async () => {
    const dto = plainToInstance(BrandQueryDto, { isActive: 'true' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.isActive).toBe(true);
  });

  it('isActive=false (chuỗi rỗng) chuyển đổi đúng thành false', async () => {
    const dto = plainToInstance(BrandQueryDto, { isActive: '' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.isActive).toBe(false);
  });

  it('chấp nhận sortBy hợp lệ (name/code/createdAt)', async () => {
    for (const sortBy of ['name', 'code', 'createdAt']) {
      const errors = await validateDto({ sortBy });
      expect(errors).toHaveLength(0);
    }
  });

  it('từ chối sortBy không nằm trong danh sách cho phép', async () => {
    const errors = await validateDto({ sortBy: 'website' });
    expect(errors.some((e) => e.property === 'sortBy')).toBe(true);
  });

  it('từ chối sortOrder không phải asc/desc', async () => {
    const errors = await validateDto({ sortOrder: 'random' });
    expect(errors.some((e) => e.property === 'sortOrder')).toBe(true);
  });

  it('từ chối limit vượt quá 100', async () => {
    const errors = await validateDto({ limit: 101 });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('status và isActive có thể dùng đồng thời (Decision RQ4)', async () => {
    const errors = await validateDto({ status: 'ACTIVE', isActive: 'false' });
    expect(errors).toHaveLength(0);
  });
});
