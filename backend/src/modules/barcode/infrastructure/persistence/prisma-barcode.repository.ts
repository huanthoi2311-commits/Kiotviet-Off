import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { BarcodeEntity } from '../../domain/entities/barcode.entity';
import {
  CreateBarcodeInput,
  IBarcodeRepository,
  UpdateBarcodeInput,
} from '../../domain/repositories/barcode.repository.interface';

type RawBarcode = Prisma.BarcodeGetPayload<Record<string, never>>;

@Injectable()
export class PrismaBarcodeRepository implements IBarcodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateBarcodeInput): Promise<BarcodeEntity> {
    try {
      if (input.isDefault) {
        return await this.prisma.$transaction(async (tx) => {
          await tx.barcode.updateMany({
            where: { productId: input.productId, isDefault: true },
            data: { isDefault: false },
          });
          const barcode = await tx.barcode.create({
            data: {
              productId: input.productId,
              unitId: input.unitId ?? null,
              code: input.code,
              type: input.type,
              isDefault: true,
              createdBy: input.createdBy,
              updatedBy: input.createdBy,
            },
          });
          return this.toEntity(barcode);
        });
      }

      const barcode = await this.prisma.barcode.create({
        data: {
          productId: input.productId,
          unitId: input.unitId ?? null,
          code: input.code,
          type: input.type,
          isDefault: false,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
      });
      return this.toEntity(barcode);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<BarcodeEntity | null> {
    const barcode = await this.prisma.barcode.findFirst({
      where: {
        id,
        deletedAt: null,
        product: { organizationId, deletedAt: null },
      },
    });
    return barcode ? this.toEntity(barcode) : null;
  }

  async listByProduct(
    productId: string,
    organizationId: string,
  ): Promise<BarcodeEntity[]> {
    const barcodes = await this.prisma.barcode.findMany({
      where: {
        productId,
        deletedAt: null,
        product: { organizationId, deletedAt: null },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return barcodes.map((barcode) => this.toEntity(barcode));
  }

  async update(id: string, input: UpdateBarcodeInput): Promise<BarcodeEntity> {
    try {
      const barcode = await this.prisma.barcode.update({
        where: { id },
        data: {
          code: input.code,
          type: input.type,
          unitId: input.unitId,
          updatedBy: input.updatedBy,
        },
      });
      return this.toEntity(barcode);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.prisma.barcode.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  }

  async setDefault(
    id: string,
    productId: string,
    updatedBy: string,
  ): Promise<BarcodeEntity> {
    return this.prisma.$transaction(async (tx) => {
      await tx.barcode.updateMany({
        where: { productId, isDefault: true },
        data: { isDefault: false },
      });
      const barcode = await tx.barcode.update({
        where: { id },
        data: { isDefault: true, updatedBy },
      });
      return this.toEntity(barcode);
    });
  }

  async existsByCode(code: string, excludeId?: string): Promise<boolean> {
    const found = await this.prisma.barcode.findFirst({
      where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!found;
  }

  private translateWriteError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new ConflictException(
          withCode(
            ErrorCode.BARCODE_DUPLICATE,
            'Mã vạch này đã tồn tại trong hệ thống',
          ),
        );
      }
      if (error.code === 'P2003') {
        return new BadRequestException(
          withCode(
            ErrorCode.VALIDATION_FAILED,
            'Giá trị "unitId" không tồn tại',
          ),
        );
      }
    }
    return error as Error;
  }

  private toEntity(barcode: RawBarcode): BarcodeEntity {
    return {
      id: barcode.id,
      productId: barcode.productId,
      unitId: barcode.unitId,
      code: barcode.code,
      type: barcode.type,
      isDefault: barcode.isDefault,
      createdAt: barcode.createdAt,
      updatedAt: barcode.updatedAt,
      deletedAt: barcode.deletedAt,
    };
  }
}
