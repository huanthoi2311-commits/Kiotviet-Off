import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** D4 — admin đặt mật khẩu mới cho user khác trong CÙNG tổ chức. Cùng chính sách mật khẩu duy
 * nhất đã chấp thuận (tối thiểu 8 ký tự, không thêm yêu cầu phức tạp mới). */
export class ResetUserPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  newPassword: string;
}
