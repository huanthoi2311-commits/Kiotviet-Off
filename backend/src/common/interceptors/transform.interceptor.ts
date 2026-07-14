import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { getRequestId } from '../context/request-context';

export interface ResponseEnvelope<T> {
  success: true;
  data: T;
  meta: Record<string, unknown> | null;
  traceId: string | null;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ResponseEnvelope<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseEnvelope<T>> {
    return next.handle().pipe(
      map((result: unknown) => {
        const isEnvelopeShaped =
          !!result &&
          typeof result === 'object' &&
          'data' in result &&
          'meta' in result;
        const data = isEnvelopeShaped
          ? (result as { data: T }).data
          : ((result ?? null) as T);
        const meta = isEnvelopeShaped
          ? ((result as { meta: Record<string, unknown> | null }).meta ?? null)
          : null;

        return {
          success: true,
          data,
          meta,
          traceId: getRequestId() ?? null,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
