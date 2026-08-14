import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MinLength,
} from 'class-validator';

/** T052.02 — Product Decision: admin tạo user + đặt mật khẩu ban đầu (KHÔNG self-service, KHÔNG
 * invite link/token/OTP). `organizationId` không nằm trong DTO — luôn lấy từ actor (ActorContext),
 * không bao giờ nhận từ client (D-Identity Contract). Không nhận `status`/`isPlatformAdmin` — luôn
 * ACTIVE khi tạo, isPlatformAdmin không bao giờ set qua API này (SPEC-ORG-001 Decision 4). */
export class CreateUserDto {
  @ApiProperty({ minLength: 3, maxLength: 50 })
  @IsString()
  @Length(3, 50)
  username: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 150)
  fullName?: string;

  @ApiProperty()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Chính sách mật khẩu DUY NHẤT đã được chấp thuận toàn dự án (D4) — tối thiểu 8 ký tự, không
   * thêm yêu cầu phức tạp mới (đồng nhất `reset-password.dto.ts`/owner-creation DTO). */
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  password: string;
}
