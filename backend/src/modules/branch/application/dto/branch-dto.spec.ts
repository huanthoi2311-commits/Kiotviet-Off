import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BranchQueryDto } from './branch-query.dto';
import { CreateBranchDto } from './create-branch.dto';
import { UpdateBranchDto } from './update-branch.dto';

describe('CreateBranchDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const dto = plainToInstance(CreateBranchDto, { name: 'Chi nhánh HN' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('hợp lệ với timezone/currencyCode/email đầy đủ', async () => {
    const dto = plainToInstance(CreateBranchDto, {
      name: 'Chi nhánh HN',
      email: 'hn@acme.com',
      timezone: 'Asia/Ho_Chi_Minh',
      currencyCode: 'VND',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối email không hợp lệ', async () => {
    const dto = plainToInstance(CreateBranchDto, {
      name: 'Chi nhánh HN',
      email: 'not-an-email',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('từ chối timezone không hợp lệ', async () => {
    const dto = plainToInstance(CreateBranchDto, {
      name: 'Chi nhánh HN',
      timezone: 'Not/A_Zone',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'timezone')).toBe(true);
  });

  it('từ chối currencyCode không hợp lệ', async () => {
    const dto = plainToInstance(CreateBranchDto, {
      name: 'Chi nhánh HN',
      currencyCode: 'NOTREAL',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'currencyCode')).toBe(true);
  });

  it('từ chối thiếu name', async () => {
    const dto = plainToInstance(CreateBranchDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});

describe('UpdateBranchDto validation', () => {
  it('hợp lệ khi không truyền field nào', async () => {
    const dto = plainToInstance(UpdateBranchDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('không có field code (bất biến — DTO không khai báo)', () => {
    const dto = new UpdateBranchDto();
    expect('code' in dto).toBe(false);
  });
});

describe('BranchQueryDto validation', () => {
  it('áp default page/limit', async () => {
    const dto = plainToInstance(BranchQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('từ chối status không thuộc enum', async () => {
    const dto = plainToInstance(BranchQueryDto, { status: 'DELETED' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});
