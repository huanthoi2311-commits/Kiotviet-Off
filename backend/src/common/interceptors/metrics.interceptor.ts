import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import {
  httpRequestDurationSeconds,
  httpRequestsTotal,
} from '../../modules/platform/metrics/metrics.registry';

/**
 * SPEC-T023 Finding 4 (FR4.1) — ghi nhận metric request-level (đếm + độ trễ) cho MỖI request HTTP.
 * Tách riêng khỏi `LoggingInterceptor` (Finding 10) — 2 mối quan tâm khác nhau (log dòng chữ cho
 * người đọc vs số liệu cho `/metrics`), dù cùng quan sát 1 request. Chỉ ghi nhận — không đổi
 * response trả về client.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    const method = request.method;
    const originalUrl = request.originalUrl;
    const routePath = (request as { route?: { path?: string } }).route?.path;
    const start = process.hrtime.bigint();

    const record = (statusCode: number) => {
      const labels = {
        method,
        route: routePath ?? originalUrl,
        status_code: String(statusCode),
      };
      const durationSeconds =
        Number(process.hrtime.bigint() - start) / 1_000_000_000;
      httpRequestsTotal.inc(labels);
      httpRequestDurationSeconds.observe(labels, durationSeconds);
    };

    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode),
        error: (error: unknown) => {
          const status = (error as { status?: unknown })?.status;
          record(
            typeof status === 'number' ? status : response.statusCode || 500,
          );
        },
      }),
    );
  }
}
