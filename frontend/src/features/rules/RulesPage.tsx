import { useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { EmptyState } from '../../shared/components/EmptyState';
import { PageLoader } from '../../shared/components/PageLoader';
import { useCategories } from '../categories/useCategories';
import { useDeleteRule, useRules } from './useRules';
import { RULE_MATCH_TYPE_LABELS, type RulePublic } from './schemas';
import { RuleFormDialog } from './RuleFormDialog';

function RowActions({
  rule,
  onEdit,
  onDelete,
}: {
  rule: RulePublic;
  onEdit: (r: RulePublic) => void;
  onDelete: (r: RulePublic) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  return (
    <>
      <IconButton
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={`More actions for rule ${rule.matchValue}`}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        <MenuItem
          onClick={() => {
            close();
            onEdit(rule);
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            onDelete(rule);
          }}
          sx={{ color: 'error.main' }}
        >
          Delete
        </MenuItem>
      </Menu>
    </>
  );
}

export function RulesPage() {
  const rules = useRules();
  const categories = useCategories();
  const del = useDeleteRule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RulePublic | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (r: RulePublic) => {
    setEditing(r);
    setDialogOpen(true);
  };
  const handleDelete = (r: RulePublic) => {
    if (window.confirm(`Delete the rule "${r.matchValue}"?`)) {
      del.mutate(r.id);
    }
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="h4" component="h1">
            Rules
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Auto-assign a category to transactions whose description matches a keyword.
          </Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Add rule
        </Button>
      </Stack>

      {rules.isPending && (
        <PageLoader />
      )}

      {rules.isError && (
        <Alert severity="error">
          Couldn&apos;t load rules: {(rules.error as Error).message}
        </Alert>
      )}

      {rules.data && rules.data.length === 0 && (
        <EmptyState
          icon={<AutoAwesomeOutlinedIcon />}
          title="No rules yet"
          description="Add a rule for a merchant name you see often — it'll categorize matching transactions on manual entry and CSV import."
          action={{ label: 'Add rule', onClick: openCreate }}
        />
      )}

      {rules.data && rules.data.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Match</TableCell>
                <TableCell>Value</TableCell>
                <TableCell>Category</TableCell>
                <TableCell align="right">Priority</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.data.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {RULE_MATCH_TYPE_LABELS[r.matchType]}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>{r.matchValue}</TableCell>
                  <TableCell>
                    <Chip
                      label={r.categoryName}
                      size="small"
                      sx={{
                        backgroundColor: r.color + '22',
                        color: r.color,
                        fontWeight: 500,
                      }}
                    />
                  </TableCell>
                  <TableCell align="right">{r.priority}</TableCell>
                  <TableCell align="right" sx={{ width: 40 }}>
                    <RowActions rule={r} onEdit={openEdit} onDelete={handleDelete} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <RuleFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        categories={categories.data ?? []}
        editing={editing}
      />
    </Stack>
  );
}
