import { Alert, Stack, Typography } from '@mui/material';

export function DashboardPage() {
  return (
    <Stack spacing={2}>
      <Typography variant="h4">Dashboard</Typography>
      <Alert severity="info">
        Empty state placeholder. Real dashboard lands on Day 12 per TRD §10.
      </Alert>
    </Stack>
  );
}
