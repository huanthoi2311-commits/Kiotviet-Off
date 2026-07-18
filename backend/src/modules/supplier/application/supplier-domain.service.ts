import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { SupplierEntity } from '../domain/entities/supplier.entity';
import { SUPPLIER_REPOSITORY } from '../domain/repositories/supplier.repository.interface';
import type { ISupplierRepository } from '../domain/repositories/supplier.repository.interface';

/**
 * Cửa ngõ ĐỌC công khai duy nhất của `Supplier` cho module khác (SPEC-T012-SUPPLIER-001 §9.3,
 * Decision SR05/SR06, ADR-0010 — Repository Boundary). Thay thế việc `supplier-debt` inject thẳng
 * `SUPPLIER_REPOSITORY` (vi phạm ADR-0010 tồn tại từ trước T012). Đúng 6 method RFC/SPEC yêu cầu —
 * không thêm, cùng khuôn mẫu `CustomerDomainService` (T011).
 */
@Injectable()
export class SupplierDomainService {
  constructor(
    @Inject(SUPPLIER_REPOSITORY)
    private readonly supplierRepository: ISupplierRepository,
  ) {}

  findById(
    organizationId: string,
    supplierId: string,
  ): Promise<SupplierEntity | null> {
    return this.supplierRepository.findById(supplierId, organizationId);
  }

  async findActiveById(
    organizationId: string,
    supplierId: string,
  ): Promise<SupplierEntity | null> {
    const supplier = await this.supplierRepository.findById(
      supplierId,
      organizationId,
    );
    return supplier && supplier.status !== 'ARCHIVED' ? supplier : null;
  }

  async findUsableForPurchase(
    organizationId: string,
    supplierId: string,
  ): Promise<SupplierEntity | null> {
    const supplier = await this.supplierRepository.findById(
      supplierId,
      organizationId,
    );
    return supplier && supplier.status === 'ACTIVE' ? supplier : null;
  }

  existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean> {
    return this.supplierRepository.existsByCode(
      organizationId,
      code,
      excludeId,
    );
  }

  async assertBelongsToOrganization(
    organizationId: string,
    supplierId: string,
  ): Promise<void> {
    const supplier = await this.supplierRepository.findById(
      supplierId,
      organizationId,
    );
    if (!supplier) {
      throw new NotFoundException(
        withCode(ErrorCode.SUPPLIER_NOT_FOUND, 'Không tìm thấy nhà cung cấp'),
      );
    }
  }

  async assertNotArchived(
    organizationId: string,
    supplierId: string,
  ): Promise<void> {
    const supplier = await this.supplierRepository.findById(
      supplierId,
      organizationId,
    );
    if (supplier?.status === 'ARCHIVED') {
      throw new UnprocessableEntityException(
        withCode(ErrorCode.SUPPLIER_ARCHIVED, 'Nhà cung cấp đã bị lưu trữ'),
      );
    }
  }
}
