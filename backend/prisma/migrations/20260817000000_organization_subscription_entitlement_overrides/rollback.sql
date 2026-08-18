-- Rollback — T053.03 Feature Entitlements Foundation (OrganizationSubscription.entitlementOverrides)
--
-- Cot them moi thuan tuy (additive) — rollback chi can DROP COLUMN, khong anh huong cot nao khac.
-- AN TOAN: khong xoa row nao, khong doi kieu du lieu cot nao khac. Neu co du lieu ghi de dang luu o
-- cot nay, du lieu do se mat khi rollback (chap nhan duoc vi T053.03 khong co public mutation
-- endpoint nao ghi vao cot nay — chua co du lieu nghiep vu that su phu thuoc no).

ALTER TABLE "organization_subscriptions" DROP COLUMN "entitlementOverrides";
