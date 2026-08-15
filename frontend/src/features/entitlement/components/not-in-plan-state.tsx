import Link from 'next/link';

/**
 * T053.03 §15 — render khi nguyên nhân chặn là ENTITLEMENT (gói hiện tại không bao gồm tính năng),
 * KHÔNG được lẫn với `UnauthorizedState` ("Bạn không có quyền") — nguyên nhân khác nhau, thông báo
 * phải khác nhau để người dùng biết cần nâng cấp gói thay vì xin cấp quyền.
 */
export function NotInPlanState() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-lg font-semibold">Không có trong gói hiện tại</h2>
      <p className="text-muted-foreground text-sm">
        Tính năng này không có trong gói hiện tại. Vui lòng nâng cấp gói để sử dụng.
      </p>
      <Link href="/dashboard" className="text-primary text-sm underline">
        Quay lại Dashboard
      </Link>
    </div>
  );
}
