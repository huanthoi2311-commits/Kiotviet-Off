-- Rollback — T053.02 Subscription/Plan Foundation (OrganizationPlan.TRIAL)
--
-- Postgres KHONG co lenh "DROP VALUE" cho enum — rollback mot gia tri da them phai tao lai type
-- (khong dung nhu forward migration chi la 1 cau lenh). AN TOAN: that bai ro rang neu bat ky row
-- nao (organizations.plan hoac organization_subscriptions.plan) dang dung 'TRIAL' — khong bao gio
-- am tham xoa/ep gia tri cua khach hang dang dung.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "organizations" WHERE "plan" = 'TRIAL')
     OR EXISTS (SELECT 1 FROM "organization_subscriptions" WHERE "plan" = 'TRIAL') THEN
    RAISE EXCEPTION 'Rollback bi chan: co it nhat 1 row dang dung OrganizationPlan.TRIAL — phai chuyen plan cua row do sang gia tri khac (FREE/BASIC/PRO/ENTERPRISE) truoc khi rollback migration nay.';
  END IF;
END $$;

ALTER TYPE "OrganizationPlan" RENAME TO "OrganizationPlan_old";

CREATE TYPE "OrganizationPlan" AS ENUM ('FREE', 'BASIC', 'PRO', 'ENTERPRISE');

ALTER TABLE "organizations"
  ALTER COLUMN "plan" DROP DEFAULT,
  ALTER COLUMN "plan" TYPE "OrganizationPlan" USING ("plan"::text::"OrganizationPlan"),
  ALTER COLUMN "plan" SET DEFAULT 'FREE';

ALTER TABLE "organization_subscriptions"
  ALTER COLUMN "plan" DROP DEFAULT,
  ALTER COLUMN "plan" TYPE "OrganizationPlan" USING ("plan"::text::"OrganizationPlan"),
  ALTER COLUMN "plan" SET DEFAULT 'FREE';

DROP TYPE "OrganizationPlan_old";
