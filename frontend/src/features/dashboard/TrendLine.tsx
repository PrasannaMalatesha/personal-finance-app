import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '../../shared/lib/format';
import { brand } from '../../app/theme';
import type { DashboardTrendPoint } from './schemas';

/** "2026-07" → "Jul" — compact label for the X-axis. */
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

export function TrendLine({
  data,
  currency,
}: {
  data: DashboardTrendPoint[];
  currency: string;
}) {
  const rows = data.map((p) => ({
    label: shortMonth(p.month),
    Income: Number(p.income),
    Expenses: Number(p.expenses),
  }));
  const hasAnyData = data.some(
    (p) => Number(p.income) > 0 || Number(p.expenses) > 0,
  );

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary">
            6-month trend
          </Typography>
          {!hasAnyData ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              Add a few months of transactions to see your trend.
            </Typography>
          ) : (
            <Box sx={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={brand.slate[200]} />
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
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="Income"
                    stroke={brand.teal[500]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Expenses"
                    stroke="#b91c1c"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
