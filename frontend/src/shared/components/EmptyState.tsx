import type { ReactNode } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';

/**
 * Consistent empty-state visual: soft rounded panel, icon on top, headline,
 * subhead, optional CTA. Used across pages when no data exists yet.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <Box
      sx={{
        border: (t) => `1px dashed ${t.palette.divider}`,
        borderRadius: 3,
        py: { xs: 6, md: 8 },
        px: 3,
        textAlign: 'center',
        backgroundColor: 'background.paper',
      }}
    >
      <Stack spacing={2} alignItems="center">
        {icon && (
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.9,
            }}
          >
            {icon}
          </Box>
        )}
        <Stack spacing={0.5} alignItems="center" sx={{ maxWidth: 480 }}>
          <Typography variant="h6" component="p">
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          )}
        </Stack>
        {action && (
          <Button variant="contained" onClick={action.onClick} sx={{ mt: 1 }}>
            {action.label}
          </Button>
        )}
      </Stack>
    </Box>
  );
}
