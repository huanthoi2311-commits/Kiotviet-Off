import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStockCountDto } from './create-stock-count.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateStockCountDto, plain);
  return validate(dto);
}

const WAREHOUSE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const PRODUCT_ID = '4fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('CreateStockCountDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const errors = await validateDto({
      warehouseId: WAREHOUSE_ID,
      productIds: [PRODUCT_ID],
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối warehouseId không phải UUID', async () => {
    const errors = await validateDto({
      warehouseId: 'not-a-uuid',
      productIds: [PRODUCT_ID],
    });
    expect(errors.some((e) => e.property === 'warehouseId')).toBe(true);
  });

  it('từ chối productIds rỗng', async () => {
    const errors = await validateDto({
      warehouseId: WAREHOUSE_ID,
      productIds: [],
    });
    expect(errors.some((e) => e.property === 'productIds')).toBe(true);
  });

  it('từ chối productIds trùng nhau', async () => {
    const errors = await validateDto({
      warehouseId: WAREHOUSE_ID,
      productIds: [PRODUCT_ID, PRODUCT_ID],
    });
    expect(errors.some((e) => e.property === 'productIds')).toBe(true);
  });

  it('từ chối phần tử productIds không phải UUID', async () => {
    const errors = await validateDto({
      warehouseId: WAREHOUSE_ID,
      productIds: ['not-a-uuid'],
    });
    expect(errors.some((e) => e.property === 'productIds')).toBe(true);
  });

  it('chấp nhận note tùy chọn', async () => {
    const errors = await validateDto({
      warehouseId: WAREHOUSE_ID,
      note: 'Kiểm kê cuối tháng',
      productIds: [PRODUCT_ID],
    });
    expect(errors).toHaveLength(0);
  });
});
