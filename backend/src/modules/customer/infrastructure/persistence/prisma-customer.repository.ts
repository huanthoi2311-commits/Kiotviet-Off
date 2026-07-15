import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { CustomerEntity } from '../../domain/entities/customer.entity';
import {
  CreateCustomerInput,
  CustomerSearchParams,
  CustomerSearchResult,
  ICustomerRepository,
  UpdateCustomerInput,
} from '../../domain/repositories/customer.repository.interface';

type RawCustomer = Prisma.CustomerGetPayload<Record<string, never>>;

@Injectable()
export class PrismaCustomerRepository implements ICustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCustomerInput): Promise<CustomerEntity> {
    try {
      const customer = await this.prisma.customer.create({
        data: {
          organizationId: input.organizationId,
          code: input.code,
          customerType: input.customerType ?? 'RETAIL',
          fullName: input.fullName,
          phone: input.phone,
          email: input.email ?? null,
          birthday: input.birthday ?? null,
          gender: input.gender ?? null,
          taxCode: input.taxCode ?? null,
          companyName: input.companyName ?? null,
          address: input.address ?? null,
          province: input.province ?? null,
          district: input.district ?? null,
          ward: input.ward ?? null,
          avatar: input.avatar ?? null,
          note: input.note ?? null,
          creditLimit: input.creditLimit ?? null,
          status: input.status ?? 'ACTIVE',
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
      });
      return this.toEntity(customer);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<CustomerEntity | null> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    return customer ? this.toEntity(customer) : null;
  }

  async findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<CustomerEntity | null> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
    });
    return customer ? this.toEntity(customer) : null;
  }

  async update(
    id: string,
    input: UpdateCustomerInput,
  ): Promise<CustomerEntity> {
    try {
      const customer = await this.prisma.customer.update({
        where: { id },
        data: {
          code: input.code,
          customerType: input.customerType,
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          birthday: input.birthday,
          gender: input.gender,
          taxCode: input.taxCode,
          companyName: input.companyName,
          address: input.address,
          province: input.province,
          district: input.district,
          ward: input.ward,
          avatar: input.avatar,
          note: input.note,
          creditLimit: input.creditLimit,
          status: input.status,
          updatedBy: input.updatedBy,
        },
      });
      return this.toEntity(customer);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  }

  async restore(id: string, restoredBy: string): Promise<void> {
    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: null, updatedBy: restoredBy },
    });
  }

  async search(params: CustomerSearchParams): Promise<CustomerSearchResult> {
    const where = this.buildWhere(params);
    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip,
        take: params.limit,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async existsByPhone(
    organizationId: string,
    phone: string,
    excludeId?: string,
  ): Promise<boolean> {
    const found = await this.prisma.customer.findFirst({
      where: {
        organizationId,
        phone,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return !!found;
  }

  async syncTotalPoint(customerId: string, totalPoint: number): Promise<void> {
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { totalPoint },
    });
  }

  private buildWhere(
    params: Omit<
      CustomerSearchParams,
      'page' | 'limit' | 'sortBy' | 'sortOrder'
    >,
  ): Prisma.CustomerWhereInput {
    return {
      organizationId: params.organizationId,
      deletedAt: null,
      customerType: params.customerType,
      status: params.status,
      ...(params.search
        ? {
            OR: [
              { fullName: { contains: params.search, mode: 'insensitive' } },
              { phone: { contains: params.search, mode: 'insensitive' } },
              { email: { contains: params.search, mode: 'insensitive' } },
              {
                companyName: { contains: params.search, mode: 'insensitive' },
              },
              { taxCode: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private translateWriteError(error: unknown): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target =
        (error.meta?.target as string[] | undefined)?.join(', ') ??
        'trường dữ liệu';
      const errorCode = target.includes('phone')
        ? ErrorCode.CUSTOMER_PHONE_DUPLICATE
        : ErrorCode.CUSTOMER_DUPLICATE;
      return new ConflictException(
        withCode(errorCode, `Giá trị của "${target}" đã tồn tại`),
      );
    }
    return error as Error;
  }

  private toEntity(customer: RawCustomer): CustomerEntity {
    return {
      id: customer.id,
      organizationId: customer.organizationId,
      code: customer.code,
      customerType: customer.customerType,
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      birthday: customer.birthday,
      gender: customer.gender,
      taxCode: customer.taxCode,
      companyName: customer.companyName,
      address: customer.address,
      province: customer.province,
      district: customer.district,
      ward: customer.ward,
      avatar: customer.avatar,
      note: customer.note,
      creditLimit: customer.creditLimit?.toString() ?? null,
      currentDebt: customer.currentDebt.toString(),
      totalRevenue: customer.totalRevenue.toString(),
      totalOrder: customer.totalOrder,
      totalPoint: customer.totalPoint,
      status: customer.status,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      deletedAt: customer.deletedAt,
    };
  }
}
