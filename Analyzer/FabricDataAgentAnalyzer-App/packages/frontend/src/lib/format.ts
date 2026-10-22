const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** Dates arrive as `Date` or ISO strings depending on the API layer. */
function toDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: Date | string): string {
  const date = toDate(value);
  return date ? dateTime.format(date) : 'Unknown date';
}

export function formatDate(value: Date | string): string {
  const date = toDate(value);
  return date ? dateOnly.format(date) : 'Unknown date';
}

export function timeValue(value: Date | string): number {
  return toDate(value)?.getTime() ?? 0;
}

/** "DATA_AGENT" / "KQL_DATABASE" -> "Data agent" / "Kql database". */
export function humanize(value: string): string {
  const text = value.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
