/**
 * Heuristic merchant-token extractor for rule-learning. Takes a raw
 * transaction description and returns a lowercased alphabetic prefix
 * suitable as a `substring` rule pattern.
 *
 * Strategy:
 *   1. Lowercase, strip everything that isn't a letter or space.
 *   2. Walk tokens left-to-right, skipping single letters or 2-char
 *      generics ("mc", "sq", "tst", "usd").
 *   3. Return the first token of length ≥ MIN_TOKEN_LEN, or null.
 *
 * Examples (see rulePattern.test.ts for the full matrix):
 *   "STARBUCKS COFFEE #4521"        → "starbucks"
 *   "Uber Trip 43x2"                → "uber"
 *   "SQ *ARTISAN COFFEE"            → "artisan"    (skips 2-char "sq")
 *   "MC*Trader Joe's"               → "trader"     (skips "mc")
 *   "AMZN Mktp US*1D5AB"            → "amzn"
 *   "AB"                            → null         (too short)
 *   "The"                           → null         (skipped generic)
 *   "Payment received"              → "payment"
 */
const MIN_TOKEN_LEN = 4;

// Skip common non-merchant prefixes that show up in bank statements. Kept
// short; the length check catches most other garbage.
const SKIP_TOKENS = new Set([
  'the',
  'a',
  'an',
  'and',
  'for',
  'from',
  'to',
]);

export function extractPattern(description: string): string | null {
  if (!description) return null;
  // Lowercase; keep letters + spaces only. Digits, punctuation, and
  // asterisks (Plaid + Amex use them as separators) become spaces.
  const cleaned = description
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  for (const token of cleaned.split(' ')) {
    if (token.length < MIN_TOKEN_LEN) continue;
    if (SKIP_TOKENS.has(token)) continue;
    return token;
  }
  return null;
}
