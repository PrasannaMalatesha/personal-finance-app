import { Skeleton, Stack } from '@mui/material';

/**
 * Themed load state shared by every top-level page. Replaces the generic
 * spinner with a subtle skeleton whose blocks match the "page header + card"
 * rhythm the rest of the app uses. Perceived-perf > actual perf.
 *
 * Not for dashboard — that surface has its own DashboardSkeleton because
 * the layout is bespoke. This one covers the tables + list pages
 * (transactions, accounts, budgets, rules, categories, imports, subscriptions).
 */
export function PageLoader() {
  return (
    <Stack spacing={2} aria-busy>
      <Skeleton
        variant="text"
        width={200}
        height={40}
        sx={{ transform: 'none' }}
      />
      <Skeleton
        variant="rounded"
        height={44}
        sx={{ borderRadius: (t) => `${t.pfa.radius.md}px` }}
      />
      <Skeleton
        variant="rounded"
        height={360}
        sx={{ borderRadius: (t) => `${t.pfa.radius.lg}px` }}
      />
    </Stack>
  );
}
