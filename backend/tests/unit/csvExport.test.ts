import { describe, it, expect } from 'vitest';
import { csvEscape, toCsv } from '../../src/lib/csvExport';

describe('csvEscape', () => {
  it('leaves plain values unquoted', () => {
    expect(csvEscape('hello')).toBe('hello');
    expect(csvEscape(42)).toBe('42');
    expect(csvEscape('2026-08-14')).toBe('2026-08-14');
  });

  it('renders null / undefined as empty', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('quotes values with commas, quotes, or newlines and doubles quotes', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape('carriage\r')).toBe('"carriage\r"');
  });
});

describe('toCsv', () => {
  it('renders header row followed by rows separated by CRLF, trailing newline', () => {
    const csv = toCsv(
      [
        { key: 'date', label: 'Date' },
        { key: 'amt', label: 'Amount' },
      ],
      [
        { date: '2026-08-14', amt: '-4.50' },
        { date: '2026-08-15', amt: '10.00' },
      ],
    );
    expect(csv).toBe('Date,Amount\r\n2026-08-14,-4.50\r\n2026-08-15,10.00\r\n');
  });

  it('escapes descriptions with commas', () => {
    const csv = toCsv(
      [
        { key: 'name', label: 'Name' },
        { key: 'note', label: 'Note' },
      ],
      [{ name: 'Alice', note: 'coffee, tea' }],
    );
    expect(csv).toBe('Name,Note\r\nAlice,"coffee, tea"\r\n');
  });

  it('renders an empty rows list as just the header row', () => {
    const csv = toCsv([{ key: 'date', label: 'Date' }], []);
    expect(csv).toBe('Date\r\n');
  });
});
