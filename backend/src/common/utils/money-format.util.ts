import { Prisma } from '@prisma/client';

/**
 * Hợp đồng serialize tiền tệ (T030.12K, Architect Decision — Option A): mọi field tiền tệ
 * trả về API là string cố định 2 chữ số thập phân, dùng chung cho Invoice/Payment — tránh
 * lặp lại `.toFixed(2)` riêng ở từng repository (T030.12J phát hiện `Decimal.toString()` tự
 * strip trailing zero, không giữ scale 2 khai báo ở schema).
 */
export function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}
