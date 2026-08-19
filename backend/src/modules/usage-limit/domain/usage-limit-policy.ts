import { ConflictException } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { UsageResourceType } from './usage-resource-type';

const RESOURCE_LABEL: Record<UsageResourceType, string> = {
  USER: 'người dùng',
  BRANCH: 'chi nhánh',
  WAREHOUSE: 'kho',
  PRODUCT: 'sản phẩm',
  CUSTOMER: 'khách hàng',
};

export interface AssertUsageCapacityParams {
  resource: UsageResourceType;
  currentUsage: number;
  limit: number | null;
  /** Số đơn vị hạn mức thao tác này sẽ tiêu thụ nếu thành công — mặc định 1 (1 CREATE/RESTORE =
   * 1 dòng). Cho phép > 1 cho 1 thao tác tạo nhiều dòng cùng lúc trong 1 request (nếu có), cùng 1
   * công thức, không tách nhánh single/batch riêng. */
  incrementBy?: number;
}

/**
 * T053.05B — policy THUẦN (pure), không I/O. `limit === null` nghĩa là KHÔNG giới hạn (Architect
 * Decision — không dùng sentinel số lớn). Từ chối khi `currentUsage + incrementBy > limit`, tương
 * đương "currentUsage >= limit" khi incrementBy=1 (đã dùng hết đúng bằng hạn mức cũng bị chặn, dù
 * currentUsage đã VƯỢT limit từ trước do downgrade — hành vi giống nhau, chỉ chặn CREATE/RESTORE
 * tiếp theo, không đụng tới dữ liệu hiện có).
 */
export function assertUsageCapacity(params: AssertUsageCapacityParams): void {
  const { resource, currentUsage, limit, incrementBy = 1 } = params;
  if (limit === null) return;
  if (currentUsage + incrementBy > limit) {
    throw new ConflictException(
      withCode(
        ErrorCode.SUBSCRIPTION_USAGE_LIMIT_REACHED,
        `Bạn đã sử dụng ${currentUsage}/${limit} ${RESOURCE_LABEL[resource]} được phép trong gói hiện tại.`,
      ),
    );
  }
}
