import { ApiProperty } from '@nestjs/swagger';

export class UserInfoDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() username: string;
  @ApiProperty() organizationId: string;
  @ApiProperty({ nullable: true }) branchId: string | null;
  @ApiProperty({ type: [String] }) permissions: string[];
}

export class LoginResponseDto {
  @ApiProperty() accessToken: string;

  @ApiProperty({
    required: false,
    description:
      'CHỈ có khi client là Mobile (header X-Client-Type: mobile). Web nhận refresh token qua HttpOnly Cookie, không có trong body.',
  })
  refreshToken?: string;

  @ApiProperty({ type: UserInfoDto }) userInfo: UserInfoDto;
}
