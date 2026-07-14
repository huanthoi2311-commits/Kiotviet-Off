export interface JwtAccessPayload {
  sub: string;
  organizationId: string;
  branchId: string | null;
  email: string;
  permissions: string[];
  /** Đối chiếu với User.permissionVersion hiện tại — lệch nhau nghĩa là quyền đã đổi, bắt đăng nhập lại. */
  permissionVersion: number;
}
