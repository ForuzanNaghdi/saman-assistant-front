const relativeFormatter = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return '';

  const diff = timestamp - Date.now();
  const abs = Math.abs(diff);

  if (abs < 60_000) return 'همین حالا';
  if (abs < 3_600_000) return relativeFormatter.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return relativeFormatter.format(Math.round(diff / 3_600_000), 'hour');
  return relativeFormatter.format(Math.round(diff / 86_400_000), 'day');
}

export function formatCount(value: number): string {
  return value.toLocaleString('fa-IR');
}
