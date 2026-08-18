-- T053.04 Self-Service Trial Signup — Idempotency/Replay
-- Bang thuan tuy them moi (additive) — khong doi kieu du lieu cot nao khac, khong anh huong bat
-- ky row hien co nao cua bat ky bang nao khac. Chi ho tro finalize an toan cho POST /trial-signup
-- (khong phai aggregate nghiep vu).

CREATE TYPE "TrialSignupFinalizationStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "trial_signup_finalizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proofTokenHash" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "status" "TrialSignupFinalizationStatus" NOT NULL DEFAULT 'PROCESSING',
    "organizationId" UUID,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_signup_finalizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trial_signup_finalizations_proofTokenHash_key" ON "trial_signup_finalizations"("proofTokenHash");

CREATE INDEX "trial_signup_finalizations_status_createdAt_idx" ON "trial_signup_finalizations"("status", "createdAt");

CREATE INDEX "trial_signup_finalizations_expiresAt_idx" ON "trial_signup_finalizations"("expiresAt");
