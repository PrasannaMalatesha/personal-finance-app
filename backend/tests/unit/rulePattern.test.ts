import { describe, it, expect } from 'vitest';
import { extractPattern } from '../../src/lib/rulePattern';

describe('extractPattern', () => {
  it.each([
    ['STARBUCKS COFFEE #4521', 'starbucks'],
    ['Uber Trip 43x2', 'uber'],
    ['SQ *ARTISAN COFFEE', 'artisan'],
    ['MC*Trader Joe\'s', 'trader'],
    ['AMZN Mktp US*1D5AB', 'amzn'],
    ['Payment received', 'payment'],
    ['NETFLIX.COM', 'netflix'],
    ['SPOTIFY USA 8778', 'spotify'],
    ['  UBER  EATS  4444  ', 'uber'],
  ])('extracts "%s" → "%s"', (input, expected) => {
    expect(extractPattern(input)).toBe(expected);
  });

  it.each([
    ['', null],
    ['AB', null], // too short
    ['The', null], // generic skipped
    ['A B C', null], // all too short
    ['123 456', null], // no letters
    ['#@!$%', null], // no letters
    ['a an the', null], // all skipped generics
  ])('returns null for edge case %j', (input, expected) => {
    expect(extractPattern(input)).toBe(expected);
  });

  it('is case-insensitive and yields a lowercased token', () => {
    expect(extractPattern('STARBUCKS')).toBe('starbucks');
    expect(extractPattern('Starbucks')).toBe('starbucks');
    expect(extractPattern('starbucks')).toBe('starbucks');
  });

  it('skips over short/generic prefixes to find a usable token', () => {
    // "the coffee shop" → skip "the", return "coffee".
    expect(extractPattern('The Coffee Shop')).toBe('coffee');
  });
});
