import { ErrorCode } from './error-codes';

/** Helper để mọi HttpException đều mang theo `errorCode` nhất quán, đọc bởi HttpExceptionFilter. */
export function withCode(code: ErrorCode, message: string) {
  return { errorCode: code, message };
}
