import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ArchiveOrganizationDto } from './archive-organization.dto';
import { OrganizationQueryDto } from './organization-query.dto';
import { TransferOwnerDto } from './transfer-owner.dto';

const UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('TransferOwnerDto validation', () => {
  it('hợp lệ với UUID', async () => {
    const dto = plainToInstance(TransferOwnerDto, { newOwnerUserId: UUID });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối giá trị không phải UUID', async () => {
    const dto = plainToInstance(TransferOwnerDto, {
      newOwnerUserId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'newOwnerUserId')).toBe(true);
  });
});

describe('ArchiveOrganizationDto validation', () => {
  it('hợp lệ với confirmSlug là string', async () => {
    const dto = plainToInstance(ArchiveOrganizationDto, {
      confirmSlug: 'acme',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối khi thiếu confirmSlug', async () => {
    const dto = plainToInstance(ArchiveOrganizationDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'confirmSlug')).toBe(true);
  });
});

describe('OrganizationQueryDto validation', () => {
  it('áp default page/limit', async () => {
    const dto = plainToInstance(OrganizationQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('hợp lệ với status thuộc enum', async () => {
    const dto = plainToInstance(OrganizationQueryDto, { status: 'ACTIVE' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối status không thuộc enum', async () => {
    const dto = plainToInstance(OrganizationQueryDto, { status: 'DELETED' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});
