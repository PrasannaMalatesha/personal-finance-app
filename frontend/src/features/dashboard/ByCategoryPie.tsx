import { Box, CardContent, Stack, Typography } from '@mui/material';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Surface } from '../../shared/components/Surface';
import { formatMoney } from '../../shared/lib/format';
import type { DashboardCategorySlice } from './schemas';

/**
 * Spending-by-category pie for the current month. Recharts sizes to its
 * ResponsiveContainer; we cap the height so the card stays predictable.
 * The legend on the right lists each category with a color swatch + amount.
 */
export function ByCategoryPie({
  data,
  currency,
}: {
  data: DashboardCategorySlice[];
  currency: string;
}) {
  const total = data.reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <Surface variant="glass" hover sx={{ height: '100%' }} className="pfa-fade-up">
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary">
            Spending by category
          </Typography>
          {data.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No expenses yet this month.
            </Typography>
          ) : (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <Box sx={{ width: { xs: '100%', sm: 220 }, height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.map((d) => ({ ...d, amountNum: Number(d.amount) }))}
                      dataKey="amountNum"
                      nameKey="categoryName"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={1}
                    >
                      {data.map((d) => (
                        <Cell key={d.categoryId ?? 'uncat'} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatMoney(Number(value).toFixed(2), currency)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
              <Stack spacing={0.75} sx={{ flexGrow: 1, minWidth: 0 }}>
                {data.map((d) => {
                  const pct = total > 0 ? Math.round((Number(d.amount) / total) * 100) : 0;
                  return (
                    <Stack
                      key={d.categoryId ?? 'uncat'}
                      direction="row"
                      alignItems="center"
                      spacing={1.5}
                    >
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: d.color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{ flexGrow: 1, minWidth: 0 }}
                        noWrap
                      >
                        {d.categoryName}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}
                      >
                        {formatMoney(d.amount, currency)}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ width: 34, textAlign: 'right' }}
                      >
                        {pct}%
                      </Typography>
                    </Stack>
                  );
                })}
              </Stack>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Surface>
  );
}
