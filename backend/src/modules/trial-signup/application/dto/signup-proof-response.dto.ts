import { ApiProperty } from '@nestjs/swagger';

export class SignupProofResponseDto {
  @ApiProperty({
    description:
      'Bằng chứng đã xác thực OTP, hiệu lực 10 phút — phải gửi kèm ở POST /trial-signup. Không phải access token, không dùng được cho bất kỳ route nào khác.',
  })
  signupProofToken: string;

  @ApiProperty()
  expiresAt: string;
}
