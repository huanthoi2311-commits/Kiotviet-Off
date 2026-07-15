import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  POINT_ADDED_EVENT,
  POINT_EXPIRED_EVENT,
  POINT_USED_EVENT,
} from '../../../customer-point/domain/events/customer-point.events';
import type { CustomerPointDomainEvent } from '../../../customer-point/domain/events/customer-point.events';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository.interface';
import type { ICustomerRepository } from '../../domain/repositories/customer.repository.interface';

/**
 * Đồng bộ `Customer.totalPoint` (cache đọc nhanh) từ Domain Event do Customer Point module
 * phát ra — Customer KHÔNG gọi trực tiếp CustomerPointService/Repository, chỉ lắng nghe sự
 * kiện đã có sẵn `balance` (được Customer Point tính đúng trong 1 transaction có khóa row).
 * Đây là cách hiện thực nguyên tắc "module trao đổi qua Domain Event, không gọi chéo Service"
 * (bắt buộc từ Prompt 031) — Customer vẫn là nơi DUY NHẤT ghi vào bảng `customers`.
 */
@Injectable()
export class CustomerPointSubscriber {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepository: ICustomerRepository,
  ) {}

  @OnEvent(POINT_ADDED_EVENT)
  async onPointAdded(event: CustomerPointDomainEvent): Promise<void> {
    await this.customerRepository.syncTotalPoint(
      event.customerId,
      event.balance,
    );
  }

  @OnEvent(POINT_USED_EVENT)
  async onPointUsed(event: CustomerPointDomainEvent): Promise<void> {
    await this.customerRepository.syncTotalPoint(
      event.customerId,
      event.balance,
    );
  }

  /** Chưa có nơi nào publish sự kiện này ở Prompt 032 (chưa có cron/endpoint hết hạn điểm) — sẵn sàng cho tương lai. */
  @OnEvent(POINT_EXPIRED_EVENT)
  async onPointExpired(event: CustomerPointDomainEvent): Promise<void> {
    await this.customerRepository.syncTotalPoint(
      event.customerId,
      event.balance,
    );
  }
}
