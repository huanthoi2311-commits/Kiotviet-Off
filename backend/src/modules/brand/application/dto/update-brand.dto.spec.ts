import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBrandDto } from './update-brand.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(UpdateBrandDto, plain);
  return validate(dto);
}

describe('UpdateBrandDto validation', () => {
  it('hợp lệ khi có version', async () => {
    const errors = await validateDto({ version: 1 });
    expect(errors).toHaveLength(0);
  });

  it('từ chối khi thiếu version (Optimistic Lock bắt buộc)', async () => {
    const errors = await validateDto({ name: 'Nike Inc.' });
    expect(errors.some((e) => e.property === 'version')).toBe(true);
  });

  it('từ chối version không phải số nguyên', async () => {
    const errors = await validateDto({ version: 'abc' });
    expect(errors.some((e) => e.property === 'version')).toBe(true);
  });

  it('từ chối status không nằm trong enum', async () => {
    const errors = await validateDto({ version: 1, status: 'DELETED' });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('chấp nhận đầy đủ field tùy chọn kèm version', async () => {
    const errors = await validateDto({
      version: 2,
      code: 'NIKE',
      name: 'Nike Inc.',
      website: 'https://nike.com',
      status: 'INACTIVE',
    });
    expect(errors).toHaveLength(0);
  });
});
