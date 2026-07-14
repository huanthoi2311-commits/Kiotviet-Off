import {
  utilities as nestWinstonModuleUtilities,
  WinstonModule,
} from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { getRequestId } from '../common/context/request-context';

const isProduction = process.env.NODE_ENV === 'production';

/** Gắn requestId (từ AsyncLocalStorage) vào mọi log entry, kể cả log phát sinh trong BullMQ processor. */
const withRequestId = winston.format((info) => {
  const requestId = getRequestId();
  if (requestId) info.requestId = requestId;
  return info;
});

export const winstonLogger = WinstonModule.createLogger({
  level: isProduction ? 'info' : 'debug',
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        withRequestId(),
        winston.format.timestamp(),
        nestWinstonModuleUtilities.format.nestLike('POS-ERP', {
          colors: !isProduction,
          prettyPrint: true,
        }),
      ),
    }),
    new winston.transports.DailyRotateFile({
      dirname: 'logs',
      filename: '%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      format: winston.format.combine(
        withRequestId(),
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  ],
});
