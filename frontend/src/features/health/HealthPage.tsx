import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../shared/api/client';

type HealthResponse = {
  data: {
    status: 'ok' | 'degraded';
    db: 'ok' | 'error';
    uptime: number;
    timestamp: string;
  };
};

type FlagsResponse = {
  data: {
    plaid: boolean;
    recurringDetection: boolean;
    multiCurrency: boolean;
  };
};

export function HealthPage() {
  const healthQuery = useQuery({
    queryKey: ['healthz'],
    queryFn: () => apiFetch<HealthResponse>('/healthz'),
  });

  const flagsQuery = useQuery({
    queryKey: ['flags'],
    queryFn: () => apiFetch<FlagsResponse>('/api/v1/flags'),
  });

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Backend health</Typography>
      <Typography variant="body2" color="text.secondary">
        Live-fetched from the backend via TanStack Query. Proves the frontend ↔
        backend wire before we build any real features.
      </Typography>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { md: '1fr 1fr' } }}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              GET /healthz
            </Typography>
            {healthQuery.isPending && <CircularProgress size={24} />}
            {healthQuery.isError && (
              <Alert severity="error">
                {(healthQuery.error as Error).message}
              </Alert>
            )}
            {healthQuery.data && (
              <pre style={{ margin: 0, fontSize: 13 }}>
                {JSON.stringify(healthQuery.data.data, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              GET /api/v1/flags
            </Typography>
            {flagsQuery.isPending && <CircularProgress size={24} />}
            {flagsQuery.isError && (
              <Alert severity="error">
                {(flagsQuery.error as Error).message}
              </Alert>
            )}
            {flagsQuery.data && (
              <pre style={{ margin: 0, fontSize: 13 }}>
                {JSON.stringify(flagsQuery.data.data, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}
