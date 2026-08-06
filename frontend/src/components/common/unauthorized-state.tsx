import Link from 'next/link';

/**
 * Rendered when a permission/platform-admin check denies access (SPEC-T031
 * FR5/FR6). A UX hint only — the underlying API call is independently
 * enforced server-side regardless of whether this ever renders (SR3).
 */
export function UnauthorizedState() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-lg font-semibold">Bạn không có quyền truy cập</h2>
      <p className="text-muted-foreground text-sm">
        Tài khoản của bạn không có đủ quyền để xem nội dung này.
      </p>
      <Link href="/dashboard" className="text-primary text-sm underline">
        Quay lại Dashboard
      </Link>
    </div>
  );
}
