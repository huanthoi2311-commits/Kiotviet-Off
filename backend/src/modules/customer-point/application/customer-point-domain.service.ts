import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomerPointLedgerEntity } from '../domain/entities/customer-point-ledger.entity';
import { CUSTOMER_POINT_REPOSITORY } from '../domain/repositories/customer-point.repository.interface';
import type {
  ICustomerPointRepository,
  UsePointInput,
} from '../domain/repositories/customer-point.repository.interface';

/**
 * Cửa ngõ GHI công khai duy nhất của `Customer Point` cho module khác (T013 Phase 2,
 * SPEC-T013-SALES-FOUNDATION-001 §9.2, ADR-0010 — Repository Boundary). Thay thế việc
 * `checkout` inject thẳng `CUSTOMER_POINT_REPOSITORY` (vi phạm ADR-0010 tồn tại từ trước T013).
 * Đúng 1 method Checkout cần — không thêm. `CustomerPointInsufficientBalanceError` không đổi,
 * Checkout tiếp tục bắt bằng `instanceof` như hiện có.
 */
@Injectable()
export class CustomerPointDomainService {
  constructor(
    @Inject(CUSTOMER_POINT_REPOSITORY)
    private readonly customerPointRepository: ICustomerPointRepository,
  ) {}

  usePoint(
    input: UsePointInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CustomerPointLedgerEntity> {
    return this.customerPointRepository.usePoint(input, tx);
  }
}
