import { ApiProperty } from '@nestjs/swagger';

/** T052.02 — KHÔNG có `passwordHash` (không bao giờ trả về), KHÔNG có `isPlatformAdmin`/
 * `permissionVersion` (ngoài phạm vi quản lý module này — SPEC-ORG-001 Decision 4). */
export class UserResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty({ nullable: true }) branchId: string | null;
  @ApiProperty() username: string;
  @ApiProperty({ nullable: true }) fullName: string | null;
  @ApiProperty() email: string;
  @ApiProperty({ nullable: true }) phone: string | null;
  @ApiProperty({ nullable: true }) avatar: string | null;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) lastLoginAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedUserResponseDto {
  @ApiProperty({ type: [UserResponseDto] }) items: UserResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

/** GET /users/:id — thêm role codes hiện tại (T052.02 §RBAC DETAIL INTEGRATION). Không bao gồm ở
 * danh sách GET /users (giữ endpoint list rẻ) — chỉ ở chi tiết. */
export class UserDetailResponseDto extends UserResponseDto {
  @ApiProperty({ type: [String] }) roleCodes: string[];
}
