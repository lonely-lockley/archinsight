export function formatProjectDate(
  value: string | undefined,
  locales?: Intl.LocalesArgument
): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locales, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}
