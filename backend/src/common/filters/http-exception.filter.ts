import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { getRequestId } from '../context/request-context';
import { ErrorCode } from '../errors/error-codes';

const STATUS_FALLBACK_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
};

interface ExceptionBody {
  errorCode?: string;
  message?: string | string[];
}

/**
 * Envelope lỗi chuẩn hóa toàn hệ thống:
 * { success: false, code, message, errors: string[], traceId, timestamp }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionBody = isHttpException
      ? (exception.getResponse() as ExceptionBody | string)
      : null;

    let message: string;
    let errors: string[] = [];

    if (typeof exceptionBody === 'string') {
      message = exceptionBody;
    } else if (Array.isArray(exceptionBody?.message)) {
      // ValidationPipe (class-validator) trả message dạng string[]
      errors = exceptionBody.message;
      message = 'Dữ liệu đầu vào không hợp lệ';
    } else {
      message =
        exceptionBody?.message ??
        (isHttpException ? exception.message : 'Đã có lỗi xảy ra');
    }

    const errorCode =
      (typeof exceptionBody === 'object' && exceptionBody?.errorCode) ||
      STATUS_FALLBACK_CODE[status] ||
      ErrorCode.INTERNAL_SERVER_ERROR;

    if (!isHttpException) {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(status).json({
      success: false,
      code: errorCode,
      message,
      errors,
      traceId: getRequestId() ?? null,
      timestamp: new Date().toISOString(),
    });
  }
}
