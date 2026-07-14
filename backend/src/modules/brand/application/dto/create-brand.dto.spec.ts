import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBrandDto } from './create-brand.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateBrandDto, plain);
  return validate(dto);
}

describe('CreateBrandDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const errors = await validateDto({ code: 'NIKE', name: 'Nike' });
    expect(errors).toHaveLength(0);
  });

  it('từ chối name ngắn hơn 2 ký tự', async () => {
    const errors = await validateDto({ code: 'NIKE', name: 'a' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('từ chối code rỗng', async () => {
    const errors = await validateDto({ code: '', name: 'Nike' });
    expect(errors.some((e) => e.property === 'code')).toBe(true);
  });

  it('từ chối website không phải URL hợp lệ', async () => {
    const errors = await validateDto({
      code: 'NIKE',
      name: 'Nike',
      website: 'khong-phai-url',
    });
    expect(errors.some((e) => e.property === 'website')).toBe(true);
  });

  it('từ chối status không nằm trong enum', async () => {
    const errors = await validateDto({
      code: 'NIKE',
      name: 'Nike',
      status: 'DELETED',
    });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('chấp nhận đầy đủ field tùy chọn', async () => {
    const errors = await validateDto({
      code: 'NIKE',
      name: 'Nike',
      logo: 'https://cdn.example.com/brands/nike.png',
      description: 'Thương hiệu thể thao toàn cầu',
      website: 'https://nike.com',
      country: 'USA',
      status: 'ACTIVE',
    });
    expect(errors).toHaveLength(0);
  });
});
