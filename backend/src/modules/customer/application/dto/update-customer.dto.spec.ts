import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCustomerDto } from './update-customer.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(UpdateCustomerDto, plain);
  return validate(dto);
}

describe('UpdateCustomerDto validation', () => {
  it('hợp lệ khi có version', async () => {
    const errors = await validateDto({ version: 1 });
    expect(errors).toHaveLength(0);
  });

  it('từ chối khi thiếu version (Optimistic Lock bắt buộc — BR09)', async () => {
    const errors = await validateDto({ fullName: 'Nguyễn Văn B' });
    expect(errors.some((e) => e.property === 'version')).toBe(true);
  });

  it('từ chối version không phải số nguyên', async () => {
    const errors = await validateDto({ version: 'abc' });
    expect(errors.some((e) => e.property === 'version')).toBe(true);
  });

  it('chấp nhận đầy đủ field tùy chọn kèm version', async () => {
    const errors = await validateDto({
      version: 2,
      fullName: 'Nguyễn Văn B',
      phone: '0900000000',
      contactName: 'Trần Thị B',
      paymentTermDays: 15,
    });
    expect(errors).toHaveLength(0);
  });
});
