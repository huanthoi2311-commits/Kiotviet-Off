-- Rollback — T053.04 Self-Service Trial Signup (trial_signup_finalizations)
--
-- Bang moi hoan toan (additive) — rollback chi can DROP TABLE + DROP TYPE, khong anh huong bang
-- nao khac. AN TOAN: khong xoa row nao cua Organization/User/OrganizationSubscription (bang nay
-- chi tham chieu scalar UUID, khong co FK that su toi cac bang do).

DROP TABLE "trial_signup_finalizations";
DROP TYPE "TrialSignupFinalizationStatus";
