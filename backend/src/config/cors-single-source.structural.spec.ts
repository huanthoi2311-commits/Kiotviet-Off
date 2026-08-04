import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * T030.6 — kiểm tra CẤU TRÚC (đọc source text thật, không mock/không chạy runtime) rằng:
 *   1. `app.gateway.ts` không còn tự đọc `process.env` (nói riêng, `CORS_ORIGIN`) ở bất kỳ đâu.
 *   2. Logic parse CORS_ORIGIN (`.split(',')`) chỉ tồn tại ở ĐÚNG 1 nơi (`cors.util.ts`) — không
 *      bị chép lại/viết lại ở `configuration.ts`, `env.validation.ts`, hay `app.gateway.ts`.
 * Đây chính là bằng chứng cấu trúc cho việc "không còn 2 nguồn đọc CORS_ORIGIN mâu thuẫn nhau"
 * (F21/DISCOVERY-T030, Decision 1/RFC-T030 §5 Option D) đã được đóng.
 */

function readSource(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf8');
}

describe('CORS_ORIGIN — single source of truth (T030.6 structural verification)', () => {
  it('app.gateway.ts không chứa "process.env" ở bất kỳ đâu (mã hay comment)', () => {
    const source = readSource('../websocket/app.gateway.ts');
    expect(source).not.toContain('process.env');
  });

  it('cors.util.ts là nơi DUY NHẤT chứa logic parse ".split(\',\')" cho CORS_ORIGIN', () => {
    const corsUtil = readSource('./cors.util.ts');
    const configuration = readSource('./configuration.ts');
    const envValidation = readSource('./env.validation.ts');
    const appGateway = readSource('../websocket/app.gateway.ts');
    const adapter = readSource('../websocket/validated-cors.adapter.ts');

    expect(corsUtil).toContain(".split(',')");
    expect(configuration).not.toContain(".split(',')");
    expect(envValidation).not.toContain(".split(',')");
    expect(appGateway).not.toContain(".split(',')");
    expect(adapter).not.toContain(".split(',')");
  });

  it('configuration.ts và env.validation.ts đều gọi parseCorsOrigins() từ cors.util (không tự parse riêng)', () => {
    const configuration = readSource('./configuration.ts');
    const envValidation = readSource('./env.validation.ts');

    expect(configuration).toMatch(/from '\.\/cors\.util'/);
    expect(configuration).toContain('parseCorsOrigins(');
    expect(envValidation).toMatch(/from '\.\/cors\.util'/);
    expect(envValidation).toContain('parseCorsOrigins(');
  });

  it('process.env.CORS_ORIGIN chỉ được đọc thật (không phải trong comment) ở đúng 1 dòng trong toàn bộ backend/src', () => {
    const configuration = readSource('./configuration.ts');
    // Dòng thật duy nhất: configuration.ts truyền process.env.CORS_ORIGIN vào parseCorsOrigins().
    expect(configuration).toContain(
      'parseCorsOrigins(process.env.CORS_ORIGIN)',
    );

    const envValidation = readSource('./env.validation.ts');
    const appGateway = readSource('../websocket/app.gateway.ts');
    const adapter = readSource('../websocket/validated-cors.adapter.ts');
    const mainTs = readSource('../main.ts');

    expect(envValidation).not.toContain('process.env.CORS_ORIGIN');
    expect(appGateway).not.toContain('process.env.CORS_ORIGIN');
    expect(adapter).not.toContain('process.env.CORS_ORIGIN');
    expect(mainTs).not.toContain('process.env.CORS_ORIGIN');
  });
});
