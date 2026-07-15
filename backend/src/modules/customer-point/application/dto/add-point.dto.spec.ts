import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddPointDto } from './add-point.dto';
import { UsePointDto } from './use-point.dto';

const CUSTOMER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('AddPointDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const dto = plainToInstance(AddPointDto, {
      customerId: CUSTOMER_ID,
      point: 100,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối point <= 0', async () => {
    const dto = plainToInstance(AddPointDto, {
      customerId: CUSTOMER_ID,
      point: 0,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'point')).toBe(true);
  });

  it('từ chối point không phải số nguyên', async () => {
    const dto = plainToInstance(AddPointDto, {
      customerId: CUSTOMER_ID,
      point: 1.5,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'point')).toBe(true);
  });

  it('từ chối customerId không phải UUID', async () => {
    const dto = plainToInstance(AddPointDto, {
      customerId: 'not-a-uuid',
      point: 100,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'customerId')).toBe(true);
  });

  it('chấp nhận đầy đủ trường tùy chọn', async () => {
    const dto = plainToInstance(AddPointDto, {
      customerId: CUSTOMER_ID,
      point: 100,
      referenceType: 'ORDER',
      referenceId: CUSTOMER_ID,
      expiredAt: '2027-01-01T00:00:00.000Z',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('UsePointDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const dto = plainToInstance(UsePointDto, {
      customerId: CUSTOMER_ID,
      point: 30,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối point âm', async () => {
    const dto = plainToInstance(UsePointDto, {
      customerId: CUSTOMER_ID,
      point: -5,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'point')).toBe(true);
  });
});
