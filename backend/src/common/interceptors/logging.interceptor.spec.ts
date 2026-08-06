import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor — SPEC-T023 Finding 10 (Global HTTP request logging)', () => {
  function createContext(
    method: string,
    originalUrl: string,
    statusCode: number,
  ): ExecutionContext {
    const request = { method, originalUrl };
    const response = { statusCode };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  }

  function createHandler(result: unknown): CallHandler {
    return { handle: () => of(result) };
  }

  function createErrorHandler(error: unknown): CallHandler {
    return { handle: () => throwError(() => error) };
  }

  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('[AC10.1] request thành công → 1 log entry chứa method, path, statusCode, duration', async () => {
    const interceptor = new LoggingInterceptor();
    const context = createContext('GET', '/api/v1/health', 200);

    await lastValueFrom(
      interceptor.intercept(context, createHandler({ ok: true })),
    );

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [message] = logSpy.mock.calls[0] as [string];
    expect(message).toContain('GET');
    expect(message).toContain('/api/v1/health');
    expect(message).toContain('200');
    expect(message).toMatch(/\d+ms/);
  });

  it('[AC10.2] không đổi giá trị/response trả về — Observable phát ra nguyên vẹn dữ liệu gốc', async () => {
    const interceptor = new LoggingInterceptor();
    const context = createContext('GET', '/api/v1/products', 200);
    const originalPayload = { data: ['a', 'b'] };

    const result = await lastValueFrom(
      interceptor.intercept(context, createHandler(originalPayload)),
    );

    expect(result).toBe(originalPayload);
  });

  it('[error path] request lỗi có status → log đúng status code của lỗi, không phải response.statusCode mặc định', async () => {
    const interceptor = new LoggingInterceptor();
    const context = createContext('POST', '/api/v1/auth/login', 200);

    await expect(
      lastValueFrom(
        interceptor.intercept(
          context,
          createErrorHandler({ status: 401, message: 'Unauthorized' }),
        ),
      ),
    ).rejects.toBeDefined();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [message] = logSpy.mock.calls[0] as [string];
    expect(message).toContain('401');
  });

  it('[error path fallback] lỗi không có field status → dùng response.statusCode làm fallback', async () => {
    const interceptor = new LoggingInterceptor();
    const context = createContext('POST', '/api/v1/checkout', 500);

    await expect(
      lastValueFrom(
        interceptor.intercept(context, createErrorHandler(new Error('boom'))),
      ),
    ).rejects.toBeDefined();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [message] = logSpy.mock.calls[0] as [string];
    expect(message).toContain('500');
  });
});
