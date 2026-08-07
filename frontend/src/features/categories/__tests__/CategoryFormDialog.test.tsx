import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../auth/__tests__/testUtils';
import { CategoryFormDialog } from '../CategoryFormDialog';
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

describe('CategoryFormDialog (create)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects an empty name', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CategoryFormDialog open onClose={() => undefined} categories={[DINING]} />,
    );
    await user.click(screen.getByRole('button', { name: /^create$/i }));
    expect(await screen.findByText(/required/i)).toBeInTheDocument();
    expect(vi.mocked(api.createCategory)).not.toHaveBeenCalled();
  });

  it('submits parentCategoryId=null when "Top-level" is chosen', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    vi.mocked(api.createCategory).mockResolvedValue({
      id: 'new',
      name: 'Snacks',
      color: '#8d6e63',
      isSystemDefault: false,
      parentCategoryId: null,
      createdAt: '2026-07-01T00:00:00Z',
    });

    renderWithProviders(
      <CategoryFormDialog open onClose={onClose} categories={[DINING]} />,
    );

    await user.type(screen.getByLabelText(/^name$/i), 'Snacks');
    await user.clear(screen.getByLabelText(/^color$/i));
    await user.type(screen.getByLabelText(/^color$/i), '#8d6e63');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(vi.mocked(api.createCategory)).toHaveBeenCalled());
    const call = vi.mocked(api.createCategory).mock.calls[0]!;
    expect(call[0]).toMatchObject({
      name: 'Snacks',
      color: '#8d6e63',
      parentCategoryId: null,
    });
    // Idempotency-Key
    expect(call[1]).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
