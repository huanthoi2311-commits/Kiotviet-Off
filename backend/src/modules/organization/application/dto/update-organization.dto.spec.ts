import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateOrganizationDto } from './update-organization.dto';

describe('UpdateOrganizationDto validation', () => {
  it('hợp lệ khi không truyền field nào (mọi field optional)', async () => {
    const dto = plainToInstance(UpdateOrganizationDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('hợp lệ với timezone/currencyCode đúng', async () => {
    const dto = plainToInstance(UpdateOrganizationDto, {
      timezone: 'Asia/Ho_Chi_Minh',
      currencyCode: 'VND',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối timezone không hợp lệ', async () => {
    const dto = plainToInstance(UpdateOrganizationDto, {
      timezone: 'Not/A_Zone',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'timezone')).toBe(true);
  });

  it('từ chối currencyCode không hợp lệ', async () => {
    const dto = plainToInstance(UpdateOrganizationDto, {
      currencyCode: 'NOTREAL',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'currencyCode')).toBe(true);
  });

  it('không có field code/slug/status/ownerUserId (bất biến — DTO không khai báo)', () => {
    const dto = new UpdateOrganizationDto();
    expect('code' in dto).toBe(false);
    expect('slug' in dto).toBe(false);
    expect('status' in dto).toBe(false);
    expect('ownerUserId' in dto).toBe(false);
  });
});
