import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * SPEC-ORG-001 §12 "Timezone chuẩn IANA". Dùng Intl có sẵn trong Node (không thêm thư viện
 * mới) — nhưng KHÔNG dùng `Intl.supportedValuesOf('timeZone')` để so khớp trực tiếp: hàm đó
 * chỉ trả về tên CANONICAL (vd "Asia/Saigon"), không gồm alias hợp lệ như "Asia/Ho_Chi_Minh"
 * — chính là default của Organization/Branch trong schema. Dùng `Intl.DateTimeFormat` làm
 * phép thử: không throw nghĩa là hợp lệ (chấp nhận cả canonical lẫn alias).
 */
@ValidatorConstraint({ name: 'IsIanaTimezone', async: false })
class IsIanaTimezoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'Timezone phải là 1 giá trị IANA hợp lệ (vd: Asia/Ho_Chi_Minh)';
  }
}

export function IsIanaTimezone(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: IsIanaTimezoneConstraint,
    });
  };
}
