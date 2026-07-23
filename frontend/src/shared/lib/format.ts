/**
 * Money and date formatters. Values on the wire are decimal strings
 * ("-450.00") per TRD §7.4 — we never coerce them into Number for arithmetic;
 * we only Number-coerce at the very edge to hand to Intl.NumberFormat.
 */

const numberFormatCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  const cached = numberFormatCache.get(currency);
  if (cached) return cached;
  const fmt = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  numberFormatCache.set(currency, fmt);
  return fmt;
}

/**
 * Format a signed decimal string ("-450.00") into a display currency string
 * ("−$450.00"). Uses browser locale for grouping/separator conventions.
 */
export function formatMoney(amount: string, currency: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return getFormatter(currency).format(n);
}

/** True when the wire amount represents an expense (negative). */
export function isExpense(amount: string): boolean {
  return amount.trim().startsWith('-');
}

/** Format YYYY-MM-DD into a short human date. */
export function formatDate(iso: string): string {
  // Parse as UTC to avoid timezone-shifted display (transaction dates are
  // stored as DATE, not TIMESTAMPTZ — no "local" concept applies).
  const [y, m, d] = iso.split('-').map((s) => Number(s));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Return today's date as YYYY-MM-DD in the browser's local timezone. */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
