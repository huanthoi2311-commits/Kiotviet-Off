import { LogoutButton } from '@/features/auth/components/logout-button';

/**
 * Dashboard shell placeholder (T031.05 scope: "authenticated dashboard
 * shell only"). No business widgets/modules — those are out of scope until
 * separately authorized.
 */
export default function DashboardHomePage() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <LogoutButton />
      </div>
      <p className="text-muted-foreground text-sm">
        Nền tảng xác thực đã sẵn sàng. Các module nghiệp vụ (Sản phẩm, Khách hàng, Kho, ...) sẽ được
        triển khai ở giai đoạn tiếp theo.
      </p>
    </div>
  );
}
