import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    required: false,
    description:
      'Bắt buộc với Mobile (X-Client-Type: mobile). Web bỏ qua — đọc từ HttpOnly cookie.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiProperty({
    required: false,
    example: "Nam's iPhone 15",
    description:
      'Tên thiết bị hiển thị trong danh sách phiên đăng nhập (chủ yếu Mobile App gửi lên).',
  })
  @IsOptional()
  @IsString()
  deviceName?: string;
}
