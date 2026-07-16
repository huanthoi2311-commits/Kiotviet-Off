import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AuthUserEntity } from '../../domain/entities/auth-user.entity';
import { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.interface';

@Injectable()
export class PrismaAuthUserRepository implements IAuthUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrganizationSlugAndEmail(
    organizationSlug: string,
    email: string,
  ): Promise<AuthUserEntity | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
        organization: { slug: organizationSlug, deletedAt: null },
      },
    });
    return user ? this.toEntity(user) : null;
  }

  async findById(id: string): Promise<AuthUserEntity | null> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    return user ? this.toEntity(user) : null;
  }

  async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async updateLastLoginAt(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  private toEntity(user: {
    id: string;
    organizationId: string;
    branchId: string | null;
    email: string;
    username: string;
    passwordHash: string;
    status: string;
    permissionVersion: number;
    isPlatformAdmin: boolean;
  }): AuthUserEntity {
    return {
      id: user.id,
      organizationId: user.organizationId,
      branchId: user.branchId,
      email: user.email,
      username: user.username,
      passwordHash: user.passwordHash,
      status: user.status as AuthUserEntity['status'],
      permissionVersion: user.permissionVersion,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }
}
