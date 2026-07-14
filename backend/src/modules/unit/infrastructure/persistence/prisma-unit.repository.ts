import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { UnitEntity } from '../../domain/entities/unit.entity';
import {
  CreateUnitInput,
  IUnitRepository,
  UnitSearchParams,
  UnitSearchResult,
  UpdateUnitInput,
} from '../../domain/repositories/unit.repository.interface';

type RawUnit = Prisma.UnitGetPayload<Record<string, never>>;

@Injectable()
export class PrismaUnitRepository implements IUnitRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUnitInput): Promise<UnitEntity> {
    try {
      const unit = await this.prisma.unit.create({
        data: {
          organizationId: input.organizationId,
          code: input.code,
          name: input.name,
          symbol: input.symbol,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
      });
      return this.toEntity(unit);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<UnitEntity | null> {
    const unit = await this.prisma.unit.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    return unit ? this.toEntity(unit) : null;
  }

  async update(id: string, input: UpdateUnitInput): Promise<UnitEntity> {
    try {
      const unit = await this.prisma.unit.update({
        where: { id },
        data: {
          code: input.code,
          name: input.name,
          symbol: input.symbol,
          updatedBy: input.updatedBy,
        },
      });
      return this.toEntity(unit);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.prisma.unit.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  }

  async search(params: UnitSearchParams): Promise<UnitSearchResult> {
    const where: Prisma.UnitWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { code: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.unit.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: params.limit,
      }),
      this.prisma.unit.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean> {
    const found = await this.prisma.unit.findFirst({
      where: {
        organizationId,
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return !!found;
  }

  private translateWriteError(error: unknown): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target =
        (error.meta?.target as string[] | undefined)?.join(', ') ??
        'trường dữ liệu';
      return new ConflictException(
        withCode(
          ErrorCode.UNIT_DUPLICATE,
          `Giá trị của "${target}" đã tồn tại`,
        ),
      );
    }
    return error as Error;
  }

  private toEntity(unit: RawUnit): UnitEntity {
    return {
      id: unit.id,
      organizationId: unit.organizationId,
      code: unit.code,
      name: unit.name,
      symbol: unit.symbol,
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
      deletedAt: unit.deletedAt,
    };
  }
}
