-- T053.02 Subscription/Plan Foundation
-- Bo sung gia tri enum TRIAL cho OrganizationPlan (danh gia thu, khac FREE vinh vien).
-- Thuan tuy them moi (additive) - khong doi kieu du lieu, khong ghi de/xoa gia tri cu, khong
-- anh huong bat ky row OrganizationSubscription/Organization hien co nao (chung van giu nguyen
-- gia tri plan hien tai, mac dinh FREE khong doi).

ALTER TYPE "OrganizationPlan" ADD VALUE 'TRIAL';
