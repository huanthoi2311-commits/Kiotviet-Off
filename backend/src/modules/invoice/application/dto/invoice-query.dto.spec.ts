import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InvoiceQueryDto } from './invoice-query.dto';

describe('InvoiceQueryDto validation', () => {
  it('hợp lệ khi không truyền field nào (áp default page/limit)', async () => {
    const dto = plainToInstance(InvoiceQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('hợp lệ với status thuộc enum', async () => {
    const dto = plainToInstance(InvoiceQueryDto, { status: 'PAID' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối status không thuộc enum', async () => {
    const dto = plainToInstance(InvoiceQueryDto, { status: 'FOO' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('từ chối customerId không phải UUID', async () => {
    const dto = plainToInstance(InvoiceQueryDto, { customerId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'customerId')).toBe(true);
  });
});
