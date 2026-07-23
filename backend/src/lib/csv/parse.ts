import { parse } from 'csv-parse/sync';
import { CsvParseError } from './types';

/**
 * Parse CSV bytes into an array of records keyed by header name.
 * Trims cells, skips empty lines, tolerates BOMs.
 * Row limit is enforced at the middleware size cap (5 MB); 10 MB of CSV is
 * ~50k rows which the sync parser handles fine.
 */
export function parseCsvBytes(input: Buffer): Record<string, string>[] {
  try {
    const rows = parse(input, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
    return rows;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CSV parse failed';
    throw new CsvParseError(`Malformed CSV: ${message}`);
  }
}

/**
 * Detect the header row of a CSV without keying by name — needed for preset
 * signature matching.
 */
export function parseCsvHeaders(input: Buffer): string[] {
  try {
    const rows = parse(input, {
      bom: true,
      to_line: 1,
      trim: true,
    }) as string[][];
    return rows[0] ?? [];
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CSV parse failed';
    throw new CsvParseError(`Malformed CSV header: ${message}`);
  }
}
