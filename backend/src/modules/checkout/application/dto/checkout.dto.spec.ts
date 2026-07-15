import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckoutDto } from './checkout.dto';
import { ManualDiscountDto } from './manual-discount.dto';

const BRANCH_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const WAREHOUSE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa7';

describe('CheckoutDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const dto = plainToInstance(CheckoutDto, {
      branchId: BRANCH_ID,
      warehouseId: WAREHOUSE_ID,
      paymentMethod: 'CASH',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối paymentMethod không thuộc enum', async () => {
    const dto = plainToInstance(CheckoutDto, {
      branchId: BRANCH_ID,
      warehouseId: WAREHOUSE_ID,
      paymentMethod: 'BITCOIN',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'paymentMethod')).toBe(true);
  });

  it('từ chối branchId/warehouseId không phải UUID', async () => {
    const dto = plainToInstance(CheckoutDto, {
      branchId: 'not-a-uuid',
      warehouseId: 'not-a-uuid',
      paymentMethod: 'CASH',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'branchId')).toBe(true);
    expect(errors.some((e) => e.property === 'warehouseId')).toBe(true);
  });

  it('từ chối pointsToUse <= 0', async () => {
    const dto = plainToInstance(CheckoutDto, {
      branchId: BRANCH_ID,
      warehouseId: WAREHOUSE_ID,
      paymentMethod: 'CASH',
      pointsToUse: 0,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'pointsToUse')).toBe(true);
  });

  it('hợp lệ kèm manualDiscount lồng nhau đúng cấu trúc', async () => {
    const dto = plainToInstance(CheckoutDto, {
      branchId: BRANCH_ID,
      warehouseId: WAREHOUSE_ID,
      paymentMethod: 'CASH',
      manualDiscount: { type: 'PERCENT', value: 10 },
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối manualDiscount có type không hợp lệ', async () => {
    const dto = plainToInstance(CheckoutDto, {
      branchId: BRANCH_ID,
      warehouseId: WAREHOUSE_ID,
      paymentMethod: 'CASH',
      manualDiscount: { type: 'FOO', value: 10 },
    });
    const errors = await validate(dto, { whitelist: true });
    const nested = errors.find((e) => e.property === 'manualDiscount');
    expect(nested).toBeDefined();
  });
});

describe('ManualDiscountDto validation', () => {
  it('hợp lệ với PERCENT', async () => {
    const dto = plainToInstance(ManualDiscountDto, {
      type: 'PERCENT',
      value: 10,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('hợp lệ với BUY_X_GET_Y kèm productId/buyQuantity/getQuantity', async () => {
    const dto = plainToInstance(ManualDiscountDto, {
      type: 'BUY_X_GET_Y',
      productId: BRANCH_ID,
      buyQuantity: 2,
      getQuantity: 1,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối buyQuantity/getQuantity <= 0', async () => {
    const dto = plainToInstance(ManualDiscountDto, {
      type: 'BUY_X_GET_Y',
      productId: BRANCH_ID,
      buyQuantity: 0,
      getQuantity: -1,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'buyQuantity')).toBe(true);
    expect(errors.some((e) => e.property === 'getQuantity')).toBe(true);
  });
});
