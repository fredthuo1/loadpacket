import { BadRequestException } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';

type MoneyInput = string | number | Prisma.Decimal | null | undefined;

export type CalculatedLoadRate = {
  linehaul: Prisma.Decimal | null;
  fuelSurcharge: Prisma.Decimal | null;
  totalRate: Prisma.Decimal;
};

export function calculateLoadRate(
  linehaulInput: MoneyInput,
  fuelSurchargeInput: MoneyInput,
  totalRateInput?: MoneyInput,
): CalculatedLoadRate {
  const linehaul = toOptionalDecimal(linehaulInput, 'linehaul');

  const fuelSurcharge = toOptionalDecimal(fuelSurchargeInput, 'fuel surcharge');

  const suppliedTotal = toOptionalDecimal(totalRateInput, 'total rate');

  validateNonNegative(linehaul, 'Linehaul');

  validateNonNegative(fuelSurcharge, 'Fuel surcharge');

  validateNonNegative(suppliedTotal, 'Total rate');

  if (linehaul !== null && fuelSurcharge !== null) {
    const calculatedTotal = linehaul.plus(fuelSurcharge);
    validateNonNegative(calculatedTotal, 'Calculated total rate');

    if (suppliedTotal !== null && !suppliedTotal.equals(calculatedTotal)) {
      throw new BadRequestException(
        `Total rate must equal linehaul plus fuel surcharge. Expected ${calculatedTotal.toFixed(
          2,
        )}.`,
      );
    }

    return {
      linehaul,
      fuelSurcharge,
      totalRate: calculatedTotal,
    };
  }

  if (suppliedTotal === null) {
    throw new BadRequestException(
      'Total rate is required when linehaul and fuel surcharge are not both provided.',
    );
  }

  return {
    linehaul,
    fuelSurcharge,
    totalRate: suppliedTotal,
  };
}

function toOptionalDecimal(
  value: MoneyInput,
  fieldName: string,
): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new BadRequestException(`Invalid ${fieldName}.`);
  }
}

function validateNonNegative(value: Prisma.Decimal | null, fieldName: string) {
  if (
    value !== null &&
    (!value.isFinite() ||
      value.decimalPlaces() > 2 ||
      value.gt('9999999999.99'))
  ) {
    throw new BadRequestException(
      `${fieldName} must fit a monetary amount with at most 10 whole digits and two decimal places.`,
    );
  }
  if (value !== null && value.lessThan(0)) {
    throw new BadRequestException(`${fieldName} cannot be negative.`);
  }
}
