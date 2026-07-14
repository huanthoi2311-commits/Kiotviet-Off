import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUserEntity } from '../../domain/entities/auth-user.entity';
import { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.interface';
import { JwtAccessStrategy } from './jwt-access.strategy';

describe('JwtAccessStrategy', () => {
  let strategy: JwtAccessStrategy;
  let userRepository: jest.Mocked<IAuthUserRepository>;
  const config = new ConfigService({ jwt: { accessSecret: 'access-secret' } });

  const user: AuthUserEntity = {
    id: 'user-1',
    organizationId: 'org-1',
    branchId: null,
    email: 'a@b.com',
    username: 'a',
    passwordHash: 'x',
    status: 'ACTIVE',
    permissionVersion: 5,
  };

  beforeEach(() => {
    userRepository = {
      findByOrganizationSlugAndEmail: jest.fn(),
      findById: jest.fn(),
      updatePasswordHash: jest.fn(),
      updateLastLoginAt: jest.fn(),
    };
    strategy = new JwtAccessStrategy(config, userRepository);
  });

  const payload = {
    sub: 'user-1',
    organizationId: 'org-1',
    branchId: null,
    email: 'a@b.com',
    permissions: ['product:view'],
    permissionVersion: 5,
  };

  it('cho qua khi permissionVersion khớp với DB hiện tại', async () => {
    userRepository.findById.mockResolvedValue(user);
    await expect(strategy.validate(payload)).resolves.toEqual(payload);
  });

  it('từ chối khi permissionVersion trong JWT lệch với DB (quyền đã đổi)', async () => {
    userRepository.findById.mockResolvedValue({
      ...user,
      permissionVersion: 6,
    });
    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('từ chối khi user không còn tồn tại', async () => {
    userRepository.findById.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('từ chối khi tài khoản không ACTIVE', async () => {
    userRepository.findById.mockResolvedValue({ ...user, status: 'LOCKED' });
    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
