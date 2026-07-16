import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUnitDto } from './update-unit.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(UpdateUnitDto, plain);
  return validate(dto);
}

describe('UpdateUnitDto validation', () => {
  it('hợp lệ khi có version', async () => {
    const errors = await validateDto({ version: 1 });
    expect(errors).toHaveLength(0);
  });

  it('từ chối khi thiếu version (Optimistic Lock bắt buộc)', async () => {
    const errors = await validateDto({ name: 'Cái (đã sửa)' });
    expect(errors.some((e) => e.property === 'version')).toBe(true);
  });

  it('từ chối version không phải số nguyên', async () => {
    const errors = await validateDto({ version: 'abc' });
    expect(errors.some((e) => e.property === 'version')).toBe(true);
  });

  it('từ chối status ARCHIVED (chỉ qua DELETE, không qua PATCH)', async () => {
    const errors = await validateDto({ version: 1, status: 'ARCHIVED' });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('chấp nhận đầy đủ field tùy chọn kèm version', async () => {
    const errors = await validateDto({
      version: 2,
      code: 'CAI',
      name: 'Cái (đã sửa)',
      symbol: 'cái',
      status: 'INACTIVE',
    });
    expect(errors).toHaveLength(0);
  });
});
