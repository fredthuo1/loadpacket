export const BUSINESS_TIME_ZONE = 'America/Chicago';

export function getBusinessDateStamp(date: Date = new Date()) {
  const parts = getBusinessDateParts(date);

  return `${parts.year}${parts.month}${parts.day}`;
}

export function getBusinessDateIso(date: Date = new Date()) {
  const parts = getBusinessDateParts(date);

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatBusinessDate(date: Date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,

    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getBusinessDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,

    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return {
    year: getPart(parts, 'year'),

    month: getPart(parts, 'month'),

    day: getPart(parts, 'day'),
  };
}

function getPart(
  parts: Intl.DateTimeFormatPart[],
  type: 'year' | 'month' | 'day',
) {
  const value = parts.find((part) => part.type === type)?.value;

  if (!value) {
    throw new Error(`Unable to resolve business date ${type}.`);
  }

  return value;
}
