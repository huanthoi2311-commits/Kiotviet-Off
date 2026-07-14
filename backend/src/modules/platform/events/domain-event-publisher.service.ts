import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Cơ chế phát Domain Event dùng chung toàn hệ thống (Prompt 031) — mọi module publish qua
 * đây thay vì gọi trực tiếp service của module khác. Subscriber đăng ký bằng `@OnEvent(eventName)`
 * ở bất kỳ provider nào trong ứng dụng (EventEmitterModule đã đăng ký global ở AppModule).
 */
@Injectable()
export class DomainEventPublisher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  publish<T extends object>(eventName: string, payload: T): void {
    this.eventEmitter.emit(eventName, payload);
  }
}
