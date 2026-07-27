import { EligibleQuantityResult } from '../return-eligibility.service';
import {
  SalesReturnEntity,
  SalesReturnItemEntity,
  SalesReturnRefundEntity,
} from '../../domain/entities/sales-return.entity';
import {
  PaginatedSalesReturnResponseDto,
  SalesReturnEligibilityResponseDto,
  SalesReturnItemResponseDto,
  SalesReturnRefundResponseDto,
  SalesReturnResponseDto,
} from '../dto/sales-return-response.dto';
import { SalesReturnSearchResult } from '../../domain/repositories/sales-return.repository.interface';

/**
 * Entity (domain) → ResponseDto (presentation) — 1:1 field mirror theo SPEC §10. Đặt ở Phase 5
 * (API/DTO layer), KHÔNG đổi kiểu trả về của `SalesReturnService`/`RefundDomainService` (đã
 * APPROVED ở Phase 3/4) — tách biệt rõ Domain Entity khỏi HTTP Response shape.
 */
export class SalesReturnMapper {
  static toItemResponseDto(
    item: SalesReturnItemEntity,
  ): SalesReturnItemResponseDto {
    return { ...item };
  }

  static toRefundResponseDto(
    refund: SalesReturnRefundEntity,
  ): SalesReturnRefundResponseDto {
    return { ...refund };
  }

  static toResponseDto(salesReturn: SalesReturnEntity): SalesReturnResponseDto {
    return {
      ...salesReturn,
      items: salesReturn.items.map((item) =>
        SalesReturnMapper.toItemResponseDto(item),
      ),
      refunds: salesReturn.refunds.map((refund) =>
        SalesReturnMapper.toRefundResponseDto(refund),
      ),
    };
  }

  static toPaginatedResponseDto(
    result: SalesReturnSearchResult,
  ): PaginatedSalesReturnResponseDto {
    return {
      items: result.items.map((item) => SalesReturnMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  static toEligibilityResponseDto(
    result: EligibleQuantityResult,
  ): SalesReturnEligibilityResponseDto {
    return { ...result };
  }
}
