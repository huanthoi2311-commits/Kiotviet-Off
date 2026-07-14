import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInventoryAdjustmentDto } from './create-inventory-adjustment.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateInventoryAdjustmentDto, plain);
  return validate(dto);
}

const WAREHOUSE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const PRODUCT_ID = '4fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('CreateInventoryAdjustmentDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const errors = await validateDto({
      warehouseId: WAREHOUSE_ID,
      reason: 'LOST',
      items: [{ productId: PRODUCT_ID, quantity: -5 }],
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối khi thiếu reason (bắt buộc)', async () => {
    const errors = await validateDto({
      warehouseId: WAREHOUSE_ID,
      items: [{ productId: PRODUCT_ID, quantity: -5 }],
    });
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('từ chối reason không nằm trong enum', async () => {
    const errors = await validateDto({
      warehouseId: WAREHOUSE_ID,
      reason: 'UNKNOWN',
      items: [{ productId: PRODUCT_ID, quantity: -5 }],
    });
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('từ chối items rỗng', async () => {
    const errors = await validateDto({
      warehouseId: WAREHOUSE_ID,
      reason: 'LOST',
      items: [],
    });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('từ chối item thiếu quantity', async () => {
    const errors = await validateDto({
      warehouseId: WAREHOUSE_ID,
      reason: 'LOST',
      items: [{ productId: PRODUCT_ID }],
    });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('chấp nhận quantity dương (FOUND)', async () => {
    const errors = await validateDto({
      warehouseId: WAREHOUSE_ID,
      reason: 'FOUND',
      items: [
        {
          productId: PRODUCT_ID,
          quantity: 10,
          remark: 'Tìm thấy trong kho phụ',
        },
      ],
    });
    expect(errors).toHaveLength(0);
  });
});
