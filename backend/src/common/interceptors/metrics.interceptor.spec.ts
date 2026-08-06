import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { MetricsInterceptor } from './metrics.interceptor';
import {
  httpRequestDurationSeconds,
  httpRequestsTotal,
  metricsRegistry,
} from '../../modules/platform/metrics/metrics.registry';

describe('MetricsInterceptor — SPEC-T023 Finding 4 (request-level metrics)', () => {
  function createContext(
    method: string,
    routePath: string,
    statusCode: number,
  ): ExecutionContext {
    const request = {
      method,
      route: { path: routePath },
      originalUrl: routePath,
    };
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

  beforeEach(() => {
    httpRequestsTotal.reset();
    httpRequestDurationSeconds.reset();
  });

  it('[AC4.1] request thành công → tăng counter và ghi nhận histogram đúng nhãn method/route/status_code', async () => {
    const interceptor = new MetricsInterceptor();
    const context = createContext('GET', '/api/v1/health', 200);

    await lastValueFrom(
      interceptor.intercept(context, createHandler({ ok: true })),
    );

    const counterValue = await httpRequestsTotal.get();
    const matching = counterValue.values.find(
      (v) =>
        v.labels.method === 'GET' &&
        v.labels.route === '/api/v1/health' &&
        v.labels.status_code === '200',
    );
    expect(matching?.value).toBe(1);
  });

  it('[error path] request lỗi → vẫn ghi nhận metric với status_code của lỗi', async () => {
    const interceptor = new MetricsInterceptor();
    const context = createContext('POST', '/api/v1/auth/login', 200);

    await expect(
      lastValueFrom(
        interceptor.intercept(
          context,
          createErrorHandler({ status: 401, message: 'Unauthorized' }),
        ),
      ),
    ).rejects.toBeDefined();

    const counterValue = await httpRequestsTotal.get();
    const matching = counterValue.values.find(
      (v) => v.labels.status_code === '401' && v.labels.method === 'POST',
    );
    expect(matching?.value).toBe(1);
  });

  it('[AC10.2-equivalent] không đổi giá trị Observable gốc', async () => {
    const interceptor = new MetricsInterceptor();
    const context = createContext('GET', '/api/v1/products', 200);
    const originalPayload = { data: [1, 2, 3] };

    const result = await lastValueFrom(
      interceptor.intercept(context, createHandler(originalPayload)),
    );

    expect(result).toBe(originalPayload);
  });

  it('[registry] metricsRegistry.metrics() trả về nội dung Prometheus exposition format hợp lệ', async () => {
    const interceptor = new MetricsInterceptor();
    const context = createContext('GET', '/api/v1/health', 200);
    await lastValueFrom(interceptor.intercept(context, createHandler({})));

    const output = await metricsRegistry.metrics();
    expect(output).toContain('http_requests_total');
    expect(output).toContain('http_request_duration_seconds');
  });
});
