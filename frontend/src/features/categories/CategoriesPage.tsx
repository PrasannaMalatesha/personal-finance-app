import { Fragment, useMemo, useState } from 'react';
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
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import { EmptyState } from '../../shared/components/EmptyState';
import { PageLoader } from '../../shared/components/PageLoader';
import { useCategories, useDeleteCategory } from './useCategories';
import { CategoryFormDialog } from './CategoryFormDialog';
import type { CategoryPublic } from './categoriesApi';

interface TreeNode {
  parent: CategoryPublic;
  children: CategoryPublic[];
}

function RowActions({
  category,
  onEdit,
  onDelete,
}: {
  category: CategoryPublic;
  onEdit: (c: CategoryPublic) => void;
  onDelete: (c: CategoryPublic) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  return (
    <>
      <IconButton
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={`More actions for ${category.name}`}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        <MenuItem
          onClick={() => {
            close();
            onEdit(category);
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            onDelete(category);
          }}
          sx={{ color: 'error.main' }}
        >
          Delete
        </MenuItem>
      </Menu>
    </>
  );
}

export function CategoriesPage() {
  const categories = useCategories();
  const del = useDeleteCategory();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryPublic | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (c: CategoryPublic) => {
    setEditing(c);
    setDialogOpen(true);
  };
  const handleDelete = (c: CategoryPublic) => {
    const hint =
      categories.data?.some((x) => x.parentCategoryId === c.id)
        ? ' Its subcategories will become top-level.'
        : '';
    if (window.confirm(`Delete "${c.name}"? Its transactions become uncategorized.${hint}`)) {
      del.mutate(c.id);
    }
  };

  // Group into parent/children tree, keeping alphabetical order at each level.
  // Orphaned children (parent deleted concurrently) show under their own row.
  const tree = useMemo<TreeNode[]>(() => {
    if (!categories.data) return [];
    const byId = new Map(categories.data.map((c) => [c.id, c]));
    const parents = categories.data
      .filter((c) => c.parentCategoryId === null || !byId.has(c.parentCategoryId))
      .sort((a, b) => a.name.localeCompare(b.name));
    return parents.map((parent) => ({
      parent,
      children: categories.data!
        .filter((c) => c.parentCategoryId === parent.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [categories.data]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="h4" component="h1">
            Categories
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Group your spending. Nest subcategories one level deep — the
            dashboard rolls them into their parent.
          </Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Add category
        </Button>
      </Stack>

      {categories.isPending && (
        <PageLoader />
      )}

      {categories.isError && (
        <Alert severity="error">
          Couldn&apos;t load categories: {(categories.error as Error).message}
        </Alert>
      )}

      {categories.data && categories.data.length === 0 && (
        <EmptyState
          icon={<CategoryOutlinedIcon />}
          title="No categories yet"
          description="Categories seed on signup. If you see this, your account may need a category seeded manually."
          action={{ label: 'Add category', onClick: openCreate }}
        />
      )}

      {tree.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Category</TableCell>
                <TableCell>Color</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {tree.map(({ parent, children }) => (
                // Group parent + its children under one keyed Fragment so
                // React can identify each subtree during re-renders.
                <Fragment key={parent.id}>
                  <TableRow hover>
                    <TableCell>
                      <Chip
                        label={parent.name}
                        size="small"
                        sx={{
                          backgroundColor: parent.color + '22',
                          color: parent.color,
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: 'monospace' }}
                      >
                        {parent.color}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ width: 40 }}>
                      <RowActions category={parent} onEdit={openEdit} onDelete={handleDelete} />
                    </TableCell>
                  </TableRow>
                  {children.map((child) => (
                    <TableRow key={child.id} hover>
                      <TableCell sx={{ pl: 6 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <SubdirectoryArrowRightIcon
                            fontSize="small"
                            sx={{ color: 'text.disabled' }}
                          />
                          <Chip
                            label={child.name}
                            size="small"
                            sx={{
                              backgroundColor: child.color + '22',
                              color: child.color,
                              fontWeight: 500,
                            }}
                          />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontFamily: 'monospace' }}
                        >
                          {child.color}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ width: 40 }}>
                        <RowActions category={child} onEdit={openEdit} onDelete={handleDelete} />
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CategoryFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        categories={categories.data ?? []}
        editing={editing}
      />
    </Stack>
  );
}
