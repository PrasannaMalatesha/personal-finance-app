import type { ReactNode } from 'react';
import { Stack, Typography } from '@mui/material';

/**
 * Consistent page header used by every top-level route. Left column carries
 * the title + optional subtitle (editorial tightening from tokens); right
 * column optionally carries page-level actions (buttons, filters, pickers).
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={{ xs: 2, md: 3 }}
      alignItems={{ md: 'flex-end' }}
      justifyContent="space-between"
    >
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h1">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '65ch' }}>
            {subtitle}
          </Typography>
        )}
      </Stack>
      {actions && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
