import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { handleBootstrapFailure, VALIDATION_PIPE_OPTIONS } from './main';
import { winstonLogger } from './logger/winston.logger';

function readMainSource(): string {
  return readFileSync(join(__dirname, 'main.ts'), 'utf8');
}

describe('handleBootstrapFailure — T030.7 (AD-5 point 2)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[16] log lỗi qua winstonLogger rồi gọi exit(1) — không phải unhandledRejection log-only cũ', () => {
    const errorSpy = jest
      .spyOn(winstonLogger, 'error')
      .mockImplementation(() => {});
    const exitSpy = jest.fn() as unknown as (code: number) => never;

    const error = new Error('Postgres unreachable: ECONNREFUSED');
    handleBootstrapFailure(error, exitSpy);

    expect(errorSpy).toHaveBeenCalledWith(
      error.stack,
      undefined,
      'BootstrapFailure',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('lỗi không phải instance Error vẫn được log (không throw thêm) và vẫn exit(1)', () => {
    const errorSpy = jest
      .spyOn(winstonLogger, 'error')
      .mockImplementation(() => {});
    const exitSpy = jest.fn() as unknown as (code: number) => never;

    handleBootstrapFailure('a plain string rejection reason', exitSpy);

    expect(errorSpy).toHaveBeenCalledWith(
      'a plain string rejection reason',
      undefined,
      'BootstrapFailure',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('[6] thông báo lỗi không chứa giá trị DATABASE_URL/JWT secret thật — chỉ log lại đúng error nhận được, không tự thêm process.env vào log', () => {
    const errorSpy = jest
      .spyOn(winstonLogger, 'error')
      .mockImplementation(() => {});
    const exitSpy = jest.fn() as unknown as (code: number) => never;

    const error = new Error(
      'Config validation failed:\nDATABASE_URL should not be empty',
    );
    handleBootstrapFailure(error, exitSpy);

    const loggedArgs = errorSpy.mock.calls[0];
    expect(String(loggedArgs[0])).not.toMatch(/postgresql:\/\/[^\s]*:[^\s]*@/);
  });
});

describe('main.ts — T030.7 structural verification (startup ordering)', () => {
  it('không còn dùng `void bootstrap();` (cơ chế log-only cũ, không exit khi Postgres thất bại)', () => {
    expect(readMainSource()).not.toMatch(/void bootstrap\(\);/);
  });

  it('[16] `bootstrap()` được gọi kèm `.catch(handleBootstrapFailure)` ở cuối file', () => {
    expect(readMainSource()).toMatch(
      /bootstrap\(\)\.catch\(handleBootstrapFailure\);/,
    );
  });

  it('`validateEnv(process.env)` xuất hiện TRƯỚC `NestFactory.create(` trong văn bản hàm bootstrap()', () => {
    const source = readMainSource();
    const validateIndex = source.indexOf('validateEnv(process.env)');
    const createIndex = source.indexOf('NestFactory.create(');
    expect(validateIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeGreaterThan(-1);
    expect(validateIndex).toBeLessThan(createIndex);
  });

  it('`app.useWebSocketAdapter(` xuất hiện SAU `NestFactory.create(` (adapter tạo sau khi app đã khởi tạo)', () => {
    const source = readMainSource();
    expect(source.indexOf('NestFactory.create(')).toBeLessThan(
      source.indexOf('app.useWebSocketAdapter('),
    );
  });

  it('main.ts không tự parse CORS_ORIGIN (vẫn dùng cors.util qua ConfigService — không hồi quy T030.6)', () => {
    expect(readMainSource()).not.toContain(".split(',')");
  });
});

describe('VALIDATION_PIPE_OPTIONS — T030.12D (E2E/production validation parity)', () => {
  it('có đúng 3 tùy chọn whitelist/forbidNonWhitelisted/transform, đều bật', () => {
    expect(VALIDATION_PIPE_OPTIONS).toEqual({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
  });

  it('bootstrap() dùng CHÍNH `VALIDATION_PIPE_OPTIONS` (không định nghĩa lại literal riêng)', () => {
    const source = readMainSource();
    expect(source).toMatch(
      /useGlobalPipes\(new ValidationPipe\(VALIDATION_PIPE_OPTIONS\)\)/,
    );
  });
});
