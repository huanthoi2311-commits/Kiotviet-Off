import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

/**
 * SPEC-T023 Finding 4 (FR4.1) — registry riêng (không dùng `client.register` global mặc định của
 * prom-client) để tránh đăng ký trùng metric khi Jest tải lại module giữa các test file. Chỉ thu
 * thập metric TRONG TIẾN TRÌNH (không kéo theo Prometheus/Grafana hay bất kỳ service mới nào —
 * IC4.1/IC4.3).
 */
export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Tổng số request HTTP, theo method/route/status_code',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Thời gian xử lý request HTTP (giây), theo method/route/status_code',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});
