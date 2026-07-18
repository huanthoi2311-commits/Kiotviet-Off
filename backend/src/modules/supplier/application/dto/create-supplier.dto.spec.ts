import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSupplierDto } from './create-supplier.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateSupplierDto, plain);
  return validate(dto);
}

describe('CreateSupplierDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const errors = await validateDto({
      code: 'NCC001',
      companyName: 'Công ty Đức An',
    });
    expect(errors).toHaveLength(0);
  });

  it('hợp lệ khi không gửi code (tùy chọn — Decision SR07)', async () => {
    const errors = await validateDto({ companyName: 'Công ty Đức An' });
    expect(errors).toHaveLength(0);
  });

  it('từ chối code rỗng (nếu gửi thì không được rỗng)', async () => {
    const errors = await validateDto({
      code: '',
      companyName: 'Công ty Đức An',
    });
    expect(errors.some((e) => e.property === 'code')).toBe(true);
  });

  it('từ chối companyName ngắn hơn 2 ký tự', async () => {
    const errors = await validateDto({ code: 'NCC001', companyName: 'a' });
    expect(errors.some((e) => e.property === 'companyName')).toBe(true);
  });

  it('từ chối email sai định dạng', async () => {
    const errors = await validateDto({
      code: 'NCC001',
      companyName: 'Công ty Đức An',
      email: 'not-an-email',
    });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('từ chối website sai định dạng URL', async () => {
    const errors = await validateDto({
      code: 'NCC001',
      companyName: 'Công ty Đức An',
      website: 'khong-phai-url',
    });
    expect(errors.some((e) => e.property === 'website')).toBe(true);
  });

  it('từ chối status không nằm trong enum', async () => {
    const errors = await validateDto({
      code: 'NCC001',
      companyName: 'Công ty Đức An',
      status: 'DELETED',
    });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('từ chối paymentTerm âm', async () => {
    const errors = await validateDto({
      code: 'NCC001',
      companyName: 'Công ty Đức An',
      paymentTerm: -5,
    });
    expect(errors.some((e) => e.property === 'paymentTerm')).toBe(true);
  });

  it('chấp nhận đầy đủ field tùy chọn', async () => {
    const errors = await validateDto({
      code: 'NCC001',
      taxCode: '0101234567',
      companyName: 'Công ty TNHH Đức An',
      contactName: 'Nguyễn Văn A',
      phone: '0987654321',
      email: 'a@ducan.vn',
      website: 'https://ducan.vn',
      address: '123 Đường ABC',
      province: 'Hà Nội',
      district: 'Cầu Giấy',
      ward: 'Dịch Vọng',
      bankName: 'Vietcombank',
      bankAccount: '0011002233',
      paymentTerm: 30,
      creditLimit: 50000000,
      status: 'ACTIVE',
      note: 'Nhà cung cấp lâu năm',
    });
    expect(errors).toHaveLength(0);
  });
});
