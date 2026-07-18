import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CustomerVersionDto } from './customer-version.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CustomerVersionDto, plain);
  return validate(dto);
}

describe('CustomerVersionDto validation (Archive/Restore/Activate/Deactivate — BR09)', () => {
  it('hợp lệ khi có version dạng số nguyên', async () => {
    const errors = await validateDto({ version: 1 });
    expect(errors).toHaveLength(0);
  });

  it('từ chối khi thiếu version', async () => {
    const errors = await validateDto({});
    expect(errors.some((e) => e.property === 'version')).toBe(true);
  });

  it('từ chối version không phải số nguyên', async () => {
    const errors = await validateDto({ version: 'abc' });
    expect(errors.some((e) => e.property === 'version')).toBe(true);
  });
});
