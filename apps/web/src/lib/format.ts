// Fixed locale so server and client render identical text (no hydration mismatches).
const LOCALE = 'en-GB';

const integer = new Intl.NumberFormat(LOCALE);
const dateFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const shortDay = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export const formatNumber = (n: number) => integer.format(n);

/** Signed points for ledger rows: "+120", "−40". */
export const formatPointsDelta = (n: number) =>
  n > 0 ? `+${integer.format(n)}` : `−${integer.format(Math.abs(n))}`;

/** Money arrives from the API as a decimal string; it is only formatted, never computed on. */
export function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(Number(amount));
}

export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

/** "3 Mar" for a `YYYY-MM-DD` calendar date. */
export const formatDay = (date: string) => shortDay.format(new Date(`${date}T00:00:00Z`));
