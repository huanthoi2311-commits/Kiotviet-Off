import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import {
  CustomerEntity,
  CustomerStatus,
} from '../../domain/entities/customer.entity';
import { CustomerConcurrencyConflictError } from '../../domain/errors/customer.errors';
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
          phone: input.phone ?? null,
          email: input.email ?? null,
          birthday: input.birthday ?? null,
          gender: input.gender ?? null,
          taxCode: input.taxCode ?? null,
          companyName: input.companyName ?? null,
          contactName: input.contactName ?? null,
          address: input.address ?? null,
          province: input.province ?? null,
          district: input.district ?? null,
          ward: input.ward ?? null,
          avatar: input.avatar ?? null,
          note: input.note ?? null,
          creditLimit: input.creditLimit ?? null,
          paymentTermDays: input.paymentTermDays ?? null,
          status: 'ACTIVE',
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

  async findByCode(
    organizationId: string,
    code: string,
  ): Promise<CustomerEntity | null> {
    const customer = await this.prisma.customer.findFirst({
      where: { organizationId, code, deletedAt: null },
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
    organizationId: string,
    expectedVersion: number,
    input: UpdateCustomerInput,
  ): Promise<CustomerEntity> {
    try {
      const result = await this.prisma.customer.updateMany({
        where: { id, organizationId, version: expectedVersion },
        data: {
          customerType: input.customerType,
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          birthday: input.birthday,
          gender: input.gender,
          taxCode: input.taxCode,
          companyName: input.companyName,
          contactName: input.contactName,
          address: input.address,
          province: input.province,
          district: input.district,
          ward: input.ward,
          avatar: input.avatar,
          note: input.note,
          creditLimit: input.creditLimit,
          paymentTermDays: input.paymentTermDays,
          updatedBy: input.updatedBy,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new CustomerConcurrencyConflictError(id);
      }
      const updated = await this.prisma.customer.findUniqueOrThrow({
        where: { id },
      });
      return this.toEntity(updated);
    } catch (error) {
      if (error instanceof CustomerConcurrencyConflictError) throw error;
      throw this.translateWriteError(error);
    }
  }

  async changeStatusWithVersion(
    id: string,
    organizationId: string,
    expectedVersion: number,
    status: CustomerStatus,
    updatedBy: string,
  ): Promise<CustomerEntity> {
    const result = await this.prisma.customer.updateMany({
      where: { id, organizationId, version: expectedVersion },
      data: { status, updatedBy, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new CustomerConcurrencyConflictError(id);
    }
    const updated = await this.prisma.customer.findUniqueOrThrow({
      where: { id },
    });
    return this.toEntity(updated);
  }

  async softDelete(
    id: string,
    organizationId: string,
    expectedVersion: number,
    deletedBy: string,
  ): Promise<void> {
    const result = await this.prisma.customer.updateMany({
      where: { id, organizationId, version: expectedVersion },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
        updatedBy: deletedBy,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new CustomerConcurrencyConflictError(id);
    }
  }

  async restore(
    id: string,
    organizationId: string,
    expectedVersion: number,
    restoredBy: string,
  ): Promise<void> {
    const result = await this.prisma.customer.updateMany({
      where: { id, organizationId, version: expectedVersion },
      data: {
        deletedAt: null,
        status: 'INACTIVE',
        updatedBy: restoredBy,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new CustomerConcurrencyConflictError(id);
    }
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

  async existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean> {
    const found = await this.prisma.customer.findFirst({
      where: {
        organizationId,
        code,
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
      return new ConflictException(
        withCode(
          ErrorCode.CUSTOMER_DUPLICATE,
          `Giá trị của "${target}" đã tồn tại`,
        ),
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
      contactName: customer.contactName,
      address: customer.address,
      province: customer.province,
      district: customer.district,
      ward: customer.ward,
      avatar: customer.avatar,
      note: customer.note,
      creditLimit: customer.creditLimit?.toString() ?? null,
      paymentTermDays: customer.paymentTermDays,
      currentDebt: customer.currentDebt.toString(),
      totalRevenue: customer.totalRevenue.toString(),
      totalOrder: customer.totalOrder,
      totalPoint: customer.totalPoint,
      status: customer.status,
      version: customer.version,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      deletedAt: customer.deletedAt,
    };
  }
}
