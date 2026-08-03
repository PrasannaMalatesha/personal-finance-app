import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import { formatMoney, formatDate } from '../../shared/lib/format';
import type { RecurringGroupPublic } from './schemas';

export function RecurringCard({
  group,
  currency,
  onDismiss,
  onDelete,
}: {
  group: RecurringGroupPublic;
  currency: string;
  onDismiss: (g: RecurringGroupPublic) => void;
  onDelete: (g: RecurringGroupPublic) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  // Show amount as an expense (negative sign) — this pattern always represents
  // outgoing money since detection only runs on debits.
  const amountStr = `-${group.avgAmount}`;

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        opacity: group.isDismissed ? 0.55 : 1,
      }}
    >
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
            <Stack spacing={0.5} sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, wordBreak: 'break-word' }}
                noWrap
                title={group.displayName}
              >
                {group.displayName}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <EventRepeatOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  Every ~{group.cadenceDays} days · {group.txCount} charges
                </Typography>
              </Stack>
            </Stack>
            <IconButton
              size="small"
              onClick={(e) => setAnchor(e.currentTarget)}
              aria-label={`More actions for ${group.displayName}`}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
              {!group.isDismissed && (
                <MenuItem
                  onClick={() => {
                    close();
                    onDismiss(group);
                  }}
                >
                  Not recurring
                </MenuItem>
              )}
              <MenuItem
                onClick={() => {
                  close();
                  onDelete(group);
                }}
                sx={{ color: 'error.main' }}
              >
                Delete
              </MenuItem>
            </Menu>
          </Stack>

          <Box>
            <Typography
              variant="h5"
              sx={{ fontWeight: 700, color: 'error.main', fontVariantNumeric: 'tabular-nums' }}
            >
              {formatMoney(amountStr, currency)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              avg
            </Typography>
          </Box>

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ pt: 1, borderTop: (t) => `1px solid ${t.palette.divider}` }}
          >
            {group.categoryName ? (
              <Chip
                label={group.categoryName}
                size="small"
                sx={{
                  backgroundColor: (group.categoryColor ?? '#94a3b8') + '22',
                  color: group.categoryColor ?? undefined,
                  fontWeight: 500,
                }}
              />
            ) : (
              <Typography variant="caption" color="text.secondary">
                Uncategorized
              </Typography>
            )}
            <Stack spacing={0} alignItems="flex-end">
              <Typography variant="caption" color="text.secondary">
                Next expected
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {group.nextExpected ? formatDate(group.nextExpected) : '—'}
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
