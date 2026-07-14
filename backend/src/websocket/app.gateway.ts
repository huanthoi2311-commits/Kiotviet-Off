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
 */
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN ?? '*' },
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AppGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }
}
