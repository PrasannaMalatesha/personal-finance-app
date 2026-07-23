import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseCsvBuffer, CsvParseError } from '../../src/lib/csv';
import {
  detectPreset,
  HDFC,
  CHASE,
  ICICI,
  SBI,
  BOFA,
  WELLS_FARGO,
} from '../../src/lib/csv/presets';
import { detectGenericColumns } from '../../src/lib/csv/columns';
import {
  normalizeAmount,
  normalizeDate,
  normalizeDescription,
} from '../../src/lib/csv/normalize';

const fixture = (name: string): Buffer =>
  readFileSync(resolve(__dirname, '../fixtures/imports', name));

describe('csv/normalize', () => {
  describe('normalizeAmount', () => {
    it.each([
      ['1234.56', '1234.56'],
      ['1,234.56', '1234.56'],
      ['-1234', '-1234.00'],
      ['(450.00)', '-450.00'],
      ['(1,234.56)', '-1234.56'],
      ['₹450', '450.00'],
      ['$1,000.5', '1000.50'],
      ['0', '0.00'],
      ['', '0.00'],
      ['0.00', '0.00'],
      ['+42', '42.00'],
      ['1234.5678', '1234.56'], // truncated to 2 dp
    ])('normalizes %s → %s', (input, expected) => {
      expect(normalizeAmount(input)).toBe(expected);
    });

    it('rejects non-numeric', () => {
      expect(() => normalizeAmount('abc')).toThrow(CsvParseError);
    });
  });

  describe('normalizeDate', () => {
    it('parses DMY / MDY / YMD', () => {
      expect(normalizeDate('15/07/26', 'DMY')).toBe('2026-07-15');
      expect(normalizeDate('07/15/2026', 'MDY')).toBe('2026-07-15');
      expect(normalizeDate('2026-07-15', 'YMD')).toBe('2026-07-15');
    });

    it('accepts multiple separators', () => {
      expect(normalizeDate('15-07-2026', 'DMY')).toBe('2026-07-15');
      expect(normalizeDate('2026.07.15', 'YMD')).toBe('2026-07-15');
    });

    it('rejects nonsense', () => {
      expect(() => normalizeDate('15-13-2026', 'DMY')).toThrow(CsvParseError);
      expect(() => normalizeDate('nope', 'DMY')).toThrow(CsvParseError);
    });
  });

  it('normalizeDescription collapses whitespace', () => {
    expect(normalizeDescription('  Starbucks    Coffee   ')).toBe('Starbucks Coffee');
  });
});

describe('csv/columns.detectGenericColumns', () => {
  it('picks generic signed columns', () => {
    const d = detectGenericColumns(['Date', 'Description', 'Amount']);
    expect(d.presetName).toBe('generic');
    expect(d.amountKind).toBe('signed');
    expect(d.date).toBe('Date');
    expect(d.description).toBe('Description');
    expect(d.amount).toBe('Amount');
  });

  it('picks generic debit/credit split', () => {
    const d = detectGenericColumns(['Date', 'Description', 'Debit', 'Credit']);
    expect(d.amountKind).toBe('debit-credit');
    expect(d.debit).toBe('Debit');
    expect(d.credit).toBe('Credit');
  });

  it('handles case-insensitive header matches via substring', () => {
    const d = detectGenericColumns(['TXN DATE', 'MERCHANT DETAILS', 'AMT']);
    expect(d.date).toBe('TXN DATE');
    expect(d.description).toBe('MERCHANT DETAILS');
    expect(d.amount).toBe('AMT');
  });

  it('throws when date/description missing', () => {
    expect(() => detectGenericColumns(['foo', 'bar'])).toThrow(CsvParseError);
  });

  it('throws when no amount signal present', () => {
    expect(() => detectGenericColumns(['Date', 'Description'])).toThrow(CsvParseError);
  });
});

describe('csv/presets.detectPreset', () => {
  it('detects HDFC by signature', () => {
    expect(detectPreset(['Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.']))
      .toBe(HDFC);
  });

  it('detects Chase by signature', () => {
    expect(detectPreset(['Details', 'Posting Date', 'Description', 'Amount', 'Type']))
      .toBe(CHASE);
  });

  it('detects ICICI by signature', () => {
    expect(
      detectPreset([
        'Transaction Date',
        'Transaction Remarks',
        'Withdrawal Amount',
        'Deposit Amount',
        'Balance',
      ]),
    ).toBe(ICICI);
  });

  it('detects SBI by signature', () => {
    expect(
      detectPreset(['Txn Date', 'Value Date', 'Description', 'Ref No./Cheque No.', 'Debit', 'Credit', 'Balance']),
    ).toBe(SBI);
  });

  it('detects Bank of America by signature', () => {
    expect(detectPreset(['Date', 'Description', 'Amount', 'Running Bal.'])).toBe(BOFA);
  });

  it('detects Wells Fargo by signature', () => {
    expect(detectPreset(['Trans Date', 'Post Date', 'Amount', 'Description'])).toBe(WELLS_FARGO);
  });

  it('returns null for unknown headers', () => {
    expect(detectPreset(['Date', 'Description', 'Amount'])).toBeNull();
  });
});

describe('csv/parseCsvBuffer — Indian bank fixtures', () => {
  it('parses ICICI (DMY dates, debit/credit split)', () => {
    const result = parseCsvBuffer(fixture('icici-sample.csv'));
    expect(result.detectedColumns.presetName).toBe('ICICI');
    expect(result.rows[0]).toEqual({
      index: 0,
      date: '2026-07-15',
      description: 'UPI/STARBUCKS/450',
      amount: '-450.00',
    });
    expect(result.rows[1]?.amount).toBe('50000.00');
  });

  it('parses SBI (DMY dates, debit/credit split)', () => {
    const result = parseCsvBuffer(fixture('sbi-sample.csv'));
    expect(result.detectedColumns.presetName).toBe('SBI');
    expect(result.rows[0]?.amount).toBe('-450.00');
    expect(result.rows[1]?.amount).toBe('50000.00');
  });
});

describe('csv/parseCsvBuffer — US bank fixtures', () => {
  it('parses Bank of America (MDY dates, signed amount)', () => {
    const result = parseCsvBuffer(fixture('bofa-sample.csv'));
    expect(result.detectedColumns.presetName).toBe('BankOfAmerica');
    expect(result.rows[0]).toEqual({
      index: 0,
      date: '2026-07-15',
      description: 'STARBUCKS #1234 SEATTLE WA',
      amount: '-6.50',
    });
  });

  it('parses Wells Fargo (MDY dates, signed amount)', () => {
    const result = parseCsvBuffer(fixture('wellsfargo-sample.csv'));
    expect(result.detectedColumns.presetName).toBe('WellsFargo');
    expect(result.rows[0]?.date).toBe('2026-07-15');
    expect(result.rows[1]?.amount).toBe('2500.00');
  });
});

describe('csv/parseCsvBuffer — HDFC fixture', () => {
  const result = parseCsvBuffer(fixture('hdfc-sample.csv'));

  it('detects the HDFC preset', () => {
    expect(result.detectedColumns.presetName).toBe('HDFC');
    expect(result.detectedColumns.amountKind).toBe('debit-credit');
  });

  it('normalizes debit rows to negative', () => {
    expect(result.rows[0]).toEqual({
      index: 0,
      date: '2026-07-15',
      description: 'UPI-STARBUCKS BENGALURU',
      amount: '-450.00',
    });
  });

  it('normalizes credit rows to positive', () => {
    expect(result.rows[1]).toEqual({
      index: 1,
      date: '2026-07-16',
      description: 'SALARY CREDIT ACME CORP',
      amount: '50000.00',
    });
  });

  it('strips commas in amounts', () => {
    expect(result.rows[2]?.amount).toBe('-2000.00');
  });
});

describe('csv/parseCsvBuffer — Chase fixture', () => {
  const result = parseCsvBuffer(fixture('chase-sample.csv'));

  it('detects the Chase preset', () => {
    expect(result.detectedColumns.presetName).toBe('Chase');
    expect(result.detectedColumns.amountKind).toBe('signed');
  });

  it('parses MDY dates + signed amounts', () => {
    expect(result.rows[0]).toEqual({
      index: 0,
      date: '2026-07-15',
      description: 'STARBUCKS COFFEE #4021',
      amount: '-6.50',
    });
    expect(result.rows[1]).toEqual({
      index: 1,
      date: '2026-07-16',
      description: 'ACH CREDIT PAYROLL',
      amount: '2500.00',
    });
  });
});

describe('csv/parseCsvBuffer — generic fixture', () => {
  const result = parseCsvBuffer(fixture('generic-sample.csv'));

  it('falls back to generic', () => {
    expect(result.detectedColumns.presetName).toBe('generic');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.amount).toBe('-4.50');
    expect(result.rows[1]?.amount).toBe('10.00');
  });
});

describe('csv/parseCsvBuffer — error cases', () => {
  it('rejects empty CSV', () => {
    expect(() => parseCsvBuffer(Buffer.from(''))).toThrow(CsvParseError);
  });

  it('rejects HDFC row with both debit and credit set', () => {
    const bad = Buffer.from(
      'Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance\n' +
        '15/07/26,BAD ROW,100.00,200.00,0.00\n',
    );
    expect(() => parseCsvBuffer(bad)).toThrow(CsvParseError);
  });
});
