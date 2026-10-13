/**
 * One CSV row (RFC 4180), safe to open in a spreadsheet.
 *
 * Cells starting with = + - @ or a control character are prefixed with an apostrophe, so a
 * customer named "=HYPERLINK(...)" is shown as text instead of being run as a formula
 * (CSV/formula injection).
 */
export function csvRow(cells: ReadonlyArray<string | number | null | undefined>): string {
  return cells.map(csvCell).join(',') + '\r\n';
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
