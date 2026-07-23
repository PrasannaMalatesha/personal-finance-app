import { parseCsvBytes, parseCsvHeaders } from './parse';
import { detectPreset } from './presets';
import { detectGenericColumns } from './columns';
import { normalizeAmount, normalizeDate, normalizeDescription } from './normalize';
import type { DateFormat } from './normalize';
import type {
  DetectedColumns,
  ParseResult,
  ParsedRow,
} from './types';
import { CsvParseError } from './types';

export { CsvParseError } from './types';
export type {
  AmountKind,
  DetectedColumns,
  ParsedRow,
  ParseResult,
} from './types';

/**
 * Detect the CSV shape (preset or generic), then parse and normalize every row
 * into `{ index, date: YYYY-MM-DD, description, amount: '-?d+.dd' }`.
 *
 * If any row fails normalization we throw CsvParseError with the row index —
 * the whole preview fails rather than silently dropping rows. Bank statements
 * are already normalized; malformed rows almost always indicate a wrong preset
 * or a truly bad file.
 */
export function parseCsvBuffer(buffer: Buffer): ParseResult {
  const headers = parseCsvHeaders(buffer);
  if (headers.length === 0) {
    throw new CsvParseError('CSV appears empty or has no header row');
  }

  const preset = detectPreset(headers);
  const detectedColumns: DetectedColumns = preset
    ? preset.columns
    : detectGenericColumns(headers);
  const dateFormat: DateFormat = preset?.dateFormat ?? 'YMD';

  const raw = parseCsvBytes(buffer);
  const rows: ParsedRow[] = raw.map((r, i) => normalizeRow(r, i, detectedColumns, dateFormat));

  return { detectedColumns, rows };
}

function normalizeRow(
  raw: Record<string, string>,
  index: number,
  cols: DetectedColumns,
  dateFormat: DateFormat,
): ParsedRow {
  try {
    const dateVal = raw[cols.date];
    const descVal = raw[cols.description];
    if (dateVal === undefined || descVal === undefined) {
      throw new CsvParseError(`Row missing required cell (date/description)`);
    }
    const date = normalizeDate(dateVal, dateFormat);
    const description = normalizeDescription(descVal);
    if (description === '') {
      throw new CsvParseError(`Row has empty description`);
    }

    let amount: string;
    if (cols.amountKind === 'signed') {
      const amountVal = raw[cols.amount!] ?? '';
      amount = normalizeAmount(amountVal);
    } else {
      // debit-credit: exactly one of the two columns should be non-empty per row.
      const debitVal = (raw[cols.debit!] ?? '').trim();
      const creditVal = (raw[cols.credit!] ?? '').trim();
      if (debitVal !== '' && creditVal !== '') {
        throw new CsvParseError(`Row has both debit and credit values`);
      }
      if (debitVal === '' && creditVal === '') {
        throw new CsvParseError(`Row has neither debit nor credit value`);
      }
      const magnitude = normalizeAmount(debitVal !== '' ? debitVal : creditVal);
      amount = debitVal !== '' && magnitude !== '0.00' ? `-${magnitude}` : magnitude;
    }

    return { index, date, description, amount };
  } catch (err) {
    if (err instanceof CsvParseError) {
      throw new CsvParseError(`Row ${index}: ${err.message}`, index);
    }
    throw err;
  }
}
