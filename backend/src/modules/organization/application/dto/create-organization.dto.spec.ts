import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrganizationDto } from './create-organization.dto';

describe('CreateOrganizationDto validation', () => {
  const valid = {
    organization: { displayName: 'Acme Co', slug: 'acme-co' },
    owner: {
      fullName: 'Owner Name',
      email: 'owner@acme.com',
      password: 'Password123',
    },
  };

  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const dto = plainToInstance(CreateOrganizationDto, valid);
    const errors = await validate(dto, { whitelist: true });
    expect(errors).toHaveLength(0);
  });

  it('từ chối slug có ký tự hoa/khoảng trắng', async () => {
    const dto = plainToInstance(CreateOrganizationDto, {
      ...valid,
      organization: { ...valid.organization, slug: 'Acme Co' },
    });
    const errors = await validate(dto);
    const orgErrors = errors.find((e) => e.property === 'organization');
    expect(orgErrors?.children?.some((c) => c.property === 'slug')).toBe(true);
  });

  it('từ chối displayName ngắn hơn 3 ký tự', async () => {
    const dto = plainToInstance(CreateOrganizationDto, {
      ...valid,
      organization: { ...valid.organization, displayName: 'Ab' },
    });
    const errors = await validate(dto);
    const orgErrors = errors.find((e) => e.property === 'organization');
    expect(orgErrors?.children?.some((c) => c.property === 'displayName')).toBe(
      true,
    );
  });

  it('từ chối owner.email không hợp lệ', async () => {
    const dto = plainToInstance(CreateOrganizationDto, {
      ...valid,
      owner: { ...valid.owner, email: 'not-an-email' },
    });
    const errors = await validate(dto);
    const ownerErrors = errors.find((e) => e.property === 'owner');
    expect(ownerErrors?.children?.some((c) => c.property === 'email')).toBe(
      true,
    );
  });

  it('từ chối owner.password ngắn hơn 8 ký tự', async () => {
    const dto = plainToInstance(CreateOrganizationDto, {
      ...valid,
      owner: { ...valid.owner, password: 'short' },
    });
    const errors = await validate(dto);
    const ownerErrors = errors.find((e) => e.property === 'owner');
    expect(ownerErrors?.children?.some((c) => c.property === 'password')).toBe(
      true,
    );
  });
});
