import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '../../shared/lib/format';
import { brand } from '../../app/theme';
import type { DashboardNetWorthPoint } from './schemas';

/** "2026-07" → "Jul" for compact X-axis labels. */
function shortMonth(month: string): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  });
}

export function NetWorthChart({
  data,
  currency,
}: {
  data: DashboardNetWorthPoint[];
  currency: string;
}) {
  const theme = useTheme();
  const rows = data.map((p) => ({
    label: shortMonth(p.month),
    'Net worth': Number(p.netWorth),
  }));
  const latest = data.length > 0 ? data[data.length - 1]! : null;
  const first = data.length > 0 ? data[0]! : null;
  const change =
    first && latest ? Number(latest.netWorth) - Number(first.netWorth) : 0;
  const hasAny = data.some((p) => Number(p.netWorth) !== 0);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Stack direction="row" alignItems="baseline" justifyContent="space-between">
            <Typography variant="overline" color="text.secondary">
              Net worth
            </Typography>
            {latest && (
              <Stack direction="row" spacing={1.5} alignItems="baseline">
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatMoney(latest.netWorth, currency)}
                </Typography>
                {hasAny && (
                  <Typography
                    variant="body2"
                    sx={{
                      color: change >= 0 ? 'success.main' : 'error.main',
                      fontWeight: 500,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {change >= 0 ? '+' : ''}
                    {formatMoney(change.toFixed(2), currency)}
                  </Typography>
                )}
              </Stack>
            )}
          </Stack>
          {!hasAny ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              Add accounts + a few months of transactions to see your net worth trend.
            </Typography>
          ) : (
            <Box sx={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={brand.teal[500]} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={brand.teal[500]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v: number) =>
                      new Intl.NumberFormat(undefined, {
                        notation: 'compact',
                        maximumFractionDigits: 1,
                      }).format(v)
                    }
                  />
                  <Tooltip
                    formatter={(value) => formatMoney(Number(value).toFixed(2), currency)}
                  />
                  <Area
                    type="monotone"
                    dataKey="Net worth"
                    stroke={brand.teal[500]}
                    strokeWidth={2}
                    fill="url(#netWorthFill)"
                    dot={{ r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
