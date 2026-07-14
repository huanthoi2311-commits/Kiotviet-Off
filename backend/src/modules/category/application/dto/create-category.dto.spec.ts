import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateCategoryDto, plain);
  return validate(dto);
}

describe('CreateCategoryDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const errors = await validateDto({ code: 'ROOT', name: 'Danh mục gốc' });
    expect(errors).toHaveLength(0);
  });

  it('từ chối tên ngắn hơn 2 ký tự', async () => {
    const errors = await validateDto({ code: 'ROOT', name: 'a' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('từ chối parentId không phải UUID', async () => {
    const errors = await validateDto({
      code: 'ROOT',
      name: 'x',
      parentId: 'not-a-uuid',
    });
    expect(errors.some((e) => e.property === 'parentId')).toBe(true);
  });

  it('từ chối code rỗng', async () => {
    const errors = await validateDto({ code: '', name: 'Danh mục' });
    expect(errors.some((e) => e.property === 'code')).toBe(true);
  });

  it('chấp nhận đầy đủ field tùy chọn', async () => {
    const errors = await validateDto({
      code: 'ROOT',
      name: 'Danh mục gốc',
      description: 'Mô tả',
      imageUrl: 'https://cdn.example.com/a.jpg',
      sortOrder: 1,
      isActive: false,
    });
    expect(errors).toHaveLength(0);
  });
});
