import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBarcodeDto } from './update-barcode.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(UpdateBarcodeDto, plain);
  return validate(dto);
}

describe('UpdateBarcodeDto validation', () => {
  it('hợp lệ khi có version', async () => {
    const errors = await validateDto({ version: 1 });
    expect(errors).toHaveLength(0);
  });

  it('từ chối khi thiếu version (Optimistic Lock bắt buộc, Decision BQ10/SB02)', async () => {
    const errors = await validateDto({ code: '999' });
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

  it('từ chối type không nằm trong enum', async () => {
    const errors = await validateDto({ version: 1, type: 'UPC' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('chấp nhận đầy đủ field tùy chọn kèm version', async () => {
    const errors = await validateDto({
      version: 2,
      code: '999',
      type: 'CODE128',
      unitId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      status: 'INACTIVE',
    });
    expect(errors).toHaveLength(0);
  });
});
