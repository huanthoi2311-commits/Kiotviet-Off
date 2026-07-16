import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Dùng Intl có sẵn trong Node (không thêm thư viện mới) — SPEC-ORG-001 §12 "Currency theo ISO 4217". */
const ISO_4217_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

@ValidatorConstraint({ name: 'IsIso4217Currency', async: false })
class IsIso4217CurrencyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'string' && ISO_4217_CURRENCIES.has(value.toUpperCase())
    );
  }

  defaultMessage(): string {
    return 'Currency phải là mã ISO 4217 hợp lệ (vd: VND, USD)';
  }
}

export function IsIso4217Currency(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: IsIso4217CurrencyConstraint,
    });
  };
}
