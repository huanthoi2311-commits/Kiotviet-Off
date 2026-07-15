import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddCartItemDto } from './add-cart-item.dto';
import { RemoveCartItemDto } from './remove-cart-item.dto';
import { UpdateCartItemDto } from './update-cart-item.dto';

const PRODUCT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('AddCartItemDto validation', () => {
  it('hợp lệ với productId + quantity dương', async () => {
    const dto = plainToInstance(AddCartItemDto, {
      productId: PRODUCT_ID,
      quantity: 2,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('hỗ trợ quantity thập phân tối đa 3 chữ số (hàng cân)', async () => {
    const dto = plainToInstance(AddCartItemDto, {
      productId: PRODUCT_ID,
      quantity: 1.5,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối quantity <= 0', async () => {
    const dto = plainToInstance(AddCartItemDto, {
      productId: PRODUCT_ID,
      quantity: 0,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'quantity')).toBe(true);
  });

  it('từ chối quantity quá 3 chữ số thập phân', async () => {
    const dto = plainToInstance(AddCartItemDto, {
      productId: PRODUCT_ID,
      quantity: 1.2345,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'quantity')).toBe(true);
  });

  it('từ chối productId không phải UUID', async () => {
    const dto = plainToInstance(AddCartItemDto, {
      productId: 'not-a-uuid',
      quantity: 1,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'productId')).toBe(true);
  });
});

describe('UpdateCartItemDto validation', () => {
  it('hợp lệ với productId + quantity dương', async () => {
    const dto = plainToInstance(UpdateCartItemDto, {
      productId: PRODUCT_ID,
      quantity: 5,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối quantity âm', async () => {
    const dto = plainToInstance(UpdateCartItemDto, {
      productId: PRODUCT_ID,
      quantity: -1,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'quantity')).toBe(true);
  });
});

describe('RemoveCartItemDto validation', () => {
  it('hợp lệ với productId dạng UUID', async () => {
    const dto = plainToInstance(RemoveCartItemDto, { productId: PRODUCT_ID });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối productId không phải UUID', async () => {
    const dto = plainToInstance(RemoveCartItemDto, {
      productId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'productId')).toBe(true);
  });
});
