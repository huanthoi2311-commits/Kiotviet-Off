import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBarcodeDto } from './create-barcode.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateBarcodeDto, plain);
  return validate(dto);
}

describe('CreateBarcodeDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const errors = await validateDto({ code: '8938505970381', type: 'EAN13' });
    expect(errors).toHaveLength(0);
  });

  it('từ chối code rỗng', async () => {
    const errors = await validateDto({ code: '', type: 'EAN13' });
    expect(errors.some((e) => e.property === 'code')).toBe(true);
  });

  it('từ chối type không nằm trong enum', async () => {
    const errors = await validateDto({ code: '123', type: 'UPC' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('từ chối unitId không phải UUID', async () => {
    const errors = await validateDto({
      code: '123',
      type: 'CUSTOM',
      unitId: 'not-a-uuid',
    });
    expect(errors.some((e) => e.property === 'unitId')).toBe(true);
  });

  it('chấp nhận đầy đủ field tùy chọn', async () => {
    const errors = await validateDto({
      code: '8938505970381',
      type: 'EAN13',
      unitId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      isDefault: true,
    });
    expect(errors).toHaveLength(0);
  });
});
