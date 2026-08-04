import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';

/**
 * T030.6 (RFC-T030 §5 Option D, Decision 1) — `@WebSocketGateway(...)` là decorator cấp class,
 * được đánh giá lúc module nạp (TRƯỚC khi DI container/ConfigService tồn tại), nên KHÔNG THỂ nhận
 * CORS origin đã validate qua ConfigService trực tiếp trong decorator. Đây là cơ chế
 * NestJS-supported hẹp nhất để cấu hình CORS ở runtime: một `IoAdapter` tùy biến, nhận mảng origin
 * ĐÃ PARSE SẴN qua constructor (từ `main.ts`, cùng giá trị `ConfigService.get('cors.origins')` mà
 * REST dùng — xem `backend/src/config/cors.util.ts`) — không tự đọc biến môi trường CORS_ORIGIN,
 * không parse lại theo cách khác. `app.gateway.ts` không còn khai báo `cors` trong decorator; adapter
 * này là nơi DUY NHẤT gán `cors.origin` cho Socket.IO server.
 */
export class ValidatedCorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: string[],
  ) {
    super(app);
  }

  override createIOServer(
    port: number,
    options?: Partial<ServerOptions>,
  ): Server {
    const mergedOptions: Partial<ServerOptions> = {
      ...options,
      cors: {
        origin: this.corsOrigins,
      },
    };
    return super.createIOServer(port, mergedOptions) as Server;
  }
}
