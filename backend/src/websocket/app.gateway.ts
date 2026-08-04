import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';

/**
 * Gateway nền tảng — chỉ xử lý vòng đời kết nối.
 * Namespace theo Branch (`/branch-{id}`) và các event nghiệp vụ (order, inventory,
 * notification realtime) sẽ được bổ sung ở các Prompt module tương ứng.
 *
 * T030.6 — KHÔNG khai báo `cors` ở đây: decorator này được đánh giá lúc module nạp, trước khi
 * ConfigService tồn tại, nên không thể nhận origin đã validate. CORS thật sự được gán ở runtime
 * bởi `ValidatedCorsIoAdapter` (backend/src/websocket/validated-cors.adapter.ts), áp dụng qua
 * `app.useWebSocketAdapter(...)` trong `main.ts` — nguồn DUY NHẤT gán `cors.origin` cho gateway này.
 */
@WebSocketGateway()
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AppGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }
}
