import { useState } from 'react';
import { Alert, Box, Stack, Typography } from '@mui/material';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../../shared/components/EmptyState';
import { useAuth } from '../auth/useAuth';
import { useAccounts } from '../accounts/useAccounts';
import { MonthPicker } from '../budgets/MonthPicker';
import { currentMonth } from '../budgets/schemas';
import { SummaryCard } from './SummaryCard';
import { ByCategoryPie } from './ByCategoryPie';
import { TrendLine } from './TrendLine';
import { NetWorthChart } from './NetWorthChart';
import { DashboardSkeleton } from './DashboardSkeleton';
import { flags } from '../../flags';
import { useByCategory, useNetWorth, useSummary, useTrend } from './useDashboard';

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currency = user?.baseCurrency ?? 'USD';
  const accounts = useAccounts();
  const [month, setMonth] = useState<string>(currentMonth);

  const summary = useSummary(month);
  const byCategory = useByCategory(month);
  const trend = useTrend(6);
  // Skip the request when the flag is off; the endpoint isn't mounted server-side.
  const netWorth = useNetWorth(6, flags.netWorth);

  const zeroAccounts = accounts.data && accounts.data.length === 0;
  const anyError = summary.error ?? byCategory.error ?? trend.error ?? netWorth.error;
  const anyPending = summary.isPending || byCategory.isPending || trend.isPending;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="h4" component="h1">
            Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This month at a glance, plus your last six months of activity.
          </Typography>
        </Stack>
        {!zeroAccounts && <MonthPicker value={month} onChange={setMonth} />}
      </Stack>

      {zeroAccounts && (
        <EmptyState
          icon={<AccountBalanceWalletOutlinedIcon />}
          title="Add your first account"
          description="Create an account, then add transactions manually or import a CSV. The dashboard will fill in as you go."
          action={{ label: 'Add account', onClick: () => navigate('/accounts') }}
        />
      )}

      {!zeroAccounts && anyError && (
        <Alert severity="error">{(anyError as Error).message}</Alert>
      )}

      {!zeroAccounts && anyPending && <DashboardSkeleton />}

      {!zeroAccounts && summary.data && byCategory.data && trend.data && (
        // Stagger the card entries via nth-child. Each Surface child already
        // opts into pfa-fade-up; here we just shift the animation-delay so
        // they cascade rather than land in unison. 60ms is Emil's low end —
        // fast enough to feel like polish, slow enough to notice.
        <Stack
          spacing={2}
          sx={{
            '& .pfa-fade-up:nth-of-type(1)': { animationDelay: '0ms' },
            '& .pfa-fade-up:nth-of-type(2)': { animationDelay: '60ms' },
            '& .pfa-fade-up:nth-of-type(3)': { animationDelay: '120ms' },
            '& .pfa-fade-up:nth-of-type(4)': { animationDelay: '180ms' },
          }}
        >
          <SummaryCard summary={summary.data} currency={currency} />
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' },
            }}
          >
            <ByCategoryPie data={byCategory.data} currency={currency} />
            <TrendLine data={trend.data} currency={currency} />
          </Box>
          {flags.netWorth && netWorth.data && (
            <NetWorthChart data={netWorth.data} currency={currency} />
          )}
        </Stack>
      )}
    </Stack>
  );
}
