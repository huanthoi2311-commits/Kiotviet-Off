/**
 * T050 AD-4 — browser-local timezone date-range boundary utility. Timezone ownership for Purchase
 * Report is explicitly browser-local (not `Organization.timezone`/`Branch.timezone`, both dormant
 * — see docs/specifications/T050-REPORTS-DOMAIN-DISCOVERY.md §14 AD-4). Never use
 * `new Date("YYYY-MM-DD")` for these boundaries — it parses as UTC midnight, not browser-local
 * midnight. Independent of any specific report's rendering.
 */

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function isoDatePart(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `+HH:MM`/`-HH:MM` for the instant `date` represents — computed per-instant (not reused between
 * a start/end pair) so a DST transition within the same calendar day is still handled correctly. */
export function formatLocalOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Beginning of `date`'s browser-local calendar day: `YYYY-MM-DDT00:00:00.000000<offset>`. */
export function toStartOfLocalDayIso(date: Date): string {
  const start = startOfLocalDay(date);
  return `${isoDatePart(start)}T00:00:00.000000${formatLocalOffset(start)}`;
}

/** Final representable microsecond of `date`'s browser-local calendar day:
 * `YYYY-MM-DDT23:59:59.999999<offset>`. Matches the backend's inclusive `createdAt <= dateTo`
 * contract, avoiding silently excluding records in the final sub-millisecond portion of the day. */
export function toEndOfLocalDayIso(date: Date): string {
  const end = endOfLocalDay(date);
  return `${isoDatePart(end)}T23:59:59.999999${formatLocalOffset(end)}`;
}

export interface PurchaseReportDateRangeInput {
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PurchaseReportDateRangeParams {
  dateFrom?: string;
  dateTo?: string;
}

/** AD-3 — optional truly means optional: an omitted boundary produces no param at all, never an
 * invented default range. */
export function buildPurchaseReportDateParams(
  input: PurchaseReportDateRangeInput,
): PurchaseReportDateRangeParams {
  const params: PurchaseReportDateRangeParams = {};
  if (input.dateFrom) params.dateFrom = toStartOfLocalDayIso(input.dateFrom);
  if (input.dateTo) params.dateTo = toEndOfLocalDayIso(input.dateTo);
  return params;
}

/** Parses an `<input type="date">` value (`"YYYY-MM-DD"`) into a local `Date` at local midnight of
 * that calendar day — never `new Date(value)`, which parses the bare string as UTC midnight and
 * can land on the wrong local calendar day. Returns `undefined` for an empty/invalid value. */
export function parseDateInputValue(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}
