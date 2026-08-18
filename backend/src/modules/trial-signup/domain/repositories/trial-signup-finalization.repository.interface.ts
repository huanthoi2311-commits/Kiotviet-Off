import type { Prisma } from '@prisma/client';

export type TrialSignupFinalizationStatus =
  'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface TrialSignupFinalizationEntity {
  id: string;
  proofTokenHash: string;
  normalizedEmail: string;
  requestFingerprint: string;
  status: TrialSignupFinalizationStatus;
  organizationId: string | null;
  userId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
}

export interface CreateTrialSignupFinalizationInput {
  proofTokenHash: string;
  normalizedEmail: string;
  requestFingerprint: string;
  expiresAt: Date;
}

/** Ném khi 2 request đồng thời cùng `proofTokenHash` cùng thấy "chưa tồn tại" và cùng gọi
 * `create()` — unique constraint DB-level chặn 1 trong 2 (P2002). Cùng nguyên tắc với
 * `CheckoutOperationConflictError` (T053.04 D9 — "concurrent final requests => exactly one Organization"). */
export class TrialSignupFinalizationConflictError extends Error {
  constructor(public readonly proofTokenHash: string) {
    super('Signup proof này vừa được một yêu cầu khác chiếm giữ đồng thời');
  }
}

/**
 * T053.04 D9 — bảng hỗ trợ Idempotency/Replay cho `POST /trial-signup`, cùng nền tảng với các
 * repository Idempotency đã có ở module Checkout/Supplier Payment (unique constraint + CAS
 * reclaim) nhưng KHÔNG nhân bản các repository đó — thiết kế riêng vì luồng CÔNG KHAI, chưa có
 * organizationId/actor xác thực tại thời điểm reserve (Repository Boundary — mỗi module tự sở
 * hữu cơ chế idempotency riêng, không chia sẻ interface/token xuyên module).
 */
export interface ITrialSignupFinalizationRepository {
  findByProofTokenHash(
    proofTokenHash: string,
  ): Promise<TrialSignupFinalizationEntity | null>;
  /** Ném `TrialSignupFinalizationConflictError` nếu `proofTokenHash` đã tồn tại (race). */
  create(
    input: CreateTrialSignupFinalizationInput,
  ): Promise<TrialSignupFinalizationEntity>;
  /** CAS — chỉ thành công nếu status hiện tại là FAILED (cho phép retry sau lỗi). Trả null nếu
   * đã thua race (1 request khác vừa reclaim/hoàn tất trước). KHÔNG reclaim PROCESSING (khác
   * CheckoutOperation) — T053.04 D9 không có khái niệm "treo" vì Business Transaction ở đây rất
   * ngắn (1 lần ghi Postgres, không có bước async chờ bên ngoài như Checkout). */
  tryReclaimFailed(
    id: string,
    requestFingerprint: string,
    expiresAt: Date,
  ): Promise<TrialSignupFinalizationEntity | null>;
  /** Bước cuối BÊN TRONG Business Transaction chính (cùng `tx` với `createWithOwnerInTransaction`) —
   * gọi ngay trước khi transaction commit (D8 — "transactionally coordinated"). */
  markCompleted(
    id: string,
    organizationId: string,
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void>;
  /** Gọi NGOÀI transaction đã rollback — cho phép retry ngay (mirror CheckoutOperationService.markFailed). */
  markFailed(id: string): Promise<void>;
}

export const TRIAL_SIGNUP_FINALIZATION_REPOSITORY = Symbol(
  'TRIAL_SIGNUP_FINALIZATION_REPOSITORY',
);
