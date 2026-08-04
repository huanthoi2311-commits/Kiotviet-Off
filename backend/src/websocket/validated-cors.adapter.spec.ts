import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server } from 'socket.io';
import { ValidatedCorsIoAdapter } from './validated-cors.adapter';

describe('ValidatedCorsIoAdapter — T030.6', () => {
  const fakeApp = {} as INestApplicationContext;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[6] gán cors.origin từ mảng origin đã validate truyền vào constructor', () => {
    const spy = jest
      .spyOn(IoAdapter.prototype, 'createIOServer')
      .mockReturnValue({} as Server);
    const adapter = new ValidatedCorsIoAdapter(fakeApp, [
      'https://a.example.com',
      'https://b.example.com',
    ]);

    adapter.createIOServer(3000, { path: '/ws' });

    expect(spy).toHaveBeenCalledWith(3000, {
      path: '/ws',
      cors: { origin: ['https://a.example.com', 'https://b.example.com'] },
    });
  });

  it('ghi đè cors nếu options gốc (metadata decorator) đã có cors khác — không merge/giữ lại giá trị cũ', () => {
    const spy = jest
      .spyOn(IoAdapter.prototype, 'createIOServer')
      .mockReturnValue({} as Server);
    const adapter = new ValidatedCorsIoAdapter(fakeApp, [
      'https://only.example.com',
    ]);

    adapter.createIOServer(3000, {
      cors: { origin: '*' },
    });

    expect(spy).toHaveBeenCalledWith(3000, {
      cors: { origin: ['https://only.example.com'] },
    });
  });

  it('không truyền options vẫn gán cors.origin đúng', () => {
    const spy = jest
      .spyOn(IoAdapter.prototype, 'createIOServer')
      .mockReturnValue({} as Server);
    const adapter = new ValidatedCorsIoAdapter(fakeApp, []);

    adapter.createIOServer(3000);

    expect(spy).toHaveBeenCalledWith(3000, { cors: { origin: [] } });
  });

  it('trả về đúng giá trị super.createIOServer() trả về', () => {
    const fakeServer = { id: 'fake-server' } as unknown as Server;
    jest
      .spyOn(IoAdapter.prototype, 'createIOServer')
      .mockReturnValue(fakeServer);
    const adapter = new ValidatedCorsIoAdapter(fakeApp, [
      'https://a.example.com',
    ]);

    expect(adapter.createIOServer(3000)).toBe(fakeServer);
  });
});
