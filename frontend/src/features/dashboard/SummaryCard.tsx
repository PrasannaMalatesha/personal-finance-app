import {
  Box,
  CardContent,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { Surface } from '../../shared/components/Surface';
import { formatMoney } from '../../shared/lib/format';
import type { DashboardSummary } from './schemas';

function progressColor(percent: number): 'primary' | 'warning' | 'error' {
  if (percent > 100) return 'error';
  if (percent >= 80) return 'warning';
  return 'primary';
}

/**
 * The "so what" widget: leads with the budget status headline, then breaks
 * down income / expenses / net for the month. Everything is clamped to 0/100
 * for the progress bar so an over-budget month still renders a full bar in red.
 */
export function SummaryCard({
  summary,
  currency,
}: {
  summary: DashboardSummary;
  currency: string;
}) {
  const hasBudgets = Number(summary.budgetTotalLimit) > 0;
  const pct = summary.budgetPercentUsed;
  const remaining = (
    Number(summary.budgetTotalLimit) - Number(summary.budgetTotalSpent)
  ).toFixed(2);
  const netN = Number(summary.net);

  return (
    <Surface variant="accent" hover className="pfa-fade-up">
      <CardContent>
        <Stack spacing={2.5}>
          <Stack spacing={0.5}>
            <Typography variant="overline" color="text.secondary">
              This month
            </Typography>
            {hasBudgets ? (
              <Typography variant="h5" component="p" sx={{ fontWeight: 700 }}>
                {`${formatMoney(summary.budgetTotalSpent, currency)} of ${formatMoney(summary.budgetTotalLimit, currency)}`}
                <Box
                  component="span"
                  sx={{
                    ml: 1,
                    color: pct > 100 ? 'error.main' : 'text.secondary',
                    fontWeight: 500,
                    fontSize: 16,
                  }}
                >
                  ({pct}% used)
                </Box>
              </Typography>
            ) : (
              <Typography variant="h5" component="p" sx={{ fontWeight: 700 }}>
                {formatMoney(summary.expenses, currency)}
                <Box
                  component="span"
                  sx={{ ml: 1, color: 'text.secondary', fontWeight: 500, fontSize: 16 }}
                >
                  spent
                </Box>
              </Typography>
            )}
          </Stack>

          {hasBudgets && (
            <Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(pct, 100)}
                color={progressColor(pct)}
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Typography
                variant="body2"
                color={pct > 100 ? 'error.main' : 'text.secondary'}
                sx={{ mt: 1 }}
              >
                {pct > 100
                  ? `${formatMoney(remaining.replace(/^-/, ''), currency)} over budget`
                  : `${formatMoney(remaining, currency)} left across all budgets`}
              </Typography>
            </Box>
          )}

          <Stack
            direction="row"
            spacing={4}
            sx={{ pt: 1, borderTop: (t) => `1px solid ${t.palette.divider}` }}
          >
            <Stat label="Income" value={summary.income} currency={currency} tone="success" />
            <Stat label="Expenses" value={summary.expenses} currency={currency} tone="expense" />
            <Stat
              label="Net"
              value={summary.net}
              currency={currency}
              tone={netN >= 0 ? 'success' : 'expense'}
            />
          </Stack>
        </Stack>
      </CardContent>
    </Surface>
  );
}

function Stat({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: string;
  currency: string;
  tone: 'success' | 'expense';
}) {
  const color = tone === 'success' ? 'success.main' : 'error.main';
  return (
    <Stack spacing={0.5} sx={{ pt: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="h6"
        sx={{ color, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
      >
        {formatMoney(value, currency)}
      </Typography>
    </Stack>
  );
}
