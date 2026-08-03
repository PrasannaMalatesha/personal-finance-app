import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import { EmptyState } from '../../shared/components/EmptyState';
import { useAuth } from '../auth/useAuth';
import {
  useDeleteRecurring,
  useDismissRecurring,
  useRecurring,
  useRunDetection,
} from './useRecurring';
import { RecurringCard } from './RecurringCard';
import type { RecurringGroupPublic } from './schemas';

export function SubscriptionsPage() {
  const { user } = useAuth();
  const currency = user?.baseCurrency ?? 'USD';

  const groups = useRecurring();
  const detect = useRunDetection();
  const dismiss = useDismissRecurring();
  const del = useDeleteRecurring();

  const handleDismiss = (g: RecurringGroupPublic) => {
    if (window.confirm(`Mark "${g.displayName}" as not recurring?`)) {
      dismiss.mutate(g.id);
    }
  };
  const handleDelete = (g: RecurringGroupPublic) => {
    if (window.confirm(`Delete "${g.displayName}"?`)) {
      del.mutate(g.id);
    }
  };
  const runDetect = () => detect.mutate();

  const active = (groups.data ?? []).filter((g) => !g.isDismissed);
  const dismissed = (groups.data ?? []).filter((g) => g.isDismissed);
  const hasAny = (groups.data?.length ?? 0) > 0;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="h4" component="h1">
            Subscriptions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Recurring charges we&apos;ve detected from your transaction history.
          </Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AutorenewIcon />}
          onClick={runDetect}
          disabled={detect.isPending}
        >
          {detect.isPending ? 'Detecting…' : 'Run detection'}
        </Button>
      </Stack>

      {detect.data && (
        <Alert severity="success" onClose={() => detect.reset()}>
          Detection ran — {detect.data.totalGroups} recurring group
          {detect.data.totalGroups === 1 ? '' : 's'} ({detect.data.detected} new,{' '}
          {detect.data.updated} refreshed).
        </Alert>
      )}

      {(groups.isError || detect.isError) && (
        <Alert severity="error">
          {(groups.error ?? detect.error)?.message}
        </Alert>
      )}

      {groups.isPending && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {groups.data && !hasAny && (
        <EmptyState
          icon={<EventRepeatOutlinedIcon />}
          title="No subscriptions detected"
          description="Click Run detection to scan your transaction history for merchants that charge you on a monthly cadence."
          action={{ label: 'Run detection', onClick: runDetect }}
        />
      )}

      {active.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
            },
          }}
        >
          {active.map((g) => (
            <RecurringCard
              key={g.id}
              group={g}
              currency={currency}
              onDismiss={handleDismiss}
              onDelete={handleDelete}
            />
          ))}
        </Box>
      )}

      {dismissed.length > 0 && (
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          <Typography variant="overline" color="text.secondary">
            Dismissed
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(3, minmax(0, 1fr))',
              },
            }}
          >
            {dismissed.map((g) => (
              <RecurringCard
                key={g.id}
                group={g}
                currency={currency}
                onDismiss={handleDismiss}
                onDelete={handleDelete}
              />
            ))}
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
