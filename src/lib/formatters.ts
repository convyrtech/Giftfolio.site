/**
 * Format date to DD.MM.YY (Russian standard).
 * Uses UTC to prevent off-by-one-day for Drizzle date fields (midnight UTC).
 */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(date));
}

/**
 * Format date to DD.MM.YY HH:mm (Russian standard with time).
 * Uses UTC for date-only fields.
 */
export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(date));
}

/**
 * Format number with space separators (Russian standard).
 * 1234567 → "1 234 567"
 */
export function formatNumber(n: number | bigint): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

/**
 * Format USD value.
 * "$12.34" — dot decimal, dollar sign prefix
 */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format percentage with sign.
 * "+12.5%" or "-3.2%"
 */
export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}
