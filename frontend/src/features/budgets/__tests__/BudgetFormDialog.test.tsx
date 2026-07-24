import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../auth/__tests__/testUtils';
import { BudgetFormDialog } from '../BudgetFormDialog';
import * as api from '../budgetsApi';
import type { CategoryPublic } from '../../categories/categoriesApi';

vi.mock('../budgetsApi');

const CAT: CategoryPublic = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Dining',
  color: '#e57373',
  isSystemDefault: true,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('BudgetFormDialog (create)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects an empty amount', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BudgetFormDialog
        open
        onClose={() => undefined}
        month="2026-07"
        categories={[CAT]}
        existing={[]}
      />,
    );
    // Pick a category so category error doesn't shadow the amount error.
    await user.click(screen.getByLabelText(/category/i));
    await user.click(await screen.findByRole('option', { name: /dining/i }));
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(await screen.findByText(/required/i)).toBeInTheDocument();
    expect(vi.mocked(api.upsertBudget)).not.toHaveBeenCalled();
  });

  it('submits and closes on success', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    vi.mocked(api.upsertBudget).mockResolvedValue({
      budgetId: 'b1',
      categoryId: CAT.id,
      categoryName: CAT.name,
      color: CAT.color,
      month: '2026-07-01',
      amountLimit: '500.00',
      amountSpent: '0.00',
      amountRemaining: '500.00',
      percentUsed: 0,
      isOverBudget: false,
    });

    renderWithProviders(
      <BudgetFormDialog
        open
        onClose={onClose}
        month="2026-07"
        categories={[CAT]}
        existing={[]}
      />,
    );

    await user.click(screen.getByLabelText(/category/i));
    await user.click(await screen.findByRole('option', { name: /dining/i }));
    await user.type(screen.getByLabelText(/monthly limit/i), '500');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() =>
      expect(vi.mocked(api.upsertBudget)).toHaveBeenCalledWith({
        month: '2026-07',
        categoryId: CAT.id,
        amountLimit: '500',
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
