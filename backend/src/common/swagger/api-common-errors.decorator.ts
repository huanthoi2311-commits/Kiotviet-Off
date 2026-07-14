import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.dto';

/**
 * Gắn sẵn ví dụ response cho các lỗi phổ biến (401/403/404/500) theo envelope
 * chuẩn `{ success:false, code, message, errors, traceId, timestamp }` — để
 * Frontend generate type/handle lỗi mà không cần đoán field.
 */
export function ApiCommonErrors() {
  return applyDecorators(
    ApiResponse({
      status: 401,
      type: ErrorResponseDto,
      description: 'Chưa đăng nhập / token không hợp lệ',
    }),
    ApiResponse({
      status: 403,
      type: ErrorResponseDto,
      description: 'Thiếu quyền truy cập',
    }),
    ApiResponse({
      status: 404,
      type: ErrorResponseDto,
      description: 'Không tìm thấy tài nguyên',
    }),
    ApiResponse({
      status: 500,
      type: ErrorResponseDto,
      description: 'Lỗi hệ thống',
    }),
  );
}
