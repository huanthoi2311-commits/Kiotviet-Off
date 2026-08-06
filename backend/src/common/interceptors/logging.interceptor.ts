import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * SPEC-T023 Finding 10 (FR10.1/FR10.2) — 1 dòng log cho MỖI request HTTP (thành công hay lỗi):
 * method, path, status code, thời gian xử lý. Dùng `Logger` chuẩn của Nest (đã trỏ vào
 * `winstonLogger` từ `NestFactory.create(AppModule, { logger: winstonLogger })` ở main.ts) — nhờ
 * vậy tự động có `requestId` gắn kèm (winston.logger.ts's `withRequestId` format áp dụng cho MỌI
 * log entry qua AsyncLocalStorage, không cần tự truyền lại ở đây). KHÔNG thay thế Audit Log module
 * (đó là log hành vi nghiệp vụ; đây là log lưu lượng HTTP chung). Chỉ log — không đổi response
 * trả về client (IC10.1/AC10.2).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    const { method, originalUrl } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () =>
          this.logRequest(method, originalUrl, response.statusCode, start),
        error: (error: unknown) => {
          const statusCode = this.resolveErrorStatusCode(error, response);
          this.logRequest(method, originalUrl, statusCode, start);
        },
      }),
    );
  }

  private resolveErrorStatusCode(error: unknown, response: Response): number {
    const status = (error as { status?: unknown })?.status;
    return typeof status === 'number' ? status : response.statusCode || 500;
  }

  private logRequest(
    method: string,
    path: string,
    statusCode: number,
    start: number,
  ): void {
    const duration = Date.now() - start;
    this.logger.log(`${method} ${path} ${statusCode} ${duration}ms`);
  }
}
