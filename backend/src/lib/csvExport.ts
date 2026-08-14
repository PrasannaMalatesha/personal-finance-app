/**
 * Minimal RFC-4180 CSV encoder. Wraps a field in double-quotes and doubles
 * any embedded quotes when the field contains a comma, quote, or newline
 * — otherwise the value is emitted raw for readability.
 *
 * Values are stringified with String(). Nulls become empty cells.
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(
  headers: ReadonlyArray<{ key: keyof T; label: string }>,
  rows: readonly T[],
): string {
  const lines: string[] = [headers.map((h) => csvEscape(h.label)).join(',')];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => csvEscape((row as Record<string, unknown>)[h.key as string]))
        .join(','),
    );
  }
  // Trailing newline so the file plays well with `wc -l` and text editors.
  return lines.join('\r\n') + '\r\n';
}
