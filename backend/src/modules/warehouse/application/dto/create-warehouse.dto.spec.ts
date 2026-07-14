import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateWarehouseDto } from './create-warehouse.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateWarehouseDto, plain);
  return validate(dto);
}

const VALID_BRANCH_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('CreateWarehouseDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const errors = await validateDto({
      branchId: VALID_BRANCH_ID,
      code: 'KHO-01',
      name: 'Kho Chính',
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối branchId không phải UUID', async () => {
    const errors = await validateDto({
      branchId: 'not-a-uuid',
      code: 'KHO-01',
      name: 'Kho Chính',
    });
    expect(errors.some((e) => e.property === 'branchId')).toBe(true);
  });

  it('từ chối name ngắn hơn 3 ký tự', async () => {
    const errors = await validateDto({
      branchId: VALID_BRANCH_ID,
      code: 'KHO-01',
      name: 'ab',
    });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('từ chối code rỗng', async () => {
    const errors = await validateDto({
      branchId: VALID_BRANCH_ID,
      code: '',
      name: 'Kho Chính',
    });
    expect(errors.some((e) => e.property === 'code')).toBe(true);
  });

  it('từ chối type không nằm trong enum', async () => {
    const errors = await validateDto({
      branchId: VALID_BRANCH_ID,
      code: 'KHO-01',
      name: 'Kho Chính',
      type: 'UNKNOWN',
    });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it.each(['0987654321', '+84987654321'])(
    'chấp nhận phone đúng định dạng: %s',
    async (phone) => {
      const errors = await validateDto({
        branchId: VALID_BRANCH_ID,
        code: 'KHO-01',
        name: 'Kho Chính',
        phone,
      });
      expect(errors.some((e) => e.property === 'phone')).toBe(false);
    },
  );

  it.each(['12345', 'abc-987-654', '098-765-4321'])(
    'từ chối phone sai định dạng: %s',
    async (phone) => {
      const errors = await validateDto({
        branchId: VALID_BRANCH_ID,
        code: 'KHO-01',
        name: 'Kho Chính',
        phone,
      });
      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    },
  );

  it('từ chối email sai định dạng', async () => {
    const errors = await validateDto({
      branchId: VALID_BRANCH_ID,
      code: 'KHO-01',
      name: 'Kho Chính',
      email: 'not-an-email',
    });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('chấp nhận đầy đủ field tùy chọn', async () => {
    const errors = await validateDto({
      branchId: VALID_BRANCH_ID,
      managerId: VALID_BRANCH_ID,
      code: 'KHO-01',
      name: 'Kho Chính',
      type: 'RETAIL',
      address: '123 Đường ABC',
      phone: '0987654321',
      email: 'kho@example.com',
      description: 'Kho chính tại Hà Nội',
      status: 'ACTIVE',
    });
    expect(errors).toHaveLength(0);
  });
});
