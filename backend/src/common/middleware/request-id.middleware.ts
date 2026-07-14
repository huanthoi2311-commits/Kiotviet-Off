import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from '../context/request-context';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Nhận X-Request-ID từ client/gateway nếu có, ngược lại tự sinh mới.
 * ID này chạy xuyên suốt: log (Winston), response error envelope (traceId),
 * và job BullMQ (mail) — dùng để nối các log rời rạc của cùng 1 request.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId =
      (req.headers[REQUEST_ID_HEADER] as string | undefined) || randomUUID();
    res.setHeader('X-Request-ID', requestId);
    requestContextStorage.run({ requestId }, () => next());
  }
}
