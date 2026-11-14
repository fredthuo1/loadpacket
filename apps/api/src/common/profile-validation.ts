import { Transform } from 'class-transformer';
import { registerDecorator, ValidationOptions } from 'class-validator';

export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
export const OptionalText = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  );
export const EmailText = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || null : value,
  );

export function IsCalendarDate(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
            return false;
          const date = new Date(`${value}T00:00:00.000Z`);
          return (
            Number.isFinite(date.getTime()) &&
            date.toISOString().slice(0, 10) === value &&
            date.getUTCFullYear() >= 1900
          );
        },
        defaultMessage: () =>
          '$property must be a valid calendar date (YYYY-MM-DD, year 1900 or later)',
      },
    });
}
