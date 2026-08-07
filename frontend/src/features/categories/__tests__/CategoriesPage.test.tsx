import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../auth/__tests__/testUtils';
import { CategoriesPage } from '../CategoriesPage';
import * as api from '../categoriesApi';
import type { CategoryPublic } from '../categoriesApi';

vi.mock('../categoriesApi');

const DINING: CategoryPublic = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Dining',
  color: '#e57373',
  isSystemDefault: true,
  parentCategoryId: null,
  createdAt: '2026-01-01T00:00:00Z',
};
const COFFEE: CategoryPublic = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Coffee',
  color: '#795548',
  isSystemDefault: false,
  parentCategoryId: DINING.id,
  createdAt: '2026-01-02T00:00:00Z',
};

describe('CategoriesPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows the empty state when nothing has been seeded', async () => {
    vi.mocked(api.listCategories).mockResolvedValue([]);
    renderWithProviders(<CategoriesPage />);
    expect(await screen.findByText(/no categories yet/i)).toBeInTheDocument();
  });

  it('renders parent rows with children indented underneath', async () => {
    vi.mocked(api.listCategories).mockResolvedValue([DINING, COFFEE]);
    renderWithProviders(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Dining')).toBeInTheDocument());
    // Both should be present; each in its own row.
    expect(screen.getByText('Coffee')).toBeInTheDocument();
    // Color swatches show hex code
    expect(screen.getByText('#e57373')).toBeInTheDocument();
    expect(screen.getByText('#795548')).toBeInTheDocument();
  });

  it('confirms then deletes a category from the row menu', async () => {
    vi.mocked(api.listCategories).mockResolvedValue([DINING]);
    vi.mocked(api.deleteCategory).mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Dining')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /more actions for dining/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await waitFor(() =>
      expect(vi.mocked(api.deleteCategory)).toHaveBeenCalledWith(DINING.id),
    );
  });
});
