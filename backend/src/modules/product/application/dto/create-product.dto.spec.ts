import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

const validBase = {
  categoryId: 'b3a1c9e4-6f2a-4e11-9b3a-1e6c2f4a9d21',
  unitId: 'c9d8e7f6-1234-4e11-9b3a-1e6c2f4a9d21',
  name: 'Áo thun nam',
  costPrice: 90000,
  prices: [{ type: 'RETAIL', price: 150000 }],
};

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateProductDto, plain);
  return validate(dto);
}

describe('CreateProductDto validation', () => {
  it('hợp lệ với dữ liệu đầy đủ tối thiểu', async () => {
    const errors = await validateDto(validBase);
    expect(errors).toHaveLength(0);
  });

  it('từ chối tên ngắn hơn 3 ký tự', async () => {
    const errors = await validateDto({ ...validBase, name: 'ab' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('từ chối tên dài hơn 255 ký tự', async () => {
    const errors = await validateDto({ ...validBase, name: 'a'.repeat(256) });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('từ chối categoryId không phải UUID', async () => {
    const errors = await validateDto({
      ...validBase,
      categoryId: 'not-a-uuid',
    });
    expect(errors.some((e) => e.property === 'categoryId')).toBe(true);
  });

  it('từ chối costPrice âm', async () => {
    const errors = await validateDto({ ...validBase, costPrice: -1 });
    expect(errors.some((e) => e.property === 'costPrice')).toBe(true);
  });

  it('từ chối vat ngoài khoảng 0-100', async () => {
    const errors = await validateDto({ ...validBase, vat: 150 });
    expect(errors.some((e) => e.property === 'vat')).toBe(true);
  });

  it('từ chối mảng prices rỗng', async () => {
    const errors = await validateDto({ ...validBase, prices: [] });
    expect(errors.some((e) => e.property === 'prices')).toBe(true);
  });

  it('từ chối price type không hợp lệ trong mảng prices', async () => {
    const errors = await validateDto({
      ...validBase,
      prices: [{ type: 'INVALID_TYPE', price: 100 }],
    });
    expect(errors.some((e) => e.property === 'prices')).toBe(true);
  });

  it('từ chối barcode type không hợp lệ', async () => {
    const errors = await validateDto({
      ...validBase,
      barcodes: [{ code: '123', type: 'INVALID' }],
    });
    expect(errors.some((e) => e.property === 'barcodes')).toBe(true);
  });

  it('chấp nhận brandId/description/vat/kích thước tùy chọn khi có giá trị hợp lệ', async () => {
    const errors = await validateDto({
      ...validBase,
      brandId: 'a1b2c3d4-5678-4e11-9b3a-1e6c2f4a9d21',
      description: 'Chất liệu cotton',
      vat: 8,
      weight: 0.2,
      length: 30,
      width: 20,
      height: 2,
      status: 'ACTIVE',
      isActive: true,
    });
    expect(errors).toHaveLength(0);
  });
});
