import { Box } from '@mui/material';
import { formatMoney, isExpense } from '../lib/format';

/**
 * Display a signed wire amount in the user's baseCurrency, color-coded:
 * red for expenses (negative), green for income (positive), muted for zero.
 * Uses tabular-nums so a column of amounts aligns cleanly.
 */
export function MoneyCell({
  amount,
  currency,
  align = 'right',
}: {
  amount: string;
  currency: string;
  align?: 'left' | 'right';
}) {
  const negative = isExpense(amount);
  const zero = Number(amount) === 0;
  const color = zero
    ? 'text.secondary'
    : negative
      ? 'error.main'
      : 'success.main';

  return (
    <Box
      component="span"
      sx={{
        color,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 500,
        textAlign: align,
        display: 'inline-block',
        width: '100%',
      }}
    >
      {formatMoney(amount, currency)}
    </Box>
  );
}
