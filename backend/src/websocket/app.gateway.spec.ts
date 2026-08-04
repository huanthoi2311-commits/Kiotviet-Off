import 'reflect-metadata';
import { AppGateway } from './app.gateway';

describe('AppGateway — vòng đời kết nối (không đổi hành vi)', () => {
  it('handleConnection log kết nối, không throw', () => {
    const gateway = new AppGateway();
    expect(() =>
      gateway.handleConnection({ id: 'socket-1' } as any),
    ).not.toThrow();
  });

  it('handleDisconnect log ngắt kết nối, không throw', () => {
    const gateway = new AppGateway();
    expect(() =>
      gateway.handleDisconnect({ id: 'socket-1' } as any),
    ).not.toThrow();
  });
});

describe('AppGateway — T030.6 (decorator không còn tự khai báo cors)', () => {
  it('[7] metadata @WebSocketGateway() không chứa khóa "cors" (CORS được gán ở runtime qua ValidatedCorsIoAdapter, không phải decorator)', () => {
    const options = Reflect.getMetadata(
      'websockets:gateway_options',
      AppGateway,
    ) as Record<string, unknown> | undefined;

    expect(options).toBeDefined();
    expect(options).not.toHaveProperty('cors');
  });
});
