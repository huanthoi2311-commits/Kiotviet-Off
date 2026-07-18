import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Abstraction dùng chung cho mọi generator mã dạng "PREFIX + số thứ tự nguyên tử"
 * (T012 SPEC-T012-SUPPLIER-001 §9.3b, Decision SP05) — thay vì mỗi module tự viết lại
 * `prisma.sequence.upsert()`. Đăng ký trong `PrismaModule` (`@Global()`) nên có sẵn ở
 * mọi module không cần import tường minh, giống `PrismaService`.
 *
 * Phạm vi T012 (Decision SP05 — công khai, không âm thầm mở rộng): CHỈ áp dụng cho
 * `SequenceCustomerCodeGenerator` (refactor) và `SequenceSupplierCodeGenerator` (mới).
 * 8 generator `Sequence*Generator` khác đã tồn tại trong dự án (branch, inventory-adjustment,
 * invoice, organization, product/sku, purchase-order, purchase-return, stock-count, transfer)
 * KHÔNG bị đụng tới — cùng pattern trùng lặp, ghi nhận làm technical debt cho một task hạ tầng
 * riêng trong tương lai nếu Architect muốn dọn toàn bộ.
 */
@Injectable()
export class SequenceCodeGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(
    organizationId: string,
    sequenceName: string,
    prefix: string,
    padLength: number,
  ): Promise<string> {
    const sequence = await this.prisma.sequence.upsert({
      where: { organizationId_name: { organizationId, name: sequenceName } },
      create: { organizationId, name: sequenceName, value: 1 },
      update: { value: { increment: 1 } },
    });

    return `${prefix}${sequence.value.toString().padStart(padLength, '0')}`;
  }
}
