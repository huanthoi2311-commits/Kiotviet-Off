import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UserEntity, UserStatus } from '../../domain/entities/user.entity';
import {
  CreateUserInput,
  IUserRepository,
  UpdateUserInput,
  UserEmailConflictError,
  UserSearchParams,
  UserSearchResult,
  UserUsernameConflictError,
} from '../../domain/repositories/user.repository.interface';

type RawUser = Prisma.UserGetPayload<{
  select: {
    id: true;
    organizationId: true;
    branchId: true;
    username: true;
    fullName: true;
    email: true;
    phone: true;
    avatar: true;
    status: true;
    lastLoginAt: true;
    createdAt: true;
    updatedAt: true;
  };
}>;

const USER_SELECT = {
  id: true,
  organizationId: true,
  branchId: true,
  username: true,
  fullName: true,
  email: true,
  phone: true,
  avatar: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    id: string,
    organizationId: string,
  ): Promise<UserEntity | null> {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: USER_SELECT,
    });
    return user ? this.toEntity(user) : null;
  }

  async search(params: UserSearchParams): Promise<UserSearchResult> {
    const where: Prisma.UserWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      status: params.status,
      ...(params.search
        ? {
            OR: [
              { username: { contains: params.search, mode: 'insensitive' } },
              { fullName: { contains: params.search, mode: 'insensitive' } },
              { email: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { username: 'asc' },
        skip,
        take: params.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async existsByUsername(
    organizationId: string,
    username: string,
  ): Promise<boolean> {
    const found = await this.prisma.user.findFirst({
      where: { organizationId, username },
      select: { id: true },
    });
    return !!found;
  }

  async existsByEmail(organizationId: string, email: string): Promise<boolean> {
    const found = await this.prisma.user.findFirst({
      where: { organizationId, email },
      select: { id: true },
    });
    return !!found;
  }

  async create(input: CreateUserInput): Promise<UserEntity> {
    try {
      const user = await this.prisma.user.create({
        data: {
          organizationId: input.organizationId,
          branchId: input.branchId ?? null,
          username: input.username,
          fullName: input.fullName ?? null,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash: input.passwordHash,
          status: 'ACTIVE',
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
        select: USER_SELECT,
      });
      return this.toEntity(user);
    } catch (error) {
      throw this.translateWriteError(error, input.username, input.email);
    }
  }

  /** Service phải gọi findById(id, organizationId) trước để xác nhận tồn tại + đúng tenant
   * (cùng pattern đã có ở BranchRepository — không có version/CAS, xem D6). */
  async update(
    id: string,
    _organizationId: string,
    input: UpdateUserInput,
  ): Promise<UserEntity> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          branchId: input.branchId,
          fullName: input.fullName,
          phone: input.phone,
          avatar: input.avatar,
          updatedBy: input.updatedBy,
        },
        select: USER_SELECT,
      });
      return this.toEntity(user);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async updateStatus(
    id: string,
    _organizationId: string,
    status: UserStatus,
    updatedBy: string,
  ): Promise<UserEntity> {
    const user = await this.prisma.user.update({
      where: { id },
      data: { status, updatedBy },
      select: USER_SELECT,
    });
    return this.toEntity(user);
  }

  async updatePasswordHash(
    id: string,
    _organizationId: string,
    passwordHash: string,
    updatedBy: string,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, updatedBy },
    });
  }

  private translateWriteError(
    error: unknown,
    username?: string,
    email?: string,
  ): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = (error.meta?.target as string[] | undefined) ?? [];
      if (target.includes('username') && username) {
        return new UserUsernameConflictError(username);
      }
      if (target.includes('email') && email) {
        return new UserEmailConflictError(email);
      }
    }
    return error as Error;
  }

  private toEntity(user: RawUser): UserEntity {
    return {
      id: user.id,
      organizationId: user.organizationId,
      branchId: user.branchId,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
