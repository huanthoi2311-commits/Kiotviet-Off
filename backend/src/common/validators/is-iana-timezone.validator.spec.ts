import { validate } from 'class-validator';
import { IsIanaTimezone } from './is-iana-timezone.validator';

class Dummy {
  @IsIanaTimezone()
  timezone: string;
}

describe('IsIanaTimezone', () => {
  it('chấp nhận timezone IANA hợp lệ', async () => {
    const dto = new Dummy();
    dto.timezone = 'Asia/Ho_Chi_Minh';
    expect(await validate(dto)).toHaveLength(0);
  });

  it('chấp nhận UTC', async () => {
    const dto = new Dummy();
    dto.timezone = 'UTC';
    expect(await validate(dto)).toHaveLength(0);
  });

  it('từ chối chuỗi không phải timezone IANA', async () => {
    const dto = new Dummy();
    dto.timezone = 'Not/A_Timezone';
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
  });

  it('từ chối giá trị không phải string', async () => {
    const dto = new Dummy();
    (dto as unknown as { timezone: number }).timezone = 123;
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
  });
});
