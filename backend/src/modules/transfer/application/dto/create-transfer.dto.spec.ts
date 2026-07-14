import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTransferDto } from './create-transfer.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateTransferDto, plain);
  return validate(dto);
}

const WH_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const WH_B = '4fa85f64-5717-4562-b3fc-2c963f66afa6';
const PRODUCT_ID = '5fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('CreateTransferDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const errors = await validateDto({
      fromWarehouseId: WH_A,
      toWarehouseId: WH_B,
      items: [{ productId: PRODUCT_ID, quantity: 10 }],
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối fromWarehouseId không phải UUID', async () => {
    const errors = await validateDto({
      fromWarehouseId: 'not-a-uuid',
      toWarehouseId: WH_B,
      items: [{ productId: PRODUCT_ID, quantity: 10 }],
    });
    expect(errors.some((e) => e.property === 'fromWarehouseId')).toBe(true);
  });

  it('từ chối items rỗng', async () => {
    const errors = await validateDto({
      fromWarehouseId: WH_A,
      toWarehouseId: WH_B,
      items: [],
    });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('từ chối quantity không dương', async () => {
    const errors = await validateDto({
      fromWarehouseId: WH_A,
      toWarehouseId: WH_B,
      items: [{ productId: PRODUCT_ID, quantity: -5 }],
    });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('từ chối item thiếu productId', async () => {
    const errors = await validateDto({
      fromWarehouseId: WH_A,
      toWarehouseId: WH_B,
      items: [{ quantity: 10 }],
    });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('chấp nhận note tùy chọn', async () => {
    const errors = await validateDto({
      fromWarehouseId: WH_A,
      toWarehouseId: WH_B,
      note: 'Điều chuyển hàng cuối tháng',
      items: [{ productId: PRODUCT_ID, quantity: 10 }],
    });
    expect(errors).toHaveLength(0);
  });
});
