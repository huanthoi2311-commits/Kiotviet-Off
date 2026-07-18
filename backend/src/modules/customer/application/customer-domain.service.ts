import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { CustomerEntity } from '../domain/entities/customer.entity';
import { CUSTOMER_REPOSITORY } from '../domain/repositories/customer.repository.interface';
import type { ICustomerRepository } from '../domain/repositories/customer.repository.interface';

/**
 * Cửa ngõ ĐỌC công khai duy nhất của `Customer` cho module khác (SPEC-T011-CUSTOMER-001 §9.3,
 * Decision CR08/CR09/SR03/SR04, ADR-0010 — Repository Boundary). Thay thế việc `checkout`/
 * `customer-point` inject thẳng `CUSTOMER_REPOSITORY` (vi phạm ADR-0010 tồn tại từ trước T011).
 * Đúng 6 method RFC/SPEC yêu cầu — không thêm (Decision SR03: "6 method là đủ. Không bổ sung thêm").
 */
@Injectable()
export class CustomerDomainService {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepository: ICustomerRepository,
  ) {}

  findById(
    organizationId: string,
    customerId: string,
  ): Promise<CustomerEntity | null> {
    return this.customerRepository.findById(customerId, organizationId);
  }

  async findActiveById(
    organizationId: string,
    customerId: string,
  ): Promise<CustomerEntity | null> {
    const customer = await this.customerRepository.findById(
      customerId,
      organizationId,
    );
    return customer && customer.status !== 'ARCHIVED' ? customer : null;
  }

  async findUsableForSale(
    organizationId: string,
    customerId: string,
  ): Promise<CustomerEntity | null> {
    const customer = await this.customerRepository.findById(
      customerId,
      organizationId,
    );
    return customer && customer.status === 'ACTIVE' ? customer : null;
  }

  existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean> {
    return this.customerRepository.existsByCode(
      organizationId,
      code,
      excludeId,
    );
  }

  async assertBelongsToOrganization(
    organizationId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.customerRepository.findById(
      customerId,
      organizationId,
    );
    if (!customer) {
      throw new NotFoundException(
        withCode(ErrorCode.CUSTOMER_NOT_FOUND, 'Không tìm thấy khách hàng'),
      );
    }
  }

  async assertNotArchived(
    organizationId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.customerRepository.findById(
      customerId,
      organizationId,
    );
    if (customer?.status === 'ARCHIVED') {
      throw new UnprocessableEntityException(
        withCode(ErrorCode.CUSTOMER_ARCHIVED, 'Khách hàng đã bị lưu trữ'),
      );
    }
  }
}
