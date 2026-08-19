import { Module } from '@nestjs/common';
import { UsageLimitService } from './application/usage-limit.service';

/**
 * T053.05B — module lá (leaf), mirror EntitlementModule (T053.03): KHÔNG import
 * User/Branch/Warehouse/Product/CustomerModule — nhờ vậy bất kỳ module resource nào cũng có thể
 * import UsageLimitModule một chiều mà KHÔNG bao giờ tạo vòng lặp (đã xác nhận qua
 * `madge --circular`, xem báo cáo cuối).
 */
@Module({
  providers: [UsageLimitService],
  exports: [UsageLimitService],
})
export class UsageLimitModule {}
