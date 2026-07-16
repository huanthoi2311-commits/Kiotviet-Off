import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUnitDto } from './create-unit.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateUnitDto, plain);
  return validate(dto);
}

describe('CreateUnitDto validation', () => {
  it('hợp lệ với dữ liệu đầy đủ', async () => {
    const errors = await validateDto({
      code: 'CAI',
      name: 'Cái',
      symbol: 'cái',
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối code rỗng', async () => {
    const errors = await validateDto({ code: '', name: 'Cái', symbol: 'cái' });
    expect(errors.some((e) => e.property === 'code')).toBe(true);
  });

  it('từ chối name rỗng', async () => {
    const errors = await validateDto({ code: 'CAI', name: '', symbol: 'cái' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('từ chối symbol rỗng', async () => {
    const errors = await validateDto({ code: 'CAI', name: 'Cái', symbol: '' });
    expect(errors.some((e) => e.property === 'symbol')).toBe(true);
  });

  it('từ chối symbol dài hơn 20 ký tự', async () => {
    const errors = await validateDto({
      code: 'CAI',
      name: 'Cái',
      symbol: 'a'.repeat(21),
    });
    expect(errors.some((e) => e.property === 'symbol')).toBe(true);
  });

  it('chấp nhận status ACTIVE/INACTIVE', async () => {
    for (const status of ['ACTIVE', 'INACTIVE']) {
      const errors = await validateDto({
        code: 'CAI',
        name: 'Cái',
        symbol: 'cái',
        status,
      });
      expect(errors).toHaveLength(0);
    }
  });

  it('từ chối status ARCHIVED khi tạo mới (Decision RQ1)', async () => {
    const errors = await validateDto({
      code: 'CAI',
      name: 'Cái',
      symbol: 'cái',
      status: 'ARCHIVED',
    });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});
