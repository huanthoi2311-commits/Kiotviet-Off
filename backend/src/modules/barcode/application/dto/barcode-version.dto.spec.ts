import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BarcodeVersionDto } from './barcode-version.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(BarcodeVersionDto, plain);
  return validate(dto);
}

describe('BarcodeVersionDto validation (Archive/Restore/SetDefault — Decision BQ10)', () => {
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
