import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { formatMoney } from '../../shared/lib/format';
import type { BudgetPublic } from './schemas';

/**
 * Pick the progress-bar color from percent used:
 *  - 0–80  → primary (teal): comfortable
 *  - 80–100 → warning (amber): watch it
 *  - >100  → error (red): over budget
 */
function progressColor(percent: number): 'primary' | 'warning' | 'error' {
  if (percent > 100) return 'error';
  if (percent >= 80) return 'warning';
  return 'primary';
}

export function BudgetCard({
  budget,
  currency,
  onEdit,
  onDelete,
}: {
  budget: BudgetPublic;
  currency: string;
  onEdit: (b: BudgetPublic) => void;
  onDelete: (b: BudgetPublic) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  // Clamp the bar fill; keep the numeric percent readable even when >100%.
  const filled = Math.min(budget.percentUsed, 100);
  const color = progressColor(budget.percentUsed);

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Chip
              label={budget.categoryName}
              size="small"
              sx={{
                backgroundColor: budget.color + '22',
                color: budget.color,
                fontWeight: 600,
              }}
            />
            <IconButton
              size="small"
              onClick={(e) => setAnchor(e.currentTarget)}
              aria-label={`More actions for ${budget.categoryName}`}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
              <MenuItem
                onClick={() => {
                  close();
                  onEdit(budget);
                }}
              >
                Edit
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  onDelete(budget);
                }}
                sx={{ color: 'error.main' }}
              >
                Delete
              </MenuItem>
            </Menu>
          </Stack>

          <Box>
            <Stack
              direction="row"
              alignItems="baseline"
              justifyContent="space-between"
              sx={{ mb: 0.5 }}
            >
              <Typography variant="body2" color="text.secondary">
                Spent
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(budget.amountSpent, currency)}
                </Box>{' '}
                <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                  of {formatMoney(budget.amountLimit, currency)}
                </Box>
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={filled}
              color={color}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>

          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">
              {budget.percentUsed}% used
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                color: budget.isOverBudget ? 'error.main' : 'text.primary',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {budget.isOverBudget
                ? `${formatMoney(budget.amountRemaining.replace(/^-/, ''), currency)} over`
                : `${formatMoney(budget.amountRemaining, currency)} left`}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
