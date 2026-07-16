import { validate } from 'class-validator';
import { IsIso4217Currency } from './is-iso4217-currency.validator';

class Dummy {
  @IsIso4217Currency()
  currencyCode: string;
}

describe('IsIso4217Currency', () => {
  it('chấp nhận VND', async () => {
    const dto = new Dummy();
    dto.currencyCode = 'VND';
    expect(await validate(dto)).toHaveLength(0);
  });

  it('chấp nhận USD', async () => {
    const dto = new Dummy();
    dto.currencyCode = 'USD';
    expect(await validate(dto)).toHaveLength(0);
  });

  it('chấp nhận chữ thường (tự viết hoa để so sánh)', async () => {
    const dto = new Dummy();
    dto.currencyCode = 'vnd';
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối mã tiền tệ không hợp lệ', async () => {
    const dto = new Dummy();
    dto.currencyCode = 'XXX_NOT_REAL';
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
  });

  it('từ chối giá trị không phải string', async () => {
    const dto = new Dummy();
    (dto as unknown as { currencyCode: number }).currencyCode = 123;
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
  });
});
