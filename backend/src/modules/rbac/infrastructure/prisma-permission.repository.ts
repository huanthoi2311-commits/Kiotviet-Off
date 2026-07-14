import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PermissionEntity } from '../domain/entities/permission.entity';
import { IPermissionRepository } from '../domain/repositories/permission.repository.interface';

@Injectable()
export class PrismaPermissionRepository implements IPermissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PermissionEntity[]> {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  async findByCodes(codes: string[]): Promise<PermissionEntity[]> {
    return this.prisma.permission.findMany({ where: { code: { in: codes } } });
  }
}
