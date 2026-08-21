import { Box, Skeleton, Stack } from '@mui/material';

/**
 * Load-state stand-in for the dashboard. Matches the actual layout so the
 * transition to real content doesn't jump — Emil's "make the skeleton
 * shaped like the destination" principle. Perceived-perf > actual perf.
 */
export function DashboardSkeleton() {
  return (
    <Stack spacing={2}>
      {/* Summary hero — matches SummaryCard height */}
      <Skeleton
        variant="rounded"
        height={168}
        sx={{ borderRadius: (t) => `${t.pfa.radius.lg}px` }}
      />
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' },
        }}
      >
        <Skeleton
          variant="rounded"
          height={280}
          sx={{ borderRadius: (t) => `${t.pfa.radius.lg}px` }}
        />
        <Skeleton
          variant="rounded"
          height={280}
          sx={{ borderRadius: (t) => `${t.pfa.radius.lg}px` }}
        />
      </Box>
      <Skeleton
        variant="rounded"
        height={240}
        sx={{ borderRadius: (t) => `${t.pfa.radius.lg}px` }}
      />
    </Stack>
  );
}
