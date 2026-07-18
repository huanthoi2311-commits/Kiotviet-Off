import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCustomerDto } from './create-customer.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateCustomerDto, plain);
  return validate(dto);
}

describe('CreateCustomerDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu (chỉ fullName — phone/code đều tùy chọn, Decision CR05/CR06)', async () => {
    const errors = await validateDto({ fullName: 'Nguyễn Văn A' });
    expect(errors).toHaveLength(0);
  });

  it('hợp lệ khi không gửi phone', async () => {
    const errors = await validateDto({ fullName: 'Nguyễn Văn A' });
    expect(errors.some((e) => e.property === 'phone')).toBe(false);
  });

  it('hợp lệ khi không gửi code (hệ thống tự sinh)', async () => {
    const errors = await validateDto({
      fullName: 'Nguyễn Văn A',
      phone: '0987654321',
    });
    expect(errors.some((e) => e.property === 'code')).toBe(false);
  });

  it('chấp nhận code khi client tự cung cấp', async () => {
    const errors = await validateDto({
      fullName: 'Nguyễn Văn A',
      code: 'ABC123',
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối khi thiếu fullName', async () => {
    const errors = await validateDto({ phone: '0987654321' });
    expect(errors.some((e) => e.property === 'fullName')).toBe(true);
  });

  it('từ chối email không đúng định dạng', async () => {
    const errors = await validateDto({
      fullName: 'Nguyễn Văn A',
      email: 'not-an-email',
    });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('từ chối customerType không nằm trong enum', async () => {
    const errors = await validateDto({
      fullName: 'Nguyễn Văn A',
      customerType: 'UNKNOWN',
    });
    expect(errors.some((e) => e.property === 'customerType')).toBe(true);
  });

  it('chấp nhận đầy đủ trường tùy chọn (khách hàng doanh nghiệp)', async () => {
    const errors = await validateDto({
      code: 'ABC123',
      customerType: 'COMPANY',
      fullName: 'Nguyễn Văn A',
      phone: '0987654321',
      email: 'a@example.com',
      birthday: '1990-01-01T00:00:00.000Z',
      gender: 'MALE',
      taxCode: '0101234567',
      companyName: 'Công ty TNHH ABC',
      contactName: 'Trần Thị B',
      address: '123 Đường ABC',
      province: 'Hà Nội',
      district: 'Cầu Giấy',
      ward: 'Dịch Vọng',
      avatar: 'https://example.com/avatar.png',
      note: 'Khách VIP',
      creditLimit: 20000000,
      paymentTermDays: 30,
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối creditLimit âm', async () => {
    const errors = await validateDto({
      fullName: 'Nguyễn Văn A',
      creditLimit: -1,
    });
    expect(errors.some((e) => e.property === 'creditLimit')).toBe(true);
  });

  it('từ chối paymentTermDays âm', async () => {
    const errors = await validateDto({
      fullName: 'Nguyễn Văn A',
      paymentTermDays: -1,
    });
    expect(errors.some((e) => e.property === 'paymentTermDays')).toBe(true);
  });

  it('từ chối paymentTermDays không phải số nguyên', async () => {
    const errors = await validateDto({
      fullName: 'Nguyễn Văn A',
      paymentTermDays: 1.5,
    });
    expect(errors.some((e) => e.property === 'paymentTermDays')).toBe(true);
  });
});
